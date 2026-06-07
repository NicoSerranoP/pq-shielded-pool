use shared::constants::{NOTE_COMMITMENT_DOMAIN, NULLIFIER_DOMAIN};
use std::hash::poseidon2_permutation;

pub fn main(value: u32, asset: u32, owner: Field, nonce: Field) {
    let precommitment = poseidon2_permutation([value as Field, owner, nonce, asset as Field], 4)[0];
    let commitment = poseidon2_permutation([NOTE_COMMITMENT_DOMAIN, precommitment, 0, 0], 4)[0];
    let nullifier = poseidon2_permutation([NULLIFIER_DOMAIN, value as Field, owner, nonce], 4)[0];

    println(commitment);
    println(nullifier);
}
