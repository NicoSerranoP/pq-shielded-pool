use stwo_cairo_air::CairoProof;

#[inline(never)]
#[executable]
pub fn main(input: Array<felt252>) -> Array<felt252> {
    let input_len = input.len();
    let mut proof_data = input.span();
    let proof: CairoProof = Serde::deserialize(ref proof_data).unwrap();
    let remaining_len = proof_data.len();

    let CairoProof { claim, interaction_pow, interaction_claim: _, stark_proof: _, channel_salt } = proof;
    let public_data = claim.public_data;
    let public_memory = public_data.public_memory;
    let initial_state = public_data.initial_state;
    let final_state = public_data.final_state;

    let mut output = ArrayTrait::new();
    output.append(input_len.into());
    output.append(remaining_len.into());
    output.append(channel_salt.into());
    output.append(interaction_pow.into());
    output.append(public_memory.program.len().into());
    output.append(public_memory.output.len().into());
    output.append(initial_state.pc.into());
    output.append(initial_state.ap.into());
    output.append(initial_state.fp.into());
    output.append(final_state.pc.into());
    output.append(final_state.ap.into());
    output.append(final_state.fp.into());
    output
}
