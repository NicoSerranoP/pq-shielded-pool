// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Poseidon2T4 } from "./Poseidon2T4.sol";
import { SNARK_SCALAR_FIELD } from "@zk-kit/lean-imt.sol/Constants.sol";
import { LeanIMTData } from "@zk-kit/lean-imt.sol/InternalLeanIMT.sol";

/// @title InternalLeanIMT using Poseidon2 (t=4) as hash function.
/// @dev Fork of @zk-kit/lean-imt.sol InternalLeanIMT replacing PoseidonT3 with Poseidon2T4.
///      All hash calls replaced with Poseidon2T4.hash(left, right).
library InternalLeanIMTPoseidon2 {
    error WrongSiblingNodes();
    error LeafGreaterThanSnarkScalarField();
    error LeafCannotBeZero();
    error LeafAlreadyExists();
    error LeafDoesNotExist();

    function _insert(LeanIMTData storage self, uint256 leaf) internal returns (uint256) {
        if (leaf >= SNARK_SCALAR_FIELD) revert LeafGreaterThanSnarkScalarField();
        if (leaf == 0) revert LeafCannotBeZero();
        if (_has(self, leaf)) revert LeafAlreadyExists();

        uint256 index = self.size;
        uint256 treeDepth = self.depth;

        if (2 ** treeDepth < index + 1) {
            ++treeDepth;
        }

        self.depth = treeDepth;

        uint256 node = leaf;

        for (uint256 level = 0; level < treeDepth; ) {
            if ((index >> level) & 1 == 1) {
                node = Poseidon2T4.hash(self.sideNodes[level], node);
            } else {
                self.sideNodes[level] = node;
            }
            unchecked { ++level; }
        }

        self.size = ++index;
        self.sideNodes[treeDepth] = node;
        self.leaves[leaf] = index;

        return node;
    }

    function _insertMany(LeanIMTData storage self, uint256[] calldata leaves) internal returns (uint256) {
        uint256 treeSize = self.size;

        for (uint256 i = 0; i < leaves.length; ) {
            if (leaves[i] >= SNARK_SCALAR_FIELD) revert LeafGreaterThanSnarkScalarField();
            if (leaves[i] == 0) revert LeafCannotBeZero();
            if (_has(self, leaves[i])) revert LeafAlreadyExists();
            self.leaves[leaves[i]] = treeSize + 1 + i;
            unchecked { ++i; }
        }

        uint256[] memory currentLevelNewNodes = leaves;
        uint256 treeDepth = self.depth;

        while (2 ** treeDepth < treeSize + leaves.length) {
            ++treeDepth;
        }
        self.depth = treeDepth;

        uint256 currentLevelStartIndex = treeSize;
        uint256 currentLevelSize = treeSize + leaves.length;
        uint256 nextLevelStartIndex = currentLevelStartIndex >> 1;
        uint256 nextLevelSize = ((currentLevelSize - 1) >> 1) + 1;

        for (uint256 level = 0; level < treeDepth; ) {
            uint256 numberOfNewNodes = nextLevelSize - nextLevelStartIndex;
            uint256[] memory nextLevelNewNodes = new uint256[](numberOfNewNodes);

            for (uint256 i = 0; i < numberOfNewNodes; ) {
                uint256 leftNode;
                if ((i + nextLevelStartIndex) * 2 < currentLevelStartIndex) {
                    leftNode = self.sideNodes[level];
                } else {
                    leftNode = currentLevelNewNodes[(i + nextLevelStartIndex) * 2 - currentLevelStartIndex];
                }

                uint256 rightNode;
                if ((i + nextLevelStartIndex) * 2 + 1 < currentLevelSize) {
                    rightNode = currentLevelNewNodes[(i + nextLevelStartIndex) * 2 + 1 - currentLevelStartIndex];
                }

                uint256 parentNode;
                if (rightNode != 0) {
                    parentNode = Poseidon2T4.hash(leftNode, rightNode);
                } else {
                    parentNode = leftNode;
                }

                nextLevelNewNodes[i] = parentNode;
                unchecked { ++i; }
            }

            if (currentLevelSize & 1 == 1) {
                self.sideNodes[level] = currentLevelNewNodes[currentLevelNewNodes.length - 1];
            } else if (currentLevelNewNodes.length > 1) {
                self.sideNodes[level] = currentLevelNewNodes[currentLevelNewNodes.length - 2];
            }

            currentLevelStartIndex = nextLevelStartIndex;
            nextLevelStartIndex >>= 1;
            currentLevelNewNodes = nextLevelNewNodes;
            currentLevelSize = nextLevelSize;
            nextLevelSize = ((nextLevelSize - 1) >> 1) + 1;
            unchecked { ++level; }
        }

        self.size = treeSize + leaves.length;
        self.sideNodes[treeDepth] = currentLevelNewNodes[0];
        return currentLevelNewNodes[0];
    }

    function _update(
        LeanIMTData storage self,
        uint256 oldLeaf,
        uint256 newLeaf,
        uint256[] calldata siblingNodes
    ) internal returns (uint256) {
        if (newLeaf >= SNARK_SCALAR_FIELD) revert LeafGreaterThanSnarkScalarField();
        if (!_has(self, oldLeaf)) revert LeafDoesNotExist();
        if (_has(self, newLeaf)) revert LeafAlreadyExists();

        uint256 index = _indexOf(self, oldLeaf);
        uint256 node = newLeaf;
        uint256 oldRoot = oldLeaf;
        uint256 lastIndex = self.size - 1;
        uint256 i = 0;
        uint256 treeDepth = self.depth;

        for (uint256 level = 0; level < treeDepth; ) {
            if ((index >> level) & 1 == 1) {
                if (siblingNodes[i] >= SNARK_SCALAR_FIELD) revert LeafGreaterThanSnarkScalarField();
                node = Poseidon2T4.hash(siblingNodes[i], node);
                oldRoot = Poseidon2T4.hash(siblingNodes[i], oldRoot);
                unchecked { ++i; }
            } else {
                if (index >> level != lastIndex >> level) {
                    if (siblingNodes[i] >= SNARK_SCALAR_FIELD) revert LeafGreaterThanSnarkScalarField();
                    if (self.sideNodes[level] == oldRoot) {
                        self.sideNodes[level] = node;
                    }
                    node = Poseidon2T4.hash(node, siblingNodes[i]);
                    oldRoot = Poseidon2T4.hash(oldRoot, siblingNodes[i]);
                    unchecked { ++i; }
                } else {
                    self.sideNodes[level] = node;
                }
            }
            unchecked { ++level; }
        }

        if (oldRoot != _root(self)) revert WrongSiblingNodes();

        self.sideNodes[treeDepth] = node;

        if (newLeaf != 0) {
            self.leaves[newLeaf] = self.leaves[oldLeaf];
        }
        self.leaves[oldLeaf] = 0;

        return node;
    }

    function _remove(
        LeanIMTData storage self,
        uint256 oldLeaf,
        uint256[] calldata siblingNodes
    ) internal returns (uint256) {
        return _update(self, oldLeaf, 0, siblingNodes);
    }

    function _has(LeanIMTData storage self, uint256 leaf) internal view returns (bool) {
        return self.leaves[leaf] != 0;
    }

    function _indexOf(LeanIMTData storage self, uint256 leaf) internal view returns (uint256) {
        if (self.leaves[leaf] == 0) revert LeafDoesNotExist();
        return self.leaves[leaf] - 1;
    }

    function _root(LeanIMTData storage self) internal view returns (uint256) {
        return self.sideNodes[self.depth];
    }
}
