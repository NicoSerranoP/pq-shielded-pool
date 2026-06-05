use stwo_cairo_air::claims::{CairoClaim, CairoInteractionClaim};
use stwo_verifier_core::pcs::PcsConfig;

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
    let mut limb_sum = 0;
    for _ in 0..commitments_len {
        let w0: u32 = Serde::deserialize(ref proof_data).unwrap();
        let w1: u32 = Serde::deserialize(ref proof_data).unwrap();
        let w2: u32 = Serde::deserialize(ref proof_data).unwrap();
        let w3: u32 = Serde::deserialize(ref proof_data).unwrap();
        let w4: u32 = Serde::deserialize(ref proof_data).unwrap();
        let w5: u32 = Serde::deserialize(ref proof_data).unwrap();
        let w6: u32 = Serde::deserialize(ref proof_data).unwrap();
        let w7: u32 = Serde::deserialize(ref proof_data).unwrap();
        limb_sum += w0.into() + w1.into() + w2.into() + w3.into();
        limb_sum += w4.into() + w5.into() + w6.into() + w7.into();
    };

    let mut output = ArrayTrait::new();
    output.append(406);
    output.append(input_len.into());
    output.append(proof_data.len().into());
    output.append(config.pow_bits.into());
    output.append(commitments_len.into());
    output.append(limb_sum);
    output
}
