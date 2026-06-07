// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Bucketed linked-list set for random-looking uint256 nullifiers.
/// @dev Uses the most-significant NUM_BITS_NULLIFIER_BUCKET bits as bucket id.
abstract contract BucketedNullifierSet {
    // -------------------------------------------------------------------------
    // Tunable parameters
    // -------------------------------------------------------------------------

    /// @notice Number of most-significant bits used to choose the bucket.
    /// Example: 16 gives 2^16 logical buckets.
    uint256 public constant NUM_BITS_NULLIFIER_BUCKET = 16;

    /// @notice Number of uint256 values stored in each linked-list node.
    /// Must fit in uint8 because Node.len is uint8.
    uint256 public constant LL_OBJ_SIZE = 8;

    // -------------------------------------------------------------------------
    // Data structures
    // -------------------------------------------------------------------------

    /// @notice Per-bucket metadata.
    /// @dev node id 0 is the null pointer.
    struct Bucket {
        uint64 head;
        uint64 tail;
    }

    /// @notice A linked-list node containing several nullifiers.
    /// @dev next == 0 means no next node.
    struct Node {
        uint64 next;
        uint8 len;
        uint256[LL_OBJ_SIZE] values;
    }

    mapping(uint256 bucketId => Bucket bucket) private _buckets;
    mapping(uint64 nodeId => Node node) private _nodes;

    /// @dev Node id 0 is reserved as null. First allocated node is 1.
    uint64 private _nextNodeId = 1;

    // -------------------------------------------------------------------------
    // Errors / events
    // -------------------------------------------------------------------------

    error NullifierAlreadyInserted(uint256 nullifier);
    error InvalidLinkedListState();

    event NullifierPushed(uint256 indexed nullifier, uint256 indexed bucketId, uint64 indexed nodeId);

    /// @notice Insert a nullifier into the set.
    /// @dev Reverts if the nullifier already exists.
    function _pushNullifier(uint256 nullifier) internal {
        uint256 bucketId = bucketOf(nullifier);
        Bucket storage bucket = _buckets[bucketId];

        if (bucket.head == 0) {
            uint64 nodeId = _allocateNode(nullifier);
            bucket.head = nodeId;
            bucket.tail = nodeId;

            emit NullifierPushed(nullifier, bucketId, nodeId);
            return;
        }

        if (_containsInBucket(bucket, nullifier)) {
            revert NullifierAlreadyInserted(nullifier);
        }

        Node storage tailNode = _nodes[bucket.tail];

        if (tailNode.len < LL_OBJ_SIZE) {
            uint256 index = uint256(tailNode.len);
            tailNode.values[index] = nullifier;
            tailNode.len = uint8(index + 1);

            emit NullifierPushed(nullifier, bucketId, bucket.tail);
        } else {
            uint64 newNodeId = _allocateNode(nullifier);
            tailNode.next = newNodeId;
            bucket.tail = newNodeId;

            emit NullifierPushed(nullifier, bucketId, newNodeId);
        }
    }

    /// @notice Returns true iff `nullifier` has been inserted.
    function contains(uint256 nullifier) public view returns (bool) {
        uint256 bucketId = bucketOf(nullifier);
        Bucket storage bucket = _buckets[bucketId];

        if (bucket.head == 0) {
            return false;
        }

        return _containsInBucket(bucket, nullifier);
    }

    /// @notice Returns the bucket id for a nullifier.
    function bucketOf(uint256 nullifier) public pure returns (uint256) {
        if (NUM_BITS_NULLIFIER_BUCKET == 0) {
            return 0;
        }

        return nullifier >> (256 - NUM_BITS_NULLIFIER_BUCKET);
    }

    /// @notice Convenience function for inspecting a bucket.
    function bucketInfo(uint256 bucketId) public view returns (uint64 head, uint64 tail) {
        Bucket storage bucket = _buckets[bucketId];
        return (bucket.head, bucket.tail);
    }

    /// @notice Convenience function for inspecting a node.
    function nodeInfo(uint64 nodeId) public view returns (uint64 next, uint8 len, uint256[LL_OBJ_SIZE] memory values) {
        Node storage node = _nodes[nodeId];
        return (node.next, node.len, node.values);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    function _allocateNode(uint256 firstValue) internal returns (uint64 nodeId) {
        nodeId = _nextNodeId;
        _nextNodeId = nodeId + 1;

        Node storage node = _nodes[nodeId];
        node.len = 1;
        node.values[0] = firstValue;
    }

    function _containsInBucket(Bucket storage bucket, uint256 nullifier) internal view returns (bool) {
        uint64 nodeId = bucket.head;

        while (nodeId != 0) {
            Node storage node = _nodes[nodeId];

            uint256 len = uint256(node.len);
            for (uint256 i = 0; i < len; ) {
                if (node.values[i] == nullifier) {
                    return true;
                }

                unchecked {
                    ++i;
                }
            }

            nodeId = node.next;
        }

        return false;
    }
}
