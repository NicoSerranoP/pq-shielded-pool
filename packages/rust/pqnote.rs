use blake2::{Blake2b512, Digest};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    Key, XChaCha20Poly1305, XNonce,
};
use pqcrypto_mlkem::mlkem768;
use pqcrypto_traits::kem::{
    Ciphertext as KemCiphertext, PublicKey as KemPublicKey, SecretKey as KemSecretKey,
    SharedSecret as KemSharedSecret,
};
use rand_core::{OsRng, RngCore};

pub mod commitments;

const KDF_DOMAIN: &[u8] = b"pq-shielded-pool:pqnote:v1";
const NONCE_SIZE: usize = 24;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Note {
    pub asset_id: [u8; 32],
    pub value: u128,
    pub rho: [u8; 32],
    pub rseed: [u8; 32],
    pub memo: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EncryptedNote {
    pub kem_ciphertext: Vec<u8>,
    pub nonce: [u8; NONCE_SIZE],
    pub note_ciphertext: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NoteKeypair {
    pub public_key: Vec<u8>,
    pub secret_key: Vec<u8>,
}

#[derive(Debug, thiserror::Error)]
pub enum PqNoteError {
    #[error("invalid ML-KEM public key")]
    InvalidPublicKey,
    #[error("invalid ML-KEM secret key")]
    InvalidSecretKey,
    #[error("invalid ML-KEM ciphertext")]
    InvalidKemCiphertext,
    #[error("note plaintext is malformed")]
    MalformedNote,
    #[error("note decryption failed")]
    DecryptionFailed,
    #[error("memo is too large to encode")]
    MemoTooLarge,
}

pub fn generate_note_keypair() -> NoteKeypair {
    let (public_key, secret_key) = mlkem768::keypair();

    NoteKeypair {
        public_key: public_key.as_bytes().to_vec(),
        secret_key: secret_key.as_bytes().to_vec(),
    }
}

pub fn encrypt_note(
    recipient_public_key: &[u8],
    note: &Note,
    associated_data: &[u8],
) -> Result<EncryptedNote, PqNoteError> {
    let recipient_public_key = mlkem768::PublicKey::from_bytes(recipient_public_key)
        .map_err(|_| PqNoteError::InvalidPublicKey)?;
    let (shared_secret, kem_ciphertext) = mlkem768::encapsulate(&recipient_public_key);
    let note_plaintext = encode_note(note)?;
    let key = derive_note_key(
        shared_secret.as_bytes(),
        kem_ciphertext.as_bytes(),
        associated_data,
    );
    let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));

    let mut nonce = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce);

    let note_ciphertext = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: &note_plaintext,
                aad: associated_data,
            },
        )
        .map_err(|_| PqNoteError::DecryptionFailed)?;

    Ok(EncryptedNote {
        kem_ciphertext: kem_ciphertext.as_bytes().to_vec(),
        nonce,
        note_ciphertext,
    })
}

pub fn decrypt_note(
    recipient_secret_key: &[u8],
    encrypted_note: &EncryptedNote,
    associated_data: &[u8],
) -> Result<Note, PqNoteError> {
    let recipient_secret_key = mlkem768::SecretKey::from_bytes(recipient_secret_key)
        .map_err(|_| PqNoteError::InvalidSecretKey)?;
    let kem_ciphertext = mlkem768::Ciphertext::from_bytes(&encrypted_note.kem_ciphertext)
        .map_err(|_| PqNoteError::InvalidKemCiphertext)?;
    let shared_secret = mlkem768::decapsulate(&kem_ciphertext, &recipient_secret_key);
    let key = derive_note_key(
        shared_secret.as_bytes(),
        kem_ciphertext.as_bytes(),
        associated_data,
    );
    let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));

    let note_plaintext = cipher
        .decrypt(
            XNonce::from_slice(&encrypted_note.nonce),
            Payload {
                msg: &encrypted_note.note_ciphertext,
                aad: associated_data,
            },
        )
        .map_err(|_| PqNoteError::DecryptionFailed)?;

    decode_note(&note_plaintext)
}

fn derive_note_key(
    shared_secret: &[u8],
    kem_ciphertext: &[u8],
    associated_data: &[u8],
) -> [u8; 32] {
    let mut hasher = Blake2b512::new();
    hasher.update(KDF_DOMAIN);
    hasher.update((shared_secret.len() as u64).to_le_bytes());
    hasher.update(shared_secret);
    hasher.update((kem_ciphertext.len() as u64).to_le_bytes());
    hasher.update(kem_ciphertext);
    hasher.update((associated_data.len() as u64).to_le_bytes());
    hasher.update(associated_data);

    let digest = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&digest[..32]);
    key
}

fn encode_note(note: &Note) -> Result<Vec<u8>, PqNoteError> {
    let memo_len = u32::try_from(note.memo.len()).map_err(|_| PqNoteError::MemoTooLarge)?;
    let mut out = Vec::with_capacity(32 + 16 + 32 + 32 + 4 + note.memo.len());

    out.extend_from_slice(&note.asset_id);
    out.extend_from_slice(&note.value.to_le_bytes());
    out.extend_from_slice(&note.rho);
    out.extend_from_slice(&note.rseed);
    out.extend_from_slice(&memo_len.to_le_bytes());
    out.extend_from_slice(&note.memo);

    Ok(out)
}

fn decode_note(bytes: &[u8]) -> Result<Note, PqNoteError> {
    const FIXED_SIZE: usize = 32 + 16 + 32 + 32 + 4;

    if bytes.len() < FIXED_SIZE {
        return Err(PqNoteError::MalformedNote);
    }

    let mut cursor = 0;
    let asset_id = read_array::<32>(bytes, &mut cursor)?;
    let value = u128::from_le_bytes(read_array::<16>(bytes, &mut cursor)?);
    let rho = read_array::<32>(bytes, &mut cursor)?;
    let rseed = read_array::<32>(bytes, &mut cursor)?;
    let memo_len = u32::from_le_bytes(read_array::<4>(bytes, &mut cursor)?) as usize;

    if bytes.len() != cursor + memo_len {
        return Err(PqNoteError::MalformedNote);
    }

    Ok(Note {
        asset_id,
        value,
        rho,
        rseed,
        memo: bytes[cursor..].to_vec(),
    })
}

fn read_array<const N: usize>(bytes: &[u8], cursor: &mut usize) -> Result<[u8; N], PqNoteError> {
    let end = cursor.checked_add(N).ok_or(PqNoteError::MalformedNote)?;
    let slice = bytes.get(*cursor..end).ok_or(PqNoteError::MalformedNote)?;
    let mut out = [0u8; N];
    out.copy_from_slice(slice);
    *cursor = end;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_note() -> Note {
        Note {
            asset_id: [7u8; 32],
            value: 42,
            rho: [11u8; 32],
            rseed: [19u8; 32],
            memo: b"hello, pq shielded pool".to_vec(),
        }
    }

    #[test]
    fn note_round_trips_through_ml_kem_encryption() {
        let keys = generate_note_keypair();
        let note = sample_note();
        let associated_data = b"tx-domain-separator";

        let encrypted = encrypt_note(&keys.public_key, &note, associated_data).unwrap();
        let decrypted = decrypt_note(&keys.secret_key, &encrypted, associated_data).unwrap();

        assert_eq!(decrypted, note);
    }

    #[test]
    fn associated_data_is_authenticated() {
        let keys = generate_note_keypair();
        let note = sample_note();
        let encrypted = encrypt_note(&keys.public_key, &note, b"right-domain").unwrap();

        let err = decrypt_note(&keys.secret_key, &encrypted, b"wrong-domain").unwrap_err();

        assert!(matches!(err, PqNoteError::DecryptionFailed));
    }

    #[test]
    fn wrong_recipient_cannot_decrypt() {
        let recipient = generate_note_keypair();
        let other = generate_note_keypair();
        let note = sample_note();
        let encrypted = encrypt_note(&recipient.public_key, &note, b"").unwrap();

        let err = decrypt_note(&other.secret_key, &encrypted, b"").unwrap_err();

        assert!(matches!(err, PqNoteError::DecryptionFailed));
    }
}
