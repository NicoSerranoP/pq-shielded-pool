use core::poseidon::poseidon_hash_span;

const MAX_DEPTH: usize = 30;
const MAX_NEW_NOTES_FELT: felt252 = 2;
const DEPOSIT_INPUT_LEN: usize = 5;
const TRANSFER_INPUT_LEN: usize = 70;
const WITHDRAW_INPUT_LEN: usize = 66;

pub const DEPOSIT_OUTPUT_KIND: felt252 = 1;
pub const TRANSFER_OUTPUT_KIND: felt252 = 2;
pub const WITHDRAW_OUTPUT_KIND: felt252 = 3;

const MERKLE_TREE_DOMAIN: felt252 = 1;
const NOTE_COMMITMENT_DOMAIN: felt252 = 2;
const NULLIFIER_DOMAIN: felt252 = 3;

fn hash_span4(a: felt252, b: felt252, c: felt252, d: felt252) -> felt252 {
    let mut values: Array<felt252> = ArrayTrait::new();
    values.append(a);
    values.append(b);
    values.append(c);
    values.append(d);
    poseidon_hash_span(values.span())
}

pub fn note_commitment(value: u128, owner: felt252, nonce: felt252) -> felt252 {
    hash_span4(NOTE_COMMITMENT_DOMAIN, value.into(), owner, nonce)
}

pub fn note_nullifier(value: u128, owner: felt252, nonce: felt252) -> felt252 {
    hash_span4(NULLIFIER_DOMAIN, value.into(), owner, nonce)
}

pub fn merkle_node_hash(left: felt252, right: felt252) -> felt252 {
    hash_span4(MERKLE_TREE_DOMAIN, left, right, 0)
}

fn read_felt(ref input: Array<felt252>) -> felt252 {
    input.pop_front().unwrap()
}

fn read_u128(ref input: Array<felt252>) -> u128 {
    read_felt(ref input).try_into().unwrap()
}

fn read_usize(ref input: Array<felt252>) -> usize {
    read_felt(ref input).try_into().unwrap()
}

fn fold_level(current: felt252, index: felt252, sibling: felt252) -> felt252 {
    assert(index == 0 || index == 1, 'invalid_index');

    if index == 0 {
        merkle_node_hash(current, sibling)
    } else {
        merkle_node_hash(sibling, current)
    }
}

fn compute_root_from_encoded_proof(leaf: felt252, depth: usize, ref input: Array<felt252>) -> felt252 {
    assert(depth <= MAX_DEPTH, 'bad_depth');

    let mut current = leaf;
    for i in 0..MAX_DEPTH {
        let index = read_felt(ref input);
        let sibling = read_felt(ref input);

        if i < depth {
            current = fold_level(current, index, sibling);
        }
    };

    current
}

pub fn deposit_outputs(
    note_value: u128, owner: felt252, nonce: felt252, amount: u128, asset_id: felt252,
) -> Array<felt252> {
    assert(note_value == amount, 'amount_mismatch');

    let commitment = note_commitment(note_value, owner, nonce);
    let mut output: Array<felt252> = ArrayTrait::new();
    output.append(DEPOSIT_OUTPUT_KIND);
    output.append(amount.into());
    output.append(asset_id);
    output.append(commitment);
    output
}

#[executable]
pub fn deposit_main(mut input: Array<felt252>) -> Array<felt252> {
    assert(input.len() == DEPOSIT_INPUT_LEN, 'bad_deposit_len');

    let note_value = read_u128(ref input);
    let owner = read_felt(ref input);
    let nonce = read_felt(ref input);
    let amount = read_u128(ref input);
    let asset_id = read_felt(ref input);

    deposit_outputs(note_value, owner, nonce, amount, asset_id)
}

#[executable]
pub fn transfer_main(mut input: Array<felt252>) -> Array<felt252> {
    assert(input.len() == TRANSFER_INPUT_LEN, 'bad_transfer_len');

    let old_value = read_u128(ref input);
    let old_owner = read_felt(ref input);
    let old_nonce = read_felt(ref input);
    let depth = read_usize(ref input);

    let old_commitment = note_commitment(old_value, old_owner, old_nonce);
    let root = compute_root_from_encoded_proof(old_commitment, depth, ref input);
    let input_nullifier = note_nullifier(old_value, old_owner, old_nonce);

    let new_value_0 = read_u128(ref input);
    let new_owner_0 = read_felt(ref input);
    let new_nonce_0 = read_felt(ref input);
    let new_value_1 = read_u128(ref input);
    let new_owner_1 = read_felt(ref input);
    let new_nonce_1 = read_felt(ref input);

    assert(old_value == new_value_0 + new_value_1, 'value_mismatch');

    let commitment_0 = note_commitment(new_value_0, new_owner_0, new_nonce_0);
    let commitment_1 = note_commitment(new_value_1, new_owner_1, new_nonce_1);

    let mut output: Array<felt252> = ArrayTrait::new();
    output.append(TRANSFER_OUTPUT_KIND);
    output.append(root);
    output.append(input_nullifier);
    output.append(MAX_NEW_NOTES_FELT);
    output.append(commitment_0);
    output.append(commitment_1);
    output
}

#[executable]
pub fn withdraw_main(mut input: Array<felt252>) -> Array<felt252> {
    assert(input.len() == WITHDRAW_INPUT_LEN, 'bad_withdraw_len');

    let old_value = read_u128(ref input);
    let old_owner = read_felt(ref input);
    let old_nonce = read_felt(ref input);
    let depth = read_usize(ref input);

    let old_commitment = note_commitment(old_value, old_owner, old_nonce);
    let root = compute_root_from_encoded_proof(old_commitment, depth, ref input);
    let input_nullifier = note_nullifier(old_value, old_owner, old_nonce);

    let recipient = read_felt(ref input);
    let amount = read_u128(ref input);
    assert(old_value == amount, 'amount_mismatch');

    let mut output: Array<felt252> = ArrayTrait::new();
    output.append(WITHDRAW_OUTPUT_KIND);
    output.append(root);
    output.append(input_nullifier);
    output.append(recipient);
    output.append(amount.into());
    output
}

#[cfg(test)]
mod tests {
    use super::{
        DEPOSIT_OUTPUT_KIND, MAX_DEPTH, TRANSFER_OUTPUT_KIND, WITHDRAW_OUTPUT_KIND, deposit_main,
        note_commitment, note_nullifier, transfer_main, withdraw_main,
    };

    fn append_empty_merkle_proof(ref input: Array<felt252>) {
        for _ in 0..MAX_DEPTH {
            input.append(0);
            input.append(0);
        };
    }

    fn transfer_fixture(new_value_1: felt252) -> Array<felt252> {
        let mut input: Array<felt252> = ArrayTrait::new();
        input.append(10);
        input.append(111);
        input.append(7);
        input.append(0);
        append_empty_merkle_proof(ref input);
        input.append(4);
        input.append(222);
        input.append(8);
        input.append(new_value_1);
        input.append(333);
        input.append(9);
        input
    }

    #[test]
    fn deposit_outputs_bind_public_amount_asset_and_commitment() {
        let mut input: Array<felt252> = ArrayTrait::new();
        input.append(10);
        input.append(111);
        input.append(7);
        input.append(10);
        input.append(42);

        let mut output = deposit_main(input);

        assert(output.pop_front().unwrap() == DEPOSIT_OUTPUT_KIND, 'bad_kind');
        assert(output.pop_front().unwrap() == 10, 'bad_amount');
        assert(output.pop_front().unwrap() == 42, 'bad_asset');
        assert(output.pop_front().unwrap() == note_commitment(10, 111, 7), 'bad_commitment');
        assert(output.len() == 0, 'extra_output');
    }

    #[test]
    fn transfer_outputs_bind_root_nullifier_and_new_commitments() {
        let mut output = transfer_main(transfer_fixture(6));
        let old_commitment = note_commitment(10, 111, 7);

        assert(output.pop_front().unwrap() == TRANSFER_OUTPUT_KIND, 'bad_kind');
        assert(output.pop_front().unwrap() == old_commitment, 'bad_root');
        assert(output.pop_front().unwrap() == note_nullifier(10, 111, 7), 'bad_nullifier');
        assert(output.pop_front().unwrap() == 2, 'bad_count');
        assert(output.pop_front().unwrap() == note_commitment(4, 222, 8), 'bad_out0');
        assert(output.pop_front().unwrap() == note_commitment(6, 333, 9), 'bad_out1');
        assert(output.len() == 0, 'extra_output');
    }

    #[test]
    #[should_panic(expected: ('value_mismatch',))]
    fn transfer_rejects_value_mismatch() {
        transfer_main(transfer_fixture(7));
    }

    #[test]
    fn withdraw_outputs_bind_root_nullifier_recipient_and_amount() {
        let mut input: Array<felt252> = ArrayTrait::new();
        input.append(10);
        input.append(111);
        input.append(7);
        input.append(0);
        append_empty_merkle_proof(ref input);
        input.append(444);
        input.append(10);

        let mut output = withdraw_main(input);
        let old_commitment = note_commitment(10, 111, 7);

        assert(output.pop_front().unwrap() == WITHDRAW_OUTPUT_KIND, 'bad_kind');
        assert(output.pop_front().unwrap() == old_commitment, 'bad_root');
        assert(output.pop_front().unwrap() == note_nullifier(10, 111, 7), 'bad_nullifier');
        assert(output.pop_front().unwrap() == 444, 'bad_recipient');
        assert(output.pop_front().unwrap() == 10, 'bad_amount');
        assert(output.len() == 0, 'extra_output');
    }
}
