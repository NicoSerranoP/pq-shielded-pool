use stwo_cairo_air::claims::CairoClaim;

#[inline(never)]
#[executable]
pub fn main(input: Array<felt252>) -> Array<felt252> {
    let input_len = input.len();
    let mut proof_data = input.span();
    let claim: CairoClaim = Serde::deserialize(ref proof_data).unwrap();

    let public_memory = claim.public_data.public_memory;
    let initial_state = claim.public_data.initial_state;
    let final_state = claim.public_data.final_state;

    let mut output = ArrayTrait::new();
    output.append(301);
    output.append(input_len.into());
    output.append(proof_data.len().into());
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
