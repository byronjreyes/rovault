//! Encrypted, multi-vault storage for ROVault.
//!
//! On-disk layout (in the OS app-config dir, e.g. %APPDATA%\com.rdev.rovault\ROVault\):
//!   vaults/<uuid>.json  -> one encrypted vault per file
//!
//! Each file holds:
//!   - safe metadata: id, name, timestamps, KDF params, salts, wrapped DEKs, verifier
//!   - `entries_blob`: the full credential list, JSON then encrypted with the DEK.
//! Nothing readable ever touches disk. Plaintext lives only in memory while unlocked.

use crate::crypto::{self, KdfParams, KeyFile, SecretKey};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

pub const VAULTS_DIR: &str = "vaults";

/// One stored password history entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub password: String,
    pub changed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credential {
    pub id: String,
    pub provider: String,
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub favorite: bool,
    /// Base32 TOTP secret (2FA). Empty = no 2FA stored.
    #[serde(default)]
    pub totp_secret: String,
    /// Previous passwords, newest last.
    #[serde(default)]
    pub history: Vec<HistoryEntry>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteFolder {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteImage {
    pub id: String,
    pub data: String, // Base64 or data URL
    #[serde(default)]
    pub mime: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteFile {
    pub id: String,
    #[serde(default)]
    pub folder_id: Option<String>,
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub images: Vec<NoteImage>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

/// Plaintext contents of a vault, in memory only while unlocked.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VaultData {
    pub entries: Vec<Credential>,
    #[serde(default)]
    pub folders: Vec<NoteFolder>,
    #[serde(default)]
    pub notes: Vec<NoteFile>,
}

/// What lands on disk (one per vault).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultFile {
    pub id: String,
    pub name: String,
    pub version: u32,
    #[serde(default)]
    pub created_at: i64,
    pub keyfile: KeyFile,
    /// Encrypted VaultData (JSON) — ciphertext only.
    pub entries_blob: Vec<u8>,
}

/// In-memory runtime state for the currently-open vault.
#[derive(Default)]
pub struct SessionInner {
    pub unlocked: bool,
    pub dek: Option<SecretKey>,
    pub vault_id: String,
    pub name: String,
    pub keyfile: Option<KeyFile>,
    pub data: VaultData,
}

pub struct AppState {
    pub session: Mutex<SessionInner>,
    /// Root config dir cached once resolved.
    pub config_dir: Mutex<Option<PathBuf>>,
}

impl Default for AppState {
    fn default() -> Self {
        AppState {
            session: Mutex::new(SessionInner::default()),
            config_dir: Mutex::new(None),
        }
    }
}

#[derive(Debug)]
pub enum StoreError {
    Crypto(crypto::CryptoError),
    Io(String),
    Serde(String),
    Locked,
    NotFound,
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::Crypto(e) => write!(f, "{e}"),
            StoreError::Io(e) => write!(f, "storage error: {e}"),
            StoreError::Serde(e) => write!(f, "data error: {e}"),
            StoreError::Locked => write!(f, "vault is locked"),
            StoreError::NotFound => write!(f, "vault not found"),
        }
    }
}
impl std::error::Error for StoreError {}

impl From<crypto::CryptoError> for StoreError {
    fn from(e: crypto::CryptoError) -> Self {
        StoreError::Crypto(e)
    }
}

pub fn seal_data(dek: &SecretKey, data: &VaultData) -> Result<Vec<u8>, StoreError> {
    let json = serde_json::to_vec(data).map_err(|e| StoreError::Serde(e.to_string()))?;
    Ok(crypto::encrypt_payload(dek, &json)?)
}

pub fn open_data(dek: &SecretKey, blob: &[u8]) -> Result<VaultData, StoreError> {
    if blob.is_empty() {
        return Ok(VaultData::default());
    }
    let json = crypto::decrypt_payload(dek, blob)?;
    serde_json::from_slice(&json).map_err(|e| StoreError::Serde(e.to_string()))
}

pub fn read_vault_file(path: &PathBuf) -> Result<VaultFile, StoreError> {
    let bytes = std::fs::read(path).map_err(|e| StoreError::Io(e.to_string()))?;
    serde_json::from_slice(&bytes).map_err(|e| StoreError::Serde(e.to_string()))
}

pub fn write_vault_file(path: &PathBuf, vf: &VaultFile) -> Result<(), StoreError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| StoreError::Io(e.to_string()))?;
    }
    let bytes = serde_json::to_vec_pretty(vf).map_err(|e| StoreError::Serde(e.to_string()))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, &bytes).map_err(|e| StoreError::Io(e.to_string()))?;
    std::fs::rename(&tmp, path).map_err(|e| StoreError::Io(e.to_string()))?;
    Ok(())
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn default_kdf() -> KdfParams {
    KdfParams::default()
}

/// Parse an encrypted `.rovault` backup and prepare it for restore.
/// Preserves the original vault ID so restoring/importing overwrites the target vault
/// with the exact same ID and name, keeping ciphertext and wrapped keys intact.
pub fn prepare_encrypted_import(
    json: &str,
) -> Result<VaultFile, StoreError> {
    let mut vault: VaultFile =
        serde_json::from_str(json).map_err(|e| StoreError::Serde(e.to_string()))?;
    if vault.version != 1
        || vault.keyfile.wrapped_dek_password.is_empty()
        || vault.keyfile.wrapped_dek_recovery.is_empty()
        || vault.keyfile.verifier.is_empty()
        || vault.entries_blob.is_empty()
    {
        return Err(StoreError::Serde("invalid or unsupported encrypted ROVault backup".into()));
    }
    if vault.id.trim().is_empty() {
        vault.id = new_id();
    }
    vault.name = vault.name.trim().to_string();
    // Windows Hello's KEK lives in this device's credential store and is not
    // portable. Keep password/recovery wrappers, but require Hello to be
    // re-enabled after the imported vault is unlocked on this device.
    vault.keyfile.wrapped_dek_biometric = None;
    Ok(vault)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypted_backup_import_preserves_identity_and_overwrites() {
        let original_blob = vec![10, 20, 30, 40];
        let mut backup = VaultFile {
            id: "original-id".into(),
            name: "Personal".into(),
            version: 1,
            created_at: 100,
            keyfile: crate::crypto::provision("password", KdfParams {
                mem_kib: 8,
                iters: 1,
                parallelism: 1,
            })
            .unwrap()
            .keyfile,
            entries_blob: original_blob.clone(),
        };
        backup.keyfile.wrapped_dek_biometric = Some(vec![1, 2, 3]);
        let json = serde_json::to_string(&backup).unwrap();

        let imported = prepare_encrypted_import(&json).unwrap();

        assert_eq!(imported.id, "original-id");
        assert_eq!(imported.name, "Personal");
        assert_eq!(imported.entries_blob, original_blob);
        assert_eq!(imported.keyfile.wrapped_dek_password, backup.keyfile.wrapped_dek_password);
        assert!(imported.keyfile.wrapped_dek_biometric.is_none());
    }

    #[test]
    fn legacy_vault_data_deserializes_with_empty_folders_and_notes() {
        // Simulates old v0.1.0 VaultData which only had entries
        let legacy_json = r#"{"entries":[{"id":"1","provider":"Test","username":"user","password":"pw"}]}"#;
        let data: VaultData = serde_json::from_str(legacy_json).expect("should deserialize legacy data");
        assert_eq!(data.entries.len(), 1);
        assert_eq!(data.entries[0].provider, "Test");
        assert!(data.folders.is_empty());
        assert!(data.notes.is_empty());
    }

    #[test]
    fn v020_vault_data_roundtrip_with_folders_and_notes() {
        let mut data = VaultData::default();
        data.folders.push(NoteFolder {
            id: "f1".into(),
            name: "Work Docs".into(),
            created_at: 100,
            updated_at: 100,
        });
        data.notes.push(NoteFile {
            id: "n1".into(),
            folder_id: Some("f1".into()),
            title: "Secret Strategy".into(),
            content: "<h1>Confidential</h1><p>Plan content</p>".into(),
            images: vec![NoteImage {
                id: "img1".into(),
                data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==".into(),
                mime: "image/png".into(),
            }],
            created_at: 100,
            updated_at: 100,
        });

        let json = serde_json::to_string(&data).unwrap();
        let deserialized: VaultData = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.folders.len(), 1);
        assert_eq!(deserialized.folders[0].name, "Work Docs");
        assert_eq!(deserialized.notes.len(), 1);
        assert_eq!(deserialized.notes[0].title, "Secret Strategy");
        assert_eq!(deserialized.notes[0].images.len(), 1);
    }
}
