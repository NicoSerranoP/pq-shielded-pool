use shared::constants::NOTE_COMMITMENT_DOMAIN;
use shared::merkle::{binary_merkle_root, poseidon2};
use shared::types::{MerkleProof, Note};
use std::hash::poseidon2_permutation;

pub fn main(note: Note, merkle_proof: MerkleProof, value: pub u32, published_root: pub Field) {
    let precommitment = poseidon2_permutation(
        [note.value as Field, note.owner, note.nonce, note.asset as Field],
        4,
    )[0];
    let commitment = poseidon2_permutation([NOTE_COMMITMENT_DOMAIN, precommitment, 0, 0], 4)[0];

    let computed_root = binary_merkle_root(
        poseidon2,
        commitment,
        merkle_proof.length,
        merkle_proof.indices,
        merkle_proof.siblings,
    );

    assert(computed_root == published_root, "Roots mismatch");

    assert(value == note.value, "Value mismatch");
}
