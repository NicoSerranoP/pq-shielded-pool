use core::poseidon::poseidon_hash_span;

const INPUT_LEN: usize = 10;
const LEAF_DOMAIN: felt252 = 1;
const NODE_DOMAIN: felt252 = 0;
const EXPECTED_FIXTURE_ROOT: felt252 = -845960492790892884656231863041640742943145074470692494761681786972233302565;

pub fn poseidon_pair_hash(left: felt252, right: felt252, domain: felt252) -> felt252 {
    let mut values: Array<felt252> = ArrayTrait::new();
    values.append(domain);
    values.append(left);
    values.append(right);
    poseidon_hash_span(values.span())
}

fn fold_level(current: felt252, sibling: felt252, index: felt252) -> felt252 {
    assert(index == 0 || index == 1, 'invalid_index');

    if index == 0 {
        poseidon_pair_hash(current, sibling, NODE_DOMAIN)
    } else {
        poseidon_pair_hash(sibling, current, NODE_DOMAIN)
    }
}

pub fn compute_merkle_root(
    leaf_left: felt252,
    leaf_right: felt252,
    sibling_0: felt252,
    index_0: felt252,
    sibling_1: felt252,
    index_1: felt252,
    sibling_2: felt252,
    index_2: felt252,
    sibling_3: felt252,
    index_3: felt252,
) -> felt252 {
    let mut current = poseidon_pair_hash(leaf_left, leaf_right, LEAF_DOMAIN);
    current = fold_level(current, sibling_0, index_0);
    current = fold_level(current, sibling_1, index_1);
    current = fold_level(current, sibling_2, index_2);
    fold_level(current, sibling_3, index_3)
}

pub fn fixture_root() -> felt252 {
    compute_merkle_root(10, 11, 20, 0, 30, 1, 40, 0, 50, 1)
}

fn read_felt(ref input: Array<felt252>) -> felt252 {
    input.pop_front().unwrap()
}

#[executable]
pub fn main(mut input: Array<felt252>) -> Array<felt252> {
    assert(input.len() == INPUT_LEN, 'bad_input_len');

    let leaf_left = read_felt(ref input);
    let leaf_right = read_felt(ref input);
    let sibling_0 = read_felt(ref input);
    let index_0 = read_felt(ref input);
    let sibling_1 = read_felt(ref input);
    let index_1 = read_felt(ref input);
    let sibling_2 = read_felt(ref input);
    let index_2 = read_felt(ref input);
    let sibling_3 = read_felt(ref input);
    let index_3 = read_felt(ref input);

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
    output.append(root);
    output
}

#[cfg(test)]
mod tests {
    use super::{EXPECTED_FIXTURE_ROOT, fixture_root};

    #[test]
    fn fixture_root_matches_expected_poseidon_root() {
        assert(fixture_root() == EXPECTED_FIXTURE_ROOT, 'bad_fixture_root');
    }
}
