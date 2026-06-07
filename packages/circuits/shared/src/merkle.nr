use crate::constants::MAX_DEPTH;
use crate::poseidon_t3;

/*
* A binary merkle root implementation using Noir version 1.0.0-beta.19
*
* Inspired by: https://github.com/zk-kit/zk-kit.noir/tree/main/packages/binary-merkle-root
*/
pub fn binary_merkle_root(
    hasher: fn([Field; 2]) -> Field,
    leaf: Field,
    depth: u32,
    indices: [bool; MAX_DEPTH],
    siblings: [Field; MAX_DEPTH],
) -> Field {
    let mut node = leaf;

    for i in 0..MAX_DEPTH {
        if i < depth {
            let sibling = siblings[i];

            if sibling == 0 {
                assert(!indices[i], "Right node cannot have missing left sibling");
            } else {
                let (left, right) = if indices[i] {
                    (sibling, node)
                } else {
                    (node, sibling)
                };

                node = hasher([left, right]);
            }
        }
    }

    node
}

/*
* LeanIMT uses poseidon-solidity's PoseidonT3 hash for parent nodes.
*
* @params xs: an array of 2 fields to be hashed
*
* @returns the poseidon hash
*/
pub fn poseidon_t3(xs: [Field; 2]) -> Field {
    poseidon_t3::hash(xs)
}

// Backwards-compatible alias while transfer/withdraw imports are migrated.
pub fn poseidon2(xs: [Field; 2]) -> Field {
    poseidon_t3(xs)
}
