use shared::constants::NOTE_COMMITMENT_DOMAIN;
use shared::types::{Note, Signature};
use std::ecdsa_secp256r1::verify_signature;
use std::field::bytes32_to_field;
use std::hash::poseidon2_permutation;

pub fn main(signature: Signature, note: Note, commitment: pub Field) {
    let valid_signature = verify_signature(
        signature.pub_key_x,
        signature.pub_key_y,
        signature.signature,
        signature.hashed_message,
    );

    assert(valid_signature, "Invalid signature");

    let pub_key_x_field = bytes32_to_field(signature.pub_key_x);
    let pub_key_y_field = bytes32_to_field(signature.pub_key_y);
    let owner = poseidon2_permutation([pub_key_x_field, pub_key_y_field, 0, 0], 4)[0];

    assert(owner == note.owner, "Note owner mismatch");

    let computed_commitment = poseidon2_permutation(
        [NOTE_COMMITMENT_DOMAIN, note.value as Field, note.owner, note.nonce],
        4,
    )[0];

    assert(computed_commitment == commitment, "Commitment mismatch");
}
