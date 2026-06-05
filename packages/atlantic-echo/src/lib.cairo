#[inline(never)]
#[executable]
pub fn main(mut input: Array<felt252>) -> Array<felt252> {
    let len = input.len();
    let mut output = ArrayTrait::new();
    output.append(len.into());

    if len != 0 { output.append(input.pop_front().unwrap()); };
    if len > 1 { output.append(input.pop_front().unwrap()); };
    if len > 2 { output.append(input.pop_front().unwrap()); };
    if len > 3 { output.append(input.pop_front().unwrap()); };

    output
}
