use stwo_cairo_air::{CairoProof, debug_verify_claim_uses};

#[inline(never)]
#[executable]
pub fn main(input: Array<felt252>) -> Array<felt252> {
    let mut proof_data = input.span();
    let proof: CairoProof = Serde::deserialize(ref proof_data).unwrap();
    assert(proof_data.len() == 0, 'trailing_proof_data');

    debug_verify_claim_uses(proof)
}
