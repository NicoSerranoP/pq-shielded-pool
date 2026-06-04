const INPUT_LEN: usize = 10;
const M31: u128 = 2147483647;
const EXPECTED_FIXTURE_ROOT: u128 = 823984307;

pub fn toy_hash(left: u128, right: u128, domain: u128) -> u128 {
    (left * left + right * right * 7 + left * 3 + right * 5 + 11 + domain) % M31
}

fn fold_level(current: u128, sibling: u128, index: u128) -> u128 {
    assert(index == 0 || index == 1, 'invalid_index');

    if index == 0 {
        toy_hash(current, sibling, 0)
    } else {
        toy_hash(sibling, current, 0)
    }
}

pub fn compute_merkle_root(
    leaf_left: u128,
    leaf_right: u128,
    sibling_0: u128,
    index_0: u128,
    sibling_1: u128,
    index_1: u128,
    sibling_2: u128,
    index_2: u128,
    sibling_3: u128,
    index_3: u128,
) -> u128 {
    let mut current = toy_hash(leaf_left, leaf_right, 1);
    current = fold_level(current, sibling_0, index_0);
    current = fold_level(current, sibling_1, index_1);
    current = fold_level(current, sibling_2, index_2);
    fold_level(current, sibling_3, index_3)
}

pub fn fixture_root() -> u128 {
    compute_merkle_root(10, 11, 20, 0, 30, 1, 40, 0, 50, 1)
}

fn read_u128(ref input: Array<felt252>) -> u128 {
    input.pop_front().unwrap().try_into().unwrap()
}

pub fn main(mut input: Array<felt252>) -> Array<felt252> {
    assert(input.len() == INPUT_LEN, 'bad_input_len');

    let leaf_left = read_u128(ref input);
    let leaf_right = read_u128(ref input);
    let sibling_0 = read_u128(ref input);
    let index_0 = read_u128(ref input);
    let sibling_1 = read_u128(ref input);
    let index_1 = read_u128(ref input);
    let sibling_2 = read_u128(ref input);
    let index_2 = read_u128(ref input);
    let sibling_3 = read_u128(ref input);
    let index_3 = read_u128(ref input);

    let root = compute_merkle_root(
        leaf_left,
        leaf_right,
        sibling_0,
        index_0,
        sibling_1,
        index_1,
        sibling_2,
        index_2,
        sibling_3,
        index_3,
    );

    let mut output: Array<felt252> = ArrayTrait::new();
    output.append(root.into());
    output
}

#[cfg(test)]
mod tests {
    use super::{EXPECTED_FIXTURE_ROOT, fixture_root};

    #[test]
    fn fixture_root_matches_stwo_example() {
        assert(fixture_root() == EXPECTED_FIXTURE_ROOT, 'bad_fixture_root');
    }
}
