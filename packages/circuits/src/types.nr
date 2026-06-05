use crate::constants::{MAX_DEPTH, MAX_NEW_NOTES};

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

pub struct Return {
    new_commitments: [Field; MAX_NEW_NOTES],
}

impl Return {
    pub fn new(new_commitments: [Field; MAX_NEW_NOTES]) -> Self {
        Self { new_commitments }
    }
}
