use stwo_cairo_air::CairoProof;
use stwo_verifier_utils::blake2s::encode_and_hash_memory_section;

#[inline(never)]
#[executable]
pub fn main(input: Array<felt252>) -> Array<felt252> {
    let mut proof_data = input.span();
    let proof: CairoProof = Serde::deserialize(ref proof_data).unwrap();
    assert(proof_data.len() == 0, 'trailing_proof_data');

    let digest = encode_and_hash_memory_section(proof.claim.public_data.public_memory.program);
    let [w0, w1, w2, w3, w4, w5, w6, w7] = digest.unbox();
    let mut output = ArrayTrait::new();
    output.append(204);
    output.append(w0.into());
    output.append(w1.into());
    output.append(w2.into());
    output.append(w3.into());
    output.append(w4.into());
    output.append(w5.into());
    output.append(w6.into());
    output.append(w7.into());
    output
}
