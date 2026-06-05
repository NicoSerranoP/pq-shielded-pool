mod lib;
mod types;
mod constants;

use std::hash::poseidon2_permutation;
use crate::lib::{binary_merkle_root, poseidon2};
use crate::types::{Note, MerkleProof, Return};
use crate::constants::{MAX_DEPTH, MAX_NEW_NOTES, NOTE_COMMITMENT_DOMAIN};

fn main(
    old_note: Note,
    new_notes: [Note; MAX_NEW_NOTES],
    merkle_proof: MerkleProof,
    published_root: pub Field,
) -> pub Return {
    let old_commitment = poseidon2_permutation([
        NOTE_COMMITMENT_DOMAIN,
        old_note.value as Field,
        old_note.owner,
        old_note.nonce,
    ], 4)[0];

    let computed_root = binary_merkle_root::<MAX_DEPTH>(
        poseidon2,
        old_commitment,
        merkle_proof.length,
        merkle_proof.indices,
        merkle_proof.siblings,
    );

    assert(computed_root == published_root, "Computed root does not match the published root");

    let mut remaining_value: u32 = old_note.value;

    let mut new_commitments: [Field; MAX_NEW_NOTES] = [0; MAX_NEW_NOTES];

    for i in 0..MAX_NEW_NOTES {
        let note = new_notes[i];
        let new_commitment = poseidon2_permutation([
            NOTE_COMMITMENT_DOMAIN,
            note.value as Field,
            note.owner,
            note.nonce
        ], 4)[0];

        new_commitments[i] = new_commitment;

        remaining_value -= note.value;
    }

    assert(remaining_value >= 0, "Remaining value must be non-negative");

    Return::new(new_commitments)
}
