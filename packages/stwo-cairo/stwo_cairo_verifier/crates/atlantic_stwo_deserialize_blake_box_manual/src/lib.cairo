use stwo_cairo_air::claims::{CairoClaim, CairoInteractionClaim};
use stwo_verifier_core::pcs::PcsConfig;

use core::box::BoxImpl;

#[inline(never)]
#[executable]
pub fn main(input: Array<felt252>) -> Array<felt252> {
    let input_len = input.len();
    let mut proof_data = input.span();
    let _claim: CairoClaim = Serde::deserialize(ref proof_data).unwrap();
    let _interaction_pow: u64 = Serde::deserialize(ref proof_data).unwrap();
    let _interaction_claim: CairoInteractionClaim = Serde::deserialize(ref proof_data).unwrap();
    let config: PcsConfig = Serde::deserialize(ref proof_data).unwrap();
    let commitments_len: usize = Serde::deserialize(ref proof_data).unwrap();
    let w0: u32 = Serde::deserialize(ref proof_data).unwrap();
    let w1: u32 = Serde::deserialize(ref proof_data).unwrap();
    let w2: u32 = Serde::deserialize(ref proof_data).unwrap();
    let w3: u32 = Serde::deserialize(ref proof_data).unwrap();
    let w4: u32 = Serde::deserialize(ref proof_data).unwrap();
    let w5: u32 = Serde::deserialize(ref proof_data).unwrap();
    let w6: u32 = Serde::deserialize(ref proof_data).unwrap();
    let w7: u32 = Serde::deserialize(ref proof_data).unwrap();
    let boxed = BoxImpl::new([w0, w1, w2, w3, w4, w5, w6, w7]);
    let [v0, v1, v2, v3, v4, v5, v6, v7] = boxed.unbox();

    let mut output = ArrayTrait::new();
    output.append(410);
    output.append(input_len.into());
    output.append(proof_data.len().into());
    output.append(config.pow_bits.into());
    output.append(commitments_len.into());
    output.append(v0.into() + v1.into() + v2.into() + v3.into() + v4.into() + v5.into() + v6.into() + v7.into());
    output
}
