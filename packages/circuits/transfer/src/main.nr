use shared::constants::{MAX_NEW_NOTES, NOTE_COMMITMENT_DOMAIN, NULLIFIER_DOMAIN};
use shared::merkle::{binary_merkle_root, poseidon2};
use shared::types::{MerkleProof, Note};
use std::hash::poseidon2_permutation;

pub fn main(
    old_note: Note,
    new_notes: [Note; MAX_NEW_NOTES],
    merkle_proof: MerkleProof,
    nullifier: pub Field,
    new_notes_commitments: pub [Field; MAX_NEW_NOTES],
    published_root: pub Field,
) {
    let computed_nullifier = poseidon2_permutation(
        [NULLIFIER_DOMAIN, old_note.value as Field, old_note.owner, old_note.nonce],
        4,
    )[0];

    assert(computed_nullifier == nullifier, "Nullifiers mismatch");

    let old_precommitment = poseidon2_permutation(
        [old_note.value as Field, old_note.owner, old_note.nonce, old_note.asset as Field],
        4,
    )[0];

    let old_commitment =
        poseidon2_permutation([NOTE_COMMITMENT_DOMAIN, old_precommitment, 0, 0], 4)[0];

    let computed_root = binary_merkle_root(
        poseidon2,
        old_commitment,
        merkle_proof.length,
        merkle_proof.indices,
        merkle_proof.siblings,
    );

    assert(computed_root == published_root, "Roots mismatch");

    let mut remaining_value: u32 = old_note.value;

    for i in 0..MAX_NEW_NOTES {
        let note = new_notes[i];

        let new_precommitment = poseidon2_permutation(
            [note.value as Field, note.owner, note.nonce, note.asset as Field],
            4,
        )[0];

        let new_commitment =
            poseidon2_permutation([NOTE_COMMITMENT_DOMAIN, new_precommitment, 0, 0], 4)[0];

        assert(new_commitment == new_notes_commitments[i], "New commitment mismatch");

        remaining_value -= note.value;
    }

    assert(remaining_value >= 0, "Remaining value must be >= 0");
}
