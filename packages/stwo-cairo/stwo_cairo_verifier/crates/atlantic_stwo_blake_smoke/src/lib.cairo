use core::blake::blake2s_finalize;
use core::box::BoxImpl;
use stwo_verifier_utils::BLAKE2S_256_INITIAL_STATE;

#[inline(never)]
#[executable]
pub fn main(input: Array<felt252>) -> Array<felt252> {
    let msg = BoxImpl::new([1_u32, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    let digest = blake2s_finalize(BoxImpl::new(BLAKE2S_256_INITIAL_STATE), 16, msg);
    let [w0, w1, w2, w3, w4, w5, w6, w7] = digest.unbox();
    let mut output = ArrayTrait::new();
    output.append(205);
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
