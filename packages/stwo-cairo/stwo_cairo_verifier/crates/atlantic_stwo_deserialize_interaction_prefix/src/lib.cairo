use stwo_cairo_air::claims::{CairoClaim, CairoInteractionClaim};

#[inline(never)]
#[executable]
pub fn main(input: Array<felt252>) -> Array<felt252> {
    let input_len = input.len();
    let mut proof_data = input.span();
    let _claim: CairoClaim = Serde::deserialize(ref proof_data).unwrap();
    let interaction_pow: u64 = Serde::deserialize(ref proof_data).unwrap();
    let _interaction_claim: CairoInteractionClaim = Serde::deserialize(ref proof_data).unwrap();

    let mut output = ArrayTrait::new();
    output.append(302);
    output.append(input_len.into());
    output.append(proof_data.len().into());
    output.append(interaction_pow.into());
    output
}
