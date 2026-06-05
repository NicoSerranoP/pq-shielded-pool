use stwo_cairo_air::INTERACTION_POW_BITS;

#[inline(never)]
#[executable]
pub fn main(input: Array<felt252>) -> Array<felt252> {
    let mut output = ArrayTrait::new();
    output.append(input.len().into());
    output.append(INTERACTION_POW_BITS.into());
    output.append(823984307);
    output
}
