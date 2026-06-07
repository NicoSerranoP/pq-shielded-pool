use crate::constants::MAX_DEPTH;

pub struct Note {
    pub value: u32,
    pub asset: u32,
    pub owner: Field,
    pub nonce: Field,
}

pub struct MerkleProof {
    pub length: u32,
    pub indices: [bool; MAX_DEPTH],
    pub siblings: [Field; MAX_DEPTH],
}
