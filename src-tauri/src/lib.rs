mod biometric;
mod crypto;
mod store;
mod totp;

use serde::Serialize;
use std::path::PathBuf;
use store::{
    AppState, Credential, HistoryEntry, NoteFile, NoteFolder, StoreError, VaultData,
    VaultFile,
};
use tauri::{Manager, State};

// ---- helpers ----

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn config_root(app: &tauri::AppHandle, state: &State<AppState>) -> Result<PathBuf, String> {
    if let Some(p) = state.config_dir.lock().unwrap().as_ref() {
        return Ok(p.clone());
    }
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("cannot resolve config dir: {e}"))?
        .join("ROVault");
    *state.config_dir.lock().unwrap() = Some(dir.clone());
    Ok(dir)
}

fn vaults_dir(app: &tauri::AppHandle, state: &State<AppState>) -> Result<PathBuf, String> {
    Ok(config_root(app, state)?.join(store::VAULTS_DIR))
}

fn vault_path(
    app: &tauri::AppHandle,
    state: &State<AppState>,
    id: &str,
) -> Result<PathBuf, String> {
    Ok(vaults_dir(app, state)?.join(format!("{id}.json")))
}

/// Re-encrypt current in-memory data back to its vault file.
fn persist(app: &tauri::AppHandle, state: &State<AppState>) -> Result<(), String> {
    let session = state.session.lock().unwrap();
    if !session.unlocked {
        return Err(StoreError::Locked.to_string());
    }
    let dek = session.dek.as_ref().ok_or(StoreError::Locked).map_err(err)?;
    let keyfile = session.keyfile.as_ref().ok_or(StoreError::Locked).map_err(err)?;
    let blob = store::seal_data(dek, &session.data).map_err(err)?;
    let existing = read_meta(app, state, &session.vault_id).ok();
    let vf = VaultFile {
        id: session.vault_id.clone(),
        name: session.name.clone(),
        version: 1,
        created_at: existing.map(|v| v.created_at).unwrap_or_else(store::now_secs),
        keyfile: keyfile.clone(),
        entries_blob: blob,
    };
    let path = vault_path(app, state, &session.vault_id)?;
    store::write_vault_file(&path, &vf).map_err(err)
}

fn read_meta(
    app: &tauri::AppHandle,
    state: &State<AppState>,
    id: &str,
) -> Result<VaultFile, StoreError> {
    let path = vault_path(app, state, id).map_err(StoreError::Io)?;
    store::read_vault_file(&path)
}

// ---- DTOs ----

#[derive(Serialize)]
pub struct VaultSummary {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub biometric_enabled: bool,
}

#[derive(Serialize)]
pub struct SessionInfo {
    pub unlocked: bool,
    pub vault_id: String,
    pub name: String,
    pub biometric_enabled: bool,
    pub biometric_available: bool,
}

#[derive(Serialize)]
pub struct ProvisionResult {
    pub vault_id: String,
    pub recovery_key: String,
}

#[derive(Serialize)]
pub struct TotpCode {
    pub code: String,
    pub seconds_remaining: u32,
}

// ---- vault management commands ----

/// List all vaults on disk (safe metadata only).
#[tauri::command]
fn list_vaults(app: tauri::AppHandle, state: State<AppState>) -> Result<Vec<VaultSummary>, String> {
    let dir = vaults_dir(&app, &state)?;
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(vf) = store::read_vault_file(&p) {
                    out.push(VaultSummary {
                        id: vf.id.clone(),
                        name: vf.name,
                        created_at: vf.created_at,
                        biometric_enabled: vf.keyfile.wrapped_dek_biometric.is_some(),
                    });
                }
            }
        }
    }
    out.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(out)
}

/// Current session status.
#[tauri::command]
fn session_info(state: State<AppState>) -> SessionInfo {
    let session = state.session.lock().unwrap();
    let bio_enabled = session
        .keyfile
        .as_ref()
        .map(|k| k.wrapped_dek_biometric.is_some())
        .unwrap_or(false);
    SessionInfo {
        unlocked: session.unlocked,
        vault_id: session.vault_id.clone(),
        name: session.name.clone(),
        biometric_enabled: bio_enabled,
        biometric_available: biometric::hello_available(),
    }
}

/// Create a new vault. Returns its id + the one-time recovery key.
#[tauri::command]
fn create_vault(
    app: tauri::AppHandle,
    state: State<AppState>,
    name: String,
    password: String,
) -> Result<ProvisionResult, String> {
    let provisioned = crypto::provision(&password, store::default_kdf()).map_err(err)?;
    let id = store::new_id();
    let data = VaultData::default();
    let blob = store::seal_data(&provisioned.dek, &data).map_err(err)?;
    let vf = VaultFile {
        id: id.clone(),
        name: name.trim().to_string(),
        version: 1,
        created_at: store::now_secs(),
        keyfile: provisioned.keyfile.clone(),
        entries_blob: blob,
    };
    let path = vault_path(&app, &state, &id)?;
    store::write_vault_file(&path, &vf).map_err(err)?;

    // Auto-unlock into the new vault.
    let mut session = state.session.lock().unwrap();
    session.unlocked = true;
    session.dek = Some(provisioned.dek);
    session.vault_id = id.clone();
    session.name = vf.name;
    session.keyfile = Some(provisioned.keyfile);
    session.data = data;

    Ok(ProvisionResult {
        vault_id: id,
        recovery_key: provisioned.recovery_key,
    })
}

#[tauri::command]
fn unlock(
    app: tauri::AppHandle,
    state: State<AppState>,
    vault_id: String,
    secret: String,
    use_recovery: bool,
) -> Result<SessionInfo, String> {
    let vf = read_meta(&app, &state, &vault_id).map_err(err)?;
    let dek = if use_recovery {
        crypto::unlock_with_recovery(&vf.keyfile, &secret).map_err(err)?
    } else {
        crypto::unlock_with_password(&vf.keyfile, &secret).map_err(err)?
    };
    let data = store::open_data(&dek, &vf.entries_blob).map_err(err)?;
    finish_unlock(&state, vf, dek, data)
}

/// Unlock via Windows Hello. Prompts for the gesture, then uses the stored KEK.
#[tauri::command]
fn unlock_biometric(
    app: tauri::AppHandle,
    state: State<AppState>,
    vault_id: String,
) -> Result<SessionInfo, String> {
    let vf = read_meta(&app, &state, &vault_id).map_err(err)?;
    if vf.keyfile.wrapped_dek_biometric.is_none() {
        return Err("biometric unlock is not enabled for this vault".into());
    }
    biometric::request_hello("Unlock ROVault")?;
    let kek = biometric::load_kek(&vault_id)?;
    let dek = crypto::unlock_with_biometric(&vf.keyfile, &kek).map_err(err)?;
    let data = store::open_data(&dek, &vf.entries_blob).map_err(err)?;
    finish_unlock(&state, vf, dek, data)
}

fn finish_unlock(
    state: &State<AppState>,
    vf: VaultFile,
    dek: crypto::SecretKey,
    data: VaultData,
) -> Result<SessionInfo, String> {
    let bio_enabled = vf.keyfile.wrapped_dek_biometric.is_some();
    let mut session = state.session.lock().unwrap();
    session.unlocked = true;
    session.dek = Some(dek);
    session.vault_id = vf.id.clone();
    session.name = vf.name.clone();
    session.keyfile = Some(vf.keyfile);
    session.data = data;
    Ok(SessionInfo {
        unlocked: true,
        vault_id: vf.id,
        name: vf.name,
        biometric_enabled: bio_enabled,
        biometric_available: biometric::hello_available(),
    })
}

#[tauri::command]
fn lock(state: State<AppState>) -> Result<(), String> {
    let mut session = state.session.lock().unwrap();
    session.unlocked = false;
    session.dek = None; // zeroized on drop
    session.data = VaultData::default();
    session.keyfile = None;
    session.vault_id.clear();
    session.name.clear();
    Ok(())
}

/// Delete a vault. Requires the correct master password (verified server-side).
#[tauri::command]
fn delete_vault(
    app: tauri::AppHandle,
    state: State<AppState>,
    vault_id: String,
    password: String,
) -> Result<(), String> {
    let vf = read_meta(&app, &state, &vault_id).map_err(err)?;
    // Verify password before destroying anything.
    crypto::unlock_with_password(&vf.keyfile, &password).map_err(err)?;

    let path = vault_path(&app, &state, &vault_id)?;
    std::fs::remove_file(&path).map_err(|e| format!("could not delete vault: {e}"))?;
    let _ = biometric::delete_kek(&vault_id);

    // If the deleted vault is the open one, lock the session.
    let mut session = state.session.lock().unwrap();
    if session.vault_id == vault_id {
        session.unlocked = false;
        session.dek = None;
        session.data = VaultData::default();
        session.keyfile = None;
        session.vault_id.clear();
        session.name.clear();
    }
    Ok(())
}

// ---- biometric enable/disable ----

#[tauri::command]
fn biometric_status() -> Result<bool, String> {
    Ok(biometric::hello_available())
}

/// Detailed reason string so the UI can guide the user on how to enable Hello.
#[tauri::command]
fn biometric_reason() -> Result<String, String> {
    Ok(biometric::availability_reason())
}

/// Enable Windows Hello unlock for the currently-open vault.
#[tauri::command]
fn enable_biometric(app: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    if !biometric::hello_available() {
        return Err("Windows Hello is not available on this device".into());
    }
    biometric::request_hello("Enable Windows Hello for ROVault")?;

    let (vault_id, wrapped) = {
        let session = state.session.lock().unwrap();
        if !session.unlocked {
            return Err(StoreError::Locked.to_string());
        }
        let dek = session.dek.as_ref().ok_or(StoreError::Locked).map_err(err)?;
        let kek = crypto::new_biometric_kek();
        let wrapped = crypto::wrap_dek_with_key(dek, &kek).map_err(err)?;
        biometric::store_kek(&session.vault_id, &kek)?;
        (session.vault_id.clone(), wrapped)
    };
    // Update keyfile and persist.
    {
        let mut session = state.session.lock().unwrap();
        if let Some(kf) = session.keyfile.as_mut() {
            kf.wrapped_dek_biometric = Some(wrapped);
        }
    }
    persist(&app, &state)?;
    let _ = vault_id;
    Ok(())
}

#[tauri::command]
fn disable_biometric(app: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    let vault_id = {
        let mut session = state.session.lock().unwrap();
        if !session.unlocked {
            return Err(StoreError::Locked.to_string());
        }
        if let Some(kf) = session.keyfile.as_mut() {
            kf.wrapped_dek_biometric = None;
        }
        session.vault_id.clone()
    };
    let _ = biometric::delete_kek(&vault_id);
    persist(&app, &state)
}

// ---- credential CRUD ----

#[tauri::command]
fn list_entries(state: State<AppState>) -> Result<Vec<Credential>, String> {
    let session = state.session.lock().unwrap();
    if !session.unlocked {
        return Err(StoreError::Locked.to_string());
    }
    Ok(session.data.entries.clone())
}

#[tauri::command]
fn upsert_entry(
    app: tauri::AppHandle,
    state: State<AppState>,
    mut entry: Credential,
) -> Result<Credential, String> {
    {
        let mut session = state.session.lock().unwrap();
        if !session.unlocked {
            return Err(StoreError::Locked.to_string());
        }
        let now = store::now_secs();
        if entry.id.is_empty() {
            entry.id = store::new_id();
            entry.created_at = now;
            entry.updated_at = now;
            session.data.entries.push(entry.clone());
        } else {
            entry.updated_at = now;
            if let Some(existing) = session.data.entries.iter_mut().find(|e| e.id == entry.id) {
                entry.created_at = existing.created_at;
                // Preserve history; record the old password if it changed.
                entry.history = existing.history.clone();
                if !existing.password.is_empty() && existing.password != entry.password {
                    entry.history.push(HistoryEntry {
                        password: existing.password.clone(),
                        changed_at: now,
                    });
                    // Keep the last 10 only.
                    let len = entry.history.len();
                    if len > 10 {
                        entry.history.drain(0..len - 10);
                    }
                }
                *existing = entry.clone();
            } else {
                return Err(StoreError::NotFound.to_string());
            }
        }
    }
    persist(&app, &state)?;
    Ok(entry)
}

#[tauri::command]
fn delete_entry(app: tauri::AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    {
        let mut session = state.session.lock().unwrap();
        if !session.unlocked {
            return Err(StoreError::Locked.to_string());
        }
        let before = session.data.entries.len();
        session.data.entries.retain(|e| e.id != id);
        if session.data.entries.len() == before {
            return Err(StoreError::NotFound.to_string());
        }
    }
    persist(&app, &state)
}

// ---- folder CRUD ----

#[tauri::command]
fn list_folders(state: State<AppState>) -> Result<Vec<NoteFolder>, String> {
    let session = state.session.lock().unwrap();
    if !session.unlocked {
        return Err(StoreError::Locked.to_string());
    }
    Ok(session.data.folders.clone())
}

#[tauri::command]
fn upsert_folder(
    app: tauri::AppHandle,
    state: State<AppState>,
    mut folder: NoteFolder,
) -> Result<NoteFolder, String> {
    {
        let mut session = state.session.lock().unwrap();
        if !session.unlocked {
            return Err(StoreError::Locked.to_string());
        }
        let now = store::now_secs();
        if folder.id.is_empty() {
            folder.id = store::new_id();
            folder.created_at = now;
            folder.updated_at = now;
            session.data.folders.push(folder.clone());
        } else {
            folder.updated_at = now;
            if let Some(existing) = session.data.folders.iter_mut().find(|f| f.id == folder.id) {
                folder.created_at = existing.created_at;
                *existing = folder.clone();
            } else {
                return Err(StoreError::NotFound.to_string());
            }
        }
    }
    persist(&app, &state)?;
    Ok(folder)
}

#[tauri::command]
fn delete_folder(app: tauri::AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    {
        let mut session = state.session.lock().unwrap();
        if !session.unlocked {
            return Err(StoreError::Locked.to_string());
        }
        let before = session.data.folders.len();
        session.data.folders.retain(|f| f.id != id);
        if session.data.folders.len() == before {
            return Err(StoreError::NotFound.to_string());
        }
        // Move orphaned notes to root (folder_id = None)
        for note in session.data.notes.iter_mut() {
            if note.folder_id.as_deref() == Some(&id) {
                note.folder_id = None;
            }
        }
    }
    persist(&app, &state)
}

// ---- note CRUD ----

#[tauri::command]
fn list_notes(state: State<AppState>) -> Result<Vec<NoteFile>, String> {
    let session = state.session.lock().unwrap();
    if !session.unlocked {
        return Err(StoreError::Locked.to_string());
    }
    Ok(session.data.notes.clone())
}

#[tauri::command]
fn upsert_note(
    app: tauri::AppHandle,
    state: State<AppState>,
    mut note: NoteFile,
) -> Result<NoteFile, String> {
    {
        let mut session = state.session.lock().unwrap();
        if !session.unlocked {
            return Err(StoreError::Locked.to_string());
        }
        let now = store::now_secs();
        if note.id.is_empty() {
            note.id = store::new_id();
            note.created_at = now;
            note.updated_at = now;
            session.data.notes.push(note.clone());
        } else {
            note.updated_at = now;
            if let Some(existing) = session.data.notes.iter_mut().find(|n| n.id == note.id) {
                note.created_at = existing.created_at;
                *existing = note.clone();
            } else {
                return Err(StoreError::NotFound.to_string());
            }
        }
    }
    persist(&app, &state)?;
    Ok(note)
}

#[tauri::command]
fn delete_note(app: tauri::AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    {
        let mut session = state.session.lock().unwrap();
        if !session.unlocked {
            return Err(StoreError::Locked.to_string());
        }
        let before = session.data.notes.len();
        session.data.notes.retain(|n| n.id != id);
        if session.data.notes.len() == before {
            return Err(StoreError::NotFound.to_string());
        }
    }
    persist(&app, &state)
}

#[tauri::command]
fn change_master_password(
    app: tauri::AppHandle,
    state: State<AppState>,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    {
        let mut session = state.session.lock().unwrap();
        if !session.unlocked {
            return Err(StoreError::Locked.to_string());
        }
        let keyfile = session.keyfile.clone().ok_or(StoreError::Locked).map_err(err)?;
        crypto::unlock_with_password(&keyfile, &current_password).map_err(err)?;
        let dek = session.dek.as_ref().ok_or(StoreError::Locked).map_err(err)?;
        let updated = crypto::change_password(&keyfile, dek, &new_password).map_err(err)?;
        session.keyfile = Some(updated);
    }
    persist(&app, &state)
}

// ---- TOTP / password generator ----

/// Compute the live TOTP code for a stored 2FA secret.
#[tauri::command]
fn totp_code(secret: String) -> Result<TotpCode, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let code = totp::totp_now(&secret, now).ok_or("invalid TOTP secret")?;
    Ok(TotpCode {
        code,
        seconds_remaining: totp::seconds_remaining(now) as u32,
    })
}

// ---- import / export ----

use serde::Deserialize;

#[derive(Serialize, Deserialize)]
pub struct PlainExport {
    pub name: String,
    pub exported_at: i64,
    pub entries: Vec<Credential>,
    #[serde(default)]
    pub folders: Vec<NoteFolder>,
    #[serde(default)]
    pub notes: Vec<NoteFile>,
}

/// Import an encrypted `.rovault` backup to restore / overwrite the vault.
/// No password is needed to import because nothing is decrypted. The user can
/// unlock the restored vault with its master password or recovery key.
#[tauri::command]
fn import_encrypted(
    app: tauri::AppHandle,
    state: State<AppState>,
    json: String,
) -> Result<VaultSummary, String> {
    let vault = store::prepare_encrypted_import(&json).map_err(err)?;
    let path = vault_path(&app, &state, &vault.id)?;
    store::write_vault_file(&path, &vault).map_err(err)?;

    // If the imported vault is currently unlocked in session, update session state
    {
        let mut session = state.session.lock().unwrap();
        if session.unlocked && session.vault_id == vault.id {
            session.name = vault.name.clone();
            session.keyfile = Some(vault.keyfile.clone());
            if let Some(dek) = &session.dek {
                if let Ok(data) = store::open_data(dek, &vault.entries_blob) {
                    session.data = data;
                }
            }
        }
    }

    Ok(VaultSummary {
        id: vault.id,
        name: vault.name,
        created_at: vault.created_at,
        biometric_enabled: false,
    })
}

#[tauri::command]
fn export_encrypted(app: tauri::AppHandle, state: State<AppState>) -> Result<String, String> {
    let vault_id = {
        let session = state.session.lock().unwrap();
        if !session.unlocked {
            return Err(StoreError::Locked.to_string());
        }
        session.vault_id.clone()
    };
    let vf = read_meta(&app, &state, &vault_id).map_err(err)?;
    serde_json::to_string_pretty(&vf).map_err(err)
}

#[tauri::command]
fn export_plaintext(state: State<AppState>) -> Result<String, String> {
    let session = state.session.lock().unwrap();
    if !session.unlocked {
        return Err(StoreError::Locked.to_string());
    }
    let payload = PlainExport {
        name: session.name.clone(),
        exported_at: store::now_secs(),
        entries: session.data.entries.clone(),
        folders: session.data.folders.clone(),
        notes: session.data.notes.clone(),
    };
    serde_json::to_string_pretty(&payload).map_err(err)
}

#[tauri::command]
fn import_plaintext(
    app: tauri::AppHandle,
    state: State<AppState>,
    json: String,
) -> Result<usize, String> {
    let parsed: PlainExport =
        serde_json::from_str(&json).map_err(|e| format!("could not parse import file: {e}"))?;
    let mut count = 0;
    {
        let mut session = state.session.lock().unwrap();
        if !session.unlocked {
            return Err(StoreError::Locked.to_string());
        }
        let now = store::now_secs();
        for mut c in parsed.entries {
            c.id = store::new_id();
            if c.created_at == 0 {
                c.created_at = now;
            }
            c.updated_at = now;
            session.data.entries.push(c);
            count += 1;
        }
        for mut f in parsed.folders {
            f.id = store::new_id();
            if f.created_at == 0 {
                f.created_at = now;
            }
            f.updated_at = now;
            session.data.folders.push(f);
            count += 1;
        }
        for mut n in parsed.notes {
            n.id = store::new_id();
            if n.created_at == 0 {
                n.created_at = now;
            }
            n.updated_at = now;
            session.data.notes.push(n);
            count += 1;
        }
    }
    persist(&app, &state)?;
    Ok(count)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            list_vaults,
            session_info,
            create_vault,
            unlock,
            unlock_biometric,
            lock,
            delete_vault,
            biometric_status,
            biometric_reason,
            enable_biometric,
            disable_biometric,
            list_entries,
            upsert_entry,
            delete_entry,
            list_folders,
            upsert_folder,
            delete_folder,
            list_notes,
            upsert_note,
            delete_note,
            change_master_password,
            totp_code,
            import_encrypted,
            export_encrypted,
            export_plaintext,
            import_plaintext,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
