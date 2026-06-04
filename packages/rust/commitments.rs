use blake2::{Blake2b512, Digest};

use crate::Note;

const NOTE_COMMITMENT_DOMAIN: &[u8] = b"pq-shielded-pool:note-commitment:v1";
const NULLIFIER_DOMAIN: &[u8] = b"pq-shielded-pool:nullifier:v1";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NoteHashContext {
    pub chain_id: u64,
    pub pool_address: [u8; 20],
}

pub type NoteCommitment = [u8; 32];
pub type Nullifier = [u8; 32];

pub fn note_commitment(
    context: &NoteHashContext,
    note: &Note,
    recipient_public_key: &[u8],
) -> NoteCommitment {
    let mut hasher = domain_hasher(NOTE_COMMITMENT_DOMAIN, context);
    hasher.update(note.asset_id);
    hasher.update(note.value.to_le_bytes());
    hasher.update(note.rho);
    hasher.update(note.rseed);
    update_len_prefixed(&mut hasher, recipient_public_key);
    finalize_hash(hasher)
}

pub fn nullifier_for_recipient(
    context: &NoteHashContext,
    note: &Note,
    recipient_public_key: &[u8],
) -> Nullifier {
    let commitment = note_commitment(context, note, recipient_public_key);
    nullifier_for_commitment(context, note, &commitment)
}

pub fn nullifier_for_commitment(
    context: &NoteHashContext,
    note: &Note,
    commitment: &NoteCommitment,
) -> Nullifier {
    let mut hasher = domain_hasher(NULLIFIER_DOMAIN, context);
    hasher.update(commitment);
    hasher.update(note.rho);
    hasher.update(note.rseed);
    finalize_hash(hasher)
}

fn domain_hasher(domain: &[u8], context: &NoteHashContext) -> Blake2b512 {
    let mut hasher = Blake2b512::new();
    update_len_prefixed(&mut hasher, domain);
    hasher.update(context.chain_id.to_le_bytes());
    hasher.update(context.pool_address);
    hasher
}

fn update_len_prefixed(hasher: &mut Blake2b512, bytes: &[u8]) {
    hasher.update((bytes.len() as u64).to_le_bytes());
    hasher.update(bytes);
}

fn finalize_hash(hasher: Blake2b512) -> [u8; 32] {
    let digest = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest[..32]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_context() -> NoteHashContext {
        NoteHashContext {
            chain_id: 31337,
            pool_address: [0x42u8; 20],
        }
    }

    fn sample_note() -> Note {
        Note {
            asset_id: [7u8; 32],
            value: 42,
            rho: [11u8; 32],
            rseed: [19u8; 32],
            memo: b"memo is encrypted, not committed".to_vec(),
        }
    }

    #[test]
    fn commitment_is_deterministic() {
        let context = sample_context();
        let note = sample_note();
        let recipient_public_key = [0xabu8; 1184];

        let first = note_commitment(&context, &note, &recipient_public_key);
        let second = note_commitment(&context, &note, &recipient_public_key);

        assert_eq!(first, second);
    }

    #[test]
    fn commitment_binds_note_context_and_recipient() {
        let context = sample_context();
        let note = sample_note();
        let recipient_public_key = [0xabu8; 1184];

        let baseline = note_commitment(&context, &note, &recipient_public_key);

        let mut changed_context = context;
        changed_context.chain_id += 1;
        assert_ne!(
            baseline,
            note_commitment(&changed_context, &note, &recipient_public_key)
        );

        let mut changed_note = note.clone();
        changed_note.value += 1;
        assert_ne!(
            baseline,
            note_commitment(&context, &changed_note, &recipient_public_key)
        );

        let changed_recipient_public_key = [0xcdu8; 1184];
        assert_ne!(
            baseline,
            note_commitment(&context, &note, &changed_recipient_public_key)
        );
    }

    #[test]
    fn memo_is_not_part_of_commitment() {
        let context = sample_context();
        let mut note = sample_note();
        let recipient_public_key = [0xabu8; 1184];

        let baseline = note_commitment(&context, &note, &recipient_public_key);
        note.memo = b"different encrypted payload".to_vec();

        assert_eq!(
            baseline,
            note_commitment(&context, &note, &recipient_public_key)
        );
    }

    #[test]
    fn nullifier_is_deterministic_and_domain_separated() {
        let context = sample_context();
        let note = sample_note();
        let recipient_public_key = [0xabu8; 1184];

        let commitment = note_commitment(&context, &note, &recipient_public_key);
        let first = nullifier_for_commitment(&context, &note, &commitment);
        let second = nullifier_for_commitment(&context, &note, &commitment);

        assert_eq!(first, second);
        assert_ne!(first, commitment);
    }

    #[test]
    fn nullifier_binds_context_and_note_secret_material() {
        let context = sample_context();
        let note = sample_note();
        let recipient_public_key = [0xabu8; 1184];
        let baseline = nullifier_for_recipient(&context, &note, &recipient_public_key);

        let mut changed_context = context;
        changed_context.pool_address[0] ^= 1;
        assert_ne!(
            baseline,
            nullifier_for_recipient(&changed_context, &note, &recipient_public_key)
        );

        let mut changed_note = note.clone();
        changed_note.rseed[0] ^= 1;
        assert_ne!(
            baseline,
            nullifier_for_recipient(&context, &changed_note, &recipient_public_key)
        );
    }
}
