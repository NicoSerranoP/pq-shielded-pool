use crate::constants::{MAX_DEPTH, MERKLE_TREE_DOMAIN};
use std::hash::poseidon2_permutation;

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

            let (left, right) = if indices[i] {
                (sibling, node)
            } else {
                (node, sibling)
            };

            node = hasher([left, right]);
        }
    }

    node
}

/*
* A poseidon wrapper that takes domain value, 1st input, 2nd input and zero for padding.
* The poseidon2 blackbox expects 4 fields
* This prevents collision between domains in merkle tree, note commitments and nullifiers
*
* @params xs: an array of 2 fields to be hashed
*
* @returns the poseidon hash
*/
pub fn poseidon2(xs: [Field; 2]) -> Field {
    poseidon2_permutation([MERKLE_TREE_DOMAIN, xs[0], xs[1], 0], 4)[0]
}
