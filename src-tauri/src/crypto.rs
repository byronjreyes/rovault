//! ROVault cryptographic core.
//!
//! Design (see project plan):
//! - A random 256-bit **Data Encryption Key (DEK)** encrypts every credential.
//! - The DEK is stored twice, each copy "wrapped" (encrypted) by a Key Encryption
//!   Key (KEK) derived via Argon2id from either the master password or the recovery key.
//! - Either the password OR the recovery key can therefore unlock the vault.
//! - A small "verifier" blob encrypted with the DEK lets us confirm a correct unlock
//!   without ever storing password hashes.
//! - AEAD = XChaCha20-Poly1305 (authenticated; detects tampering; 24-byte nonce).
//!
//! All key material lives only in the Rust backend and is zeroized on drop.

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 24; // XChaCha20 nonce
const KEY_LEN: usize = 32; // 256-bit
const VERIFIER_PLAINTEXT: &[u8] = b"ROVAULT_VERIFIER_V1";
const RECOVERY_ENTROPY_BYTES: usize = 20; // 160-bit -> 32 base32 chars

// Argon2id tuning. ~64 MiB, 3 passes — resists GPU brute force while staying snappy.
const ARGON_MEM_KIB: u32 = 65536;
const ARGON_ITERS: u32 = 3;
const ARGON_PARALLELISM: u32 = 1;

#[derive(Debug)]
pub enum CryptoError {
    Kdf(String),
    Aead,
    BadLength,
}

impl std::fmt::Display for CryptoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CryptoError::Kdf(e) => write!(f, "key derivation failed: {e}"),
            CryptoError::Aead => write!(f, "decryption failed (wrong key or corrupted data)"),
            CryptoError::BadLength => write!(f, "malformed ciphertext"),
        }
    }
}
impl std::error::Error for CryptoError {}

/// A raw 256-bit key that wipes itself from memory when dropped.
#[derive(Clone, Zeroize, ZeroizeOnDrop)]
pub struct SecretKey([u8; KEY_LEN]);

impl SecretKey {
    fn random() -> Result<Self, CryptoError> {
        let mut k = [0u8; KEY_LEN];
        OsRng.fill_bytes(&mut k);
        Ok(SecretKey(k))
    }
    fn as_bytes(&self) -> &[u8; KEY_LEN] {
        &self.0
    }
    fn from_bytes(b: &[u8]) -> Result<Self, CryptoError> {
        if b.len() != KEY_LEN {
            return Err(CryptoError::BadLength);
        }
        let mut k = [0u8; KEY_LEN];
        k.copy_from_slice(b);
        Ok(SecretKey(k))
    }
}

/// Argon2id parameters persisted with the vault so we can re-derive KEKs on unlock.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KdfParams {
    pub mem_kib: u32,
    pub iters: u32,
    pub parallelism: u32,
}

impl Default for KdfParams {
    fn default() -> Self {
        KdfParams {
            mem_kib: ARGON_MEM_KIB,
            iters: ARGON_ITERS,
            parallelism: ARGON_PARALLELISM,
        }
    }
}

fn argon2_instance(p: &KdfParams) -> Result<Argon2<'static>, CryptoError> {
    let params = Params::new(p.mem_kib, p.iters, p.parallelism, Some(KEY_LEN))
        .map_err(|e| CryptoError::Kdf(e.to_string()))?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

/// Derive a 256-bit KEK from a secret (password or recovery key) + salt.
fn derive_kek(secret: &[u8], salt: &[u8], params: &KdfParams) -> Result<SecretKey, CryptoError> {
    let a2 = argon2_instance(params)?;
    let mut out = [0u8; KEY_LEN];
    a2.hash_password_into(secret, salt, &mut out)
        .map_err(|e| CryptoError::Kdf(e.to_string()))?;
    Ok(SecretKey(out))
}

fn random_bytes(n: usize) -> Vec<u8> {
    let mut v = vec![0u8; n];
    OsRng.fill_bytes(&mut v);
    v
}

/// Encrypt with a key. Output layout: [24-byte nonce][ciphertext+tag].
fn seal(key: &SecretKey, plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let cipher = XChaCha20Poly1305::new(key.as_bytes().into());
    let nonce_bytes = random_bytes(NONCE_LEN);
    let nonce = XNonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| CryptoError::Aead)?;
    let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Decrypt data produced by `seal`.
fn open(key: &SecretKey, data: &[u8]) -> Result<Vec<u8>, CryptoError> {
    if data.len() < NONCE_LEN {
        return Err(CryptoError::BadLength);
    }
    let (nonce_bytes, ct) = data.split_at(NONCE_LEN);
    let cipher = XChaCha20Poly1305::new(key.as_bytes().into());
    let nonce = XNonce::from_slice(nonce_bytes);
    cipher.decrypt(nonce, ct).map_err(|_| CryptoError::Aead)
}

/// The keyfile: everything needed to unlock, none of it useful without a secret.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyFile {
    pub kdf: KdfParams,
    pub password_salt: Vec<u8>,
    pub recovery_salt: Vec<u8>,
    /// DEK encrypted by the password-derived KEK.
    pub wrapped_dek_password: Vec<u8>,
    /// DEK encrypted by the recovery-derived KEK.
    pub wrapped_dek_recovery: Vec<u8>,
    /// DEK encrypted by a random biometric-KEK held in the OS/TPM secure store.
    /// None until the user enables Windows Hello unlock.
    #[serde(default)]
    pub wrapped_dek_biometric: Option<Vec<u8>>,
    /// Known plaintext encrypted with the DEK — validates a successful unlock.
    pub verifier: Vec<u8>,
}

/// Result of provisioning a new vault: the keyfile to persist + the recovery key
/// to show the user once + the live DEK for the unlocked session.
pub struct Provisioned {
    pub keyfile: KeyFile,
    pub recovery_key: String,
    pub dek: SecretKey,
}

/// Format 160 bits of entropy as a grouped Base32 recovery key: XXXX-XXXX-...
fn format_recovery_key(entropy: &[u8]) -> String {
    let raw = base32::encode(base32::Alphabet::Rfc4648 { padding: false }, entropy);
    raw.as_bytes()
        .chunks(4)
        .map(|c| std::str::from_utf8(c).unwrap())
        .collect::<Vec<_>>()
        .join("-")
}

/// Normalize a user-entered recovery key (strip dashes/spaces, uppercase).
pub fn normalize_recovery_key(input: &str) -> String {
    input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_uppercase()
}

/// Create a brand-new vault from a master password.
pub fn provision(password: &str, kdf: KdfParams) -> Result<Provisioned, CryptoError> {
    let dek = SecretKey::random()?;

    // Recovery key: human-copyable Base32.
    let entropy = random_bytes(RECOVERY_ENTROPY_BYTES);
    let recovery_key = format_recovery_key(&entropy);
    let recovery_secret = normalize_recovery_key(&recovery_key);

    let password_salt = random_bytes(SALT_LEN);
    let recovery_salt = random_bytes(SALT_LEN);

    let password_kek = derive_kek(password.as_bytes(), &password_salt, &kdf)?;
    let recovery_kek = derive_kek(recovery_secret.as_bytes(), &recovery_salt, &kdf)?;

    let wrapped_dek_password = seal(&password_kek, dek.as_bytes())?;
    let wrapped_dek_recovery = seal(&recovery_kek, dek.as_bytes())?;
    let verifier = seal(&dek, VERIFIER_PLAINTEXT)?;

    Ok(Provisioned {
        keyfile: KeyFile {
            kdf,
            password_salt,
            recovery_salt,
            wrapped_dek_password,
            wrapped_dek_recovery,
            wrapped_dek_biometric: None,
            verifier,
        },
        recovery_key,
        dek,
    })
}

fn verify_dek(dek: &SecretKey, kf: &KeyFile) -> Result<(), CryptoError> {
    let pt = open(dek, &kf.verifier)?;
    if pt == VERIFIER_PLAINTEXT {
        Ok(())
    } else {
        Err(CryptoError::Aead)
    }
}

/// Unlock with the master password. Returns the live DEK on success.
pub fn unlock_with_password(kf: &KeyFile, password: &str) -> Result<SecretKey, CryptoError> {
    let kek = derive_kek(password.as_bytes(), &kf.password_salt, &kf.kdf)?;
    let dek_bytes = open(&kek, &kf.wrapped_dek_password)?;
    let dek = SecretKey::from_bytes(&dek_bytes)?;
    verify_dek(&dek, kf)?;
    Ok(dek)
}

/// Unlock with the recovery key. Returns the live DEK on success.
pub fn unlock_with_recovery(kf: &KeyFile, recovery_key: &str) -> Result<SecretKey, CryptoError> {
    let secret = normalize_recovery_key(recovery_key);
    let kek = derive_kek(secret.as_bytes(), &kf.recovery_salt, &kf.kdf)?;
    let dek_bytes = open(&kek, &kf.wrapped_dek_recovery)?;
    let dek = SecretKey::from_bytes(&dek_bytes)?;
    verify_dek(&dek, kf)?;
    Ok(dek)
}

/// Wrap the DEK with a caller-supplied 32-byte biometric KEK (from the OS/TPM store).
/// Returns the ciphertext to persist in `wrapped_dek_biometric`.
pub fn wrap_dek_with_key(dek: &SecretKey, biometric_kek: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let key = SecretKey::from_bytes(biometric_kek)?;
    seal(&key, dek.as_bytes())
}

/// Unlock with a biometric KEK released by the OS/TPM after a Windows Hello check.
pub fn unlock_with_biometric(kf: &KeyFile, biometric_kek: &[u8]) -> Result<SecretKey, CryptoError> {
    let wrapped = kf
        .wrapped_dek_biometric
        .as_ref()
        .ok_or(CryptoError::Aead)?;
    let key = SecretKey::from_bytes(biometric_kek)?;
    let dek_bytes = open(&key, wrapped)?;
    let dek = SecretKey::from_bytes(&dek_bytes)?;
    verify_dek(&dek, kf)?;
    Ok(dek)
}

/// Generate a fresh random 32-byte biometric KEK.
pub fn new_biometric_kek() -> Vec<u8> {
    random_bytes(KEY_LEN)
}

/// Re-wrap the DEK under a new master password (keeps recovery key valid).
/// Caller must currently hold a valid DEK (i.e. be unlocked).
pub fn change_password(kf: &KeyFile, dek: &SecretKey, new_password: &str) -> Result<KeyFile, CryptoError> {
    let new_salt = random_bytes(SALT_LEN);
    let new_kek = derive_kek(new_password.as_bytes(), &new_salt, &kf.kdf)?;
    let wrapped = seal(&new_kek, dek.as_bytes())?;
    let mut updated = kf.clone();
    updated.password_salt = new_salt;
    updated.wrapped_dek_password = wrapped;
    Ok(updated)
}

/// Encrypt an arbitrary payload (e.g. a serialized credential) with the DEK.
pub fn encrypt_payload(dek: &SecretKey, plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    seal(dek, plaintext)
}

/// Decrypt a payload produced by `encrypt_payload`.
pub fn decrypt_payload(dek: &SecretKey, data: &[u8]) -> Result<Vec<u8>, CryptoError> {
    open(dek, data)
}

// A weaker KDF for tests so they run fast.
#[cfg(test)]
fn test_kdf() -> KdfParams {
    KdfParams { mem_kib: 8, iters: 1, parallelism: 1 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_unlock_roundtrip() {
        let p = provision("hunter2", test_kdf()).unwrap();
        let dek = unlock_with_password(&p.keyfile, "hunter2").unwrap();
        assert_eq!(dek.as_bytes(), p.dek.as_bytes());
    }

    #[test]
    fn wrong_password_fails() {
        let p = provision("hunter2", test_kdf()).unwrap();
        assert!(unlock_with_password(&p.keyfile, "wrong").is_err());
    }

    #[test]
    fn recovery_unlock_roundtrip() {
        let p = provision("hunter2", test_kdf()).unwrap();
        let dek = unlock_with_recovery(&p.keyfile, &p.recovery_key).unwrap();
        assert_eq!(dek.as_bytes(), p.dek.as_bytes());
    }

    #[test]
    fn biometric_wrap_unlock_roundtrip() {
        let p = provision("hunter2", test_kdf()).unwrap();
        let kek = new_biometric_kek();
        let wrapped = wrap_dek_with_key(&p.dek, &kek).unwrap();
        let mut kf = p.keyfile.clone();
        kf.wrapped_dek_biometric = Some(wrapped);
        let dek = unlock_with_biometric(&kf, &kek).unwrap();
        assert_eq!(dek.as_bytes(), p.dek.as_bytes());
        // Wrong biometric key must fail.
        assert!(unlock_with_biometric(&kf, &new_biometric_kek()).is_err());
    }

    #[test]
    fn recovery_key_tolerates_formatting() {
        let p = provision("hunter2", test_kdf()).unwrap();
        let messy = format!("  {}  ", p.recovery_key.to_lowercase().replace('-', " "));
        let dek = unlock_with_recovery(&p.keyfile, &messy).unwrap();
        assert_eq!(dek.as_bytes(), p.dek.as_bytes());
    }

    #[test]
    fn wrong_recovery_fails() {
        let p = provision("hunter2", test_kdf()).unwrap();
        assert!(unlock_with_recovery(&p.keyfile, "AAAA-BBBB-CCCC-DDDD").is_err());
    }

    #[test]
    fn payload_roundtrip_and_tamper_detection() {
        let p = provision("pw", test_kdf()).unwrap();
        let ct = encrypt_payload(&p.dek, b"my facebook password").unwrap();
        let pt = decrypt_payload(&p.dek, &ct).unwrap();
        assert_eq!(pt, b"my facebook password");

        // Flip a byte in the ciphertext -> AEAD must reject it.
        let mut bad = ct.clone();
        let last = bad.len() - 1;
        bad[last] ^= 0xFF;
        assert!(decrypt_payload(&p.dek, &bad).is_err());
    }

    #[test]
    fn change_password_keeps_recovery() {
        let p = provision("old", test_kdf()).unwrap();
        let dek = unlock_with_password(&p.keyfile, "old").unwrap();
        let kf2 = change_password(&p.keyfile, &dek, "new").unwrap();

        assert!(unlock_with_password(&kf2, "old").is_err());
        assert!(unlock_with_password(&kf2, "new").is_ok());
        // Recovery key still works after password change.
        assert!(unlock_with_recovery(&kf2, &p.recovery_key).is_ok());
    }

    #[test]
    fn recovery_key_shape() {
        let p = provision("pw", test_kdf()).unwrap();
        // 20 bytes -> 32 base32 chars -> 8 groups of 4 joined by 7 dashes.
        assert_eq!(p.recovery_key.len(), 32 + 7);
        assert_eq!(p.recovery_key.matches('-').count(), 7);
    }
}
