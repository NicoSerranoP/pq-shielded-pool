use stwo_cairo_air::claims::{CairoClaim, CairoInteractionClaim};
use stwo_verifier_core::{Hash, TreeArray, TreeSpan};
use stwo_verifier_core::fields::qm31::QM31Serde;
use stwo_verifier_core::pcs::PcsConfig;
use stwo_verifier_core::pcs::verifier::{QueriedValues, SampledValues};
use stwo_verifier_core::vcs::MerkleHasher;
use stwo_verifier_core::vcs::verifier::MerkleDecommitment;

#[inline(never)]
#[executable]
pub fn main(input: Array<felt252>) -> Array<felt252> {
    let input_len = input.len();
    let mut proof_data = input.span();
    let _claim: CairoClaim = Serde::deserialize(ref proof_data).unwrap();
    let _interaction_pow: u64 = Serde::deserialize(ref proof_data).unwrap();
    let _interaction_claim: CairoInteractionClaim = Serde::deserialize(ref proof_data).unwrap();
    let _config: PcsConfig = Serde::deserialize(ref proof_data).unwrap();
    let _commitments: TreeSpan<Hash> = Serde::deserialize(ref proof_data).unwrap();
    let _sampled_values: SampledValues = Serde::deserialize(ref proof_data).unwrap();
    let _decommitments: TreeArray<MerkleDecommitment<MerkleHasher>> = Serde::deserialize(ref proof_data).unwrap();
    let queried_values: QueriedValues = Serde::deserialize(ref proof_data).unwrap();

    let mut output = ArrayTrait::new();
    output.append(404);
    output.append(input_len.into());
    output.append(proof_data.len().into());
    output.append(queried_values.len().into());
    output
}
