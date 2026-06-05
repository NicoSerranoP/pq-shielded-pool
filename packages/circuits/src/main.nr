mod lib;
mod types;
mod constants;

use crate::constants::{MAX_DEPTH, MAX_NEW_NOTES, NOTE_COMMITMENT_DOMAIN, NULLIFIER_DOMAIN};
use crate::lib::{binary_merkle_root, poseidon2};
use crate::types::{MerkleProof, Note, Signature};
use std::ecdsa_secp256r1::verify_signature;
use std::field::bytes32_to_field;
use std::hash::poseidon2_permutation;

pub fn main(
    signature: Signature,
    old_note: Note,
    new_notes: [Note; MAX_NEW_NOTES],
    merkle_proof: MerkleProof,
    nullifier: pub Field,
    new_notes_commitments: pub [Field; MAX_NEW_NOTES],
    published_root: pub Field,
) {
    let valid_signature = verify_signature(
        signature.pub_key_x,
        signature.pub_key_y,
        signature.signature,
        signature.hashed_message,
    );

    assert(valid_signature, "Invalid signature");

    let pub_key_x_field = bytes32_to_field(signature.pub_key_x);
    let pub_key_y_field = bytes32_to_field(signature.pub_key_y);
    let old_owner = poseidon2_permutation([pub_key_x_field, pub_key_y_field, 0, 0], 4)[0];

    assert(old_owner == old_note.owner, "Old note owner mismatch");

    let old_commitment = poseidon2_permutation(
        [NOTE_COMMITMENT_DOMAIN, old_note.value as Field, old_note.owner, old_note.nonce],
        4,
    )[0];

    let computed_nullifier = poseidon2_permutation(
        [NULLIFIER_DOMAIN, old_note.value as Field, old_note.owner, old_note.nonce],
        4,
    )[0];

    assert(computed_nullifier == nullifier, "Nullifiers mismatch");

    let computed_root = binary_merkle_root::<MAX_DEPTH>(
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
        let new_commitment = poseidon2_permutation(
            [NOTE_COMMITMENT_DOMAIN, note.value as Field, note.owner, note.nonce],
            4,
        )[0];

        assert(new_commitment == new_notes_commitments[i], "New commitment mismatch");

        remaining_value -= note.value;
    }

    assert(remaining_value >= 0, "Remaining value must be >= 0");
}
