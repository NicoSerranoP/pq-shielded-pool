use stwo_cairo_air::claims::{CairoClaim, CairoInteractionClaim};
use stwo_verifier_core::pcs::PcsConfig;

use stwo_verifier_core::vcs::blake2s_hasher::Blake2sHash;

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
    let _h0: Blake2sHash = Serde::deserialize(ref proof_data).unwrap();

    let mut output = ArrayTrait::new();
    output.append(409);
    output.append(input_len.into());
    output.append(proof_data.len().into());
    output.append(config.pow_bits.into());
    output.append(commitments_len.into());
    output
}
