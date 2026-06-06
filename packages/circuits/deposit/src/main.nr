use shared::constants::NOTE_COMMITMENT_DOMAIN;
use shared::types::Note;
use std::hash::poseidon2_permutation;

pub fn main(note: Note, commitment: pub Field, value: pub u32) {
    let precommitment = poseidon2_permutation(
        [note.value as Field, note.owner, note.nonce, note.asset as Field],
        4,
    )[0];
    let computed_commitment =
        poseidon2_permutation([NOTE_COMMITMENT_DOMAIN, precommitment, 0, 0], 4)[0];

    assert(computed_commitment == commitment, "Commitment mismatch");

    assert(value == note.value, "Value mismatch");
}
