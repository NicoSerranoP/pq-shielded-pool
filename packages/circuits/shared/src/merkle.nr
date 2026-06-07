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
* Poseidon2 hash for Merkle tree nodes.
* Uses domain separator MERKLE_TREE_DOMAIN=1 and pads to t=4 state.
* Must match the on-chain Poseidon2T4.hash implementation.
*/
pub fn poseidon2(xs: [Field; 2]) -> Field {
    poseidon2_permutation([MERKLE_TREE_DOMAIN, xs[0], xs[1], 0], 4)[0]
}
