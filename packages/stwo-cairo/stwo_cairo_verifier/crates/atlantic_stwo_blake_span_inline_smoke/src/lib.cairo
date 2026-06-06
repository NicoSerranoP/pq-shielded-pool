use core::blake::blake2s_finalize;
use core::box::BoxImpl;

const BLAKE2S_256_INITIAL_STATE: [u32; 8] = [
    0x6B08E647, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19,
];

#[inline(never)]
#[executable]
pub fn main(input: Array<felt252>) -> Array<felt252> {
    let values = array![1_u32, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    let span = values.span();
    let msg = BoxImpl::new([
        *span.at(0), *span.at(1), *span.at(2), *span.at(3),
        *span.at(4), *span.at(5), *span.at(6), *span.at(7),
        *span.at(8), *span.at(9), *span.at(10), *span.at(11),
        *span.at(12), *span.at(13), *span.at(14), *span.at(15),
    ]);
    let digest = blake2s_finalize(BoxImpl::new(BLAKE2S_256_INITIAL_STATE), 64_u32, msg);
    let [w0, w1, w2, w3, w4, w5, w6, w7] = digest.unbox();

    let mut output = ArrayTrait::new();
    output.append(209);
    output.append(input.len().into());
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
