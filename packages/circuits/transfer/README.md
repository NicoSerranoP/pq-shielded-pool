# Transfer circuit

Use this circuit to build the zk proof in the user device in order to transfer value spending a note and generating new notes. This transfer will be totally anonymous and confidential.

## Run it
To run the circuit, check the README in `packages/circuits/`

## Prover.toml file
```yaml
new_notes_commitments = ["0x0e0bfaeb78319c73806a701cf1714c5a43f970cd0faed05d340b8f50b6517961", "0x0983bd8c0111805c560976a4be7d9fcb65770e2b82cb48813ebaf555527ef53c"]
nullifier = "0x079f1b236618bfa7fcc0b96caa26db9f6b9f5203e116662d9aa61a92677f68d8"
published_root = "0x0f670b9202f04e3fdd3c9ec53fa427a34ab5a4891be0d257dff327237e34c4d7"

[merkle_proof]
indices = [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]
length = 0
siblings = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

[[new_notes]]
nonce = 1
owner = 1
value = 1

[[new_notes]]
nonce = 2
owner = 2
value = 3

[old_note]
nonce = 0
owner = "0x17aa07f6560b626ccd53cbfb2a0f5b4727b31fb8882ec591a22e7e893c067bd2"
value = 5

[signature]
hashed_message = [
    100,
    236,
    136,
    202,
    0,
    178,
    104,
    229,
    186,
    26,
    53,
    103,
    138,
    27,
    83,
    22,
    210,
    18,
    244,
    243,
    102,
    178,
    71,
    114,
    50,
    83,
    74,
    138,
    236,
    163,
    127,
    60,
]
pub_key_x = [
    22,
    187,
    36,
    95,
    205,
    97,
    153,
    67,
    80,
    149,
    95,
    108,
    42,
    83,
    94,
    245,
    217,
    82,
    125,
    175,
    242,
    24,
    221,
    187,
    228,
    102,
    243,
    199,
    89,
    198,
    230,
    24,
]
pub_key_y = [
    118,
    53,
    113,
    157,
    197,
    214,
    160,
    108,
    251,
    5,
    31,
    60,
    23,
    221,
    11,
    129,
    241,
    46,
    178,
    75,
    217,
    117,
    35,
    10,
    107,
    80,
    6,
    58,
    190,
    222,
    85,
    97,
]
signature = [
    186,
    112,
    232,
    170,
    195,
    254,
    51,
    31,
    89,
    193,
    147,
    58,
    107,
    3,
    227,
    236,
    115,
    230,
    237,
    197,
    203,
    201,
    142,
    11,
    114,
    133,
    49,
    157,
    115,
    116,
    95,
    0,
    27,
    75,
    225,
    3,
    59,
    58,
    110,
    160,
    82,
    156,
    135,
    108,
    51,
    213,
    121,
    207,
    204,
    5,
    60,
    228,
    216,
    42,
    150,
    254,
    222,
    114,
    47,
    74,
    178,
    25,
    166,
    233,
]
```
