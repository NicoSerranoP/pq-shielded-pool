use stwo_cairo_air::{CairoProof, VerificationOutput, get_verification_output, verify_cairo};

fn verify_proof(proof: CairoProof) -> VerificationOutput {
    let verification_output = get_verification_output(proof: @proof);

    verify_cairo(:proof);

    verification_output
}

#[inline(never)]
#[executable]
fn main_structured(proof: CairoProof) -> VerificationOutput {
    verify_proof(proof)
}

#[inline(never)]
#[executable]
fn main(input: Array<felt252>) -> Array<felt252> {
    let mut proof_data = input.span();
    let proof: CairoProof = Serde::deserialize(ref proof_data).unwrap();
    assert(proof_data.len() == 0, 'trailing_proof_data');

    let VerificationOutput { program_hash, output } = verify_proof(proof);
    let mut flattened = ArrayTrait::new();
    flattened.append(program_hash);

    let mut output = output;
    while output.len() != 0 {
        flattened.append(output.pop_front().unwrap());
    };

    flattened
}
