use crate::constants::MAX_DEPTH;

pub struct Note {
    pub value: u32,
    pub owner: Field,
    pub nonce: Field,
}

pub struct MerkleProof {
    pub length: u32,
    pub indices: [bool; MAX_DEPTH],
    pub siblings: [Field; MAX_DEPTH],
}

pub struct Signature {
    pub hashed_message: [u8; 32],
    pub pub_key_x: [u8; 32],
    pub pub_key_y: [u8; 32],
    pub signature: [u8; 64],
}
