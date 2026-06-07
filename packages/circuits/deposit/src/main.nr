use shared::constants::NOTE_COMMITMENT_DOMAIN;
use shared::types::Note;
use std::hash::poseidon2_permutation;

pub fn main(note: Note, commitment: pub Field) {
    let computed_commitment = poseidon2_permutation(
        [NOTE_COMMITMENT_DOMAIN, note.value as Field, note.owner, note.nonce],
        4,
    )[0];

    assert(computed_commitment == commitment, "Commitment mismatch");
}

//TODO: add assert(note.value as Field == amount, "Note value does not match deposited amount");