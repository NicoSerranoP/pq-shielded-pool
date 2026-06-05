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
    let h0: Blake2sHash = Serde::deserialize(ref proof_data).unwrap();
    let h1: Blake2sHash = Serde::deserialize(ref proof_data).unwrap();
    let h2: Blake2sHash = Serde::deserialize(ref proof_data).unwrap();
    let h3: Blake2sHash = Serde::deserialize(ref proof_data).unwrap();
    let [w00, _w01, _w02, _w03, _w04, _w05, _w06, _w07] = h0.hash.unbox();
    let [w10, _w11, _w12, _w13, _w14, _w15, _w16, _w17] = h1.hash.unbox();
    let [w20, _w21, _w22, _w23, _w24, _w25, _w26, _w27] = h2.hash.unbox();
    let [w30, _w31, _w32, _w33, _w34, _w35, _w36, _w37] = h3.hash.unbox();

    let mut output = ArrayTrait::new();
    output.append(408);
    output.append(input_len.into());
    output.append(proof_data.len().into());
    output.append(config.pow_bits.into());
    output.append(commitments_len.into());
    output.append(w00.into() + w10.into() + w20.into() + w30.into());
    output
}
