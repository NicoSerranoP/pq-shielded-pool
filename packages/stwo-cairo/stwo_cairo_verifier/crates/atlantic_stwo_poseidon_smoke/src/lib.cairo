use core::poseidon::poseidon_hash_span;

#[inline(never)]
#[executable]
pub fn main(input: Array<felt252>) -> Array<felt252> {
    let mut values: Array<felt252> = array![1, 2, 3];
    values.append(input.len().into());
    let digest = poseidon_hash_span(values.span());

    let mut output = ArrayTrait::new();
    output.append(input.len().into());
    output.append(digest);
    output
}
