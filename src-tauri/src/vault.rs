//! Encrypted vault storage.
//!
//! Errors are returned as stable codes (optionally `code:detail`); the frontend
//! translates them into the UI language.
//!
//! The whole vault (logins, cards, notes, subscriptions, settings) is a single JSON
//! document owned by the frontend. On disk it is encrypted with XChaCha20-Poly1305
//! using a 256-bit key derived from the master password with Argon2id. The derived
//! key lives only in memory while the vault is unlocked and is zeroized on lock.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use zeroize::Zeroizing;

const FILE_NAME: &str = "vault.keyra";
const FORMAT_VERSION: u32 = 1;
const AAD: &[u8] = b"keyra-vault-v1";
const MIN_PASSWORD_LEN: usize = 8;
const AUTO_PREFIX: &str = "keyra-auto-";
const MAX_IMPORT_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Serialize, Deserialize, Clone, Copy)]
struct KdfParams {
    m_cost: u32,
    t_cost: u32,
    p_cost: u32,
}

impl Default for KdfParams {
    fn default() -> Self {
        // 64 MiB, 3 passes, 4 lanes (OWASP-recommended range for Argon2id).
        Self { m_cost: 64 * 1024, t_cost: 3, p_cost: 4 }
    }
}

#[derive(Serialize, Deserialize)]
struct VaultFile {
    version: u32,
    kdf: KdfParams,
    salt: String,
    nonce: String,
    ciphertext: String,
    /// Sealed attachments (base64), only present in backup files.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    attachments: BTreeMap<String, String>,
}

struct Session {
    key: Zeroizing<[u8; 32]>,
    salt: [u8; 16],
    kdf: KdfParams,
}

#[derive(Default)]
pub struct VaultState(Mutex<Option<Session>>);

#[derive(Serialize)]
pub struct VaultStatus {
    exists: bool,
    unlocked: bool,
    path: String,
}

pub(crate) fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn vault_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(FILE_NAME))
}

fn derive_key(password: &str, salt: &[u8], kdf: KdfParams) -> Result<Zeroizing<[u8; 32]>, String> {
    let params = Params::new(kdf.m_cost, kdf.t_cost, kdf.p_cost, Some(32)).map_err(|e| e.to_string())?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = Zeroizing::new([0u8; 32]);
    argon
        .hash_password_into(password.as_bytes(), salt, key.as_mut())
        .map_err(|e| e.to_string())?;
    Ok(key)
}

fn encrypt(session: &Session, plaintext: &str) -> Result<VaultFile, String> {
    let cipher = XChaCha20Poly1305::new(session.key.as_ref().into());
    let mut nonce = [0u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt(XNonce::from_slice(&nonce), Payload { msg: plaintext.as_bytes(), aad: AAD })
        .map_err(|_| "encrypt_failed".to_string())?;
    Ok(VaultFile {
        version: FORMAT_VERSION,
        kdf: session.kdf,
        salt: B64.encode(session.salt),
        nonce: B64.encode(nonce),
        ciphertext: B64.encode(ciphertext),
        attachments: BTreeMap::new(),
    })
}

fn file_salt(file: &VaultFile) -> Result<[u8; 16], String> {
    if file.version != FORMAT_VERSION {
        return Err("unsupported_version".into());
    }
    let salt = B64.decode(&file.salt).map_err(|_| "corrupt_vault")?;
    salt.try_into().map_err(|_| "corrupt_vault".into())
}

/// Decrypts a vault file with the given password, returning the plaintext and a session.
fn open(file: &VaultFile, password: &str) -> Result<(String, Session), String> {
    let salt = file_salt(file)?;
    let key = derive_key(password, &salt, file.kdf)?;
    open_with_key(file, key)
}

/// Decrypts a vault file with an already derived key (Windows Hello unlock).
fn open_with_key(file: &VaultFile, key: Zeroizing<[u8; 32]>) -> Result<(String, Session), String> {
    let salt = file_salt(file)?;
    let nonce = B64.decode(&file.nonce).map_err(|_| "corrupt_vault")?;
    let ciphertext = B64.decode(&file.ciphertext).map_err(|_| "corrupt_vault")?;
    if nonce.len() != 24 {
        return Err("corrupt_vault".into());
    }

    let cipher = XChaCha20Poly1305::new(key.as_ref().into());
    let plaintext = Zeroizing::new(
        cipher
            .decrypt(XNonce::from_slice(&nonce), Payload { msg: &ciphertext, aad: AAD })
            .map_err(|_| "wrong_password".to_string())?,
    );
    let text = String::from_utf8(plaintext.to_vec()).map_err(|_| "corrupt_vault")?;
    Ok((text, Session { key, salt, kdf: file.kdf }))
}

fn read_file(path: &Path) -> Result<VaultFile, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("read_failed:{e}"))?;
    serde_json::from_str(&raw).map_err(|_| "invalid_vault".into())
}

/// Writes atomically: temp file + rename, so a crash never leaves a half-written vault.
fn write_file(path: &Path, file: &VaultFile) -> Result<(), String> {
    let json = serde_json::to_string(file).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("keyra.tmp");
    fs::write(&tmp, json).map_err(|e| format!("write_failed:{e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("write_failed:{e}"))
}

fn new_session(password: &str) -> Result<Session, String> {
    if password.chars().count() < MIN_PASSWORD_LEN {
        return Err("password_too_short".into());
    }
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let kdf = KdfParams::default();
    let key = derive_key(password, &salt, kdf)?;
    Ok(Session { key, salt, kdf })
}

#[tauri::command]
pub fn vault_status(app: AppHandle, state: State<VaultState>) -> Result<VaultStatus, String> {
    let path = vault_path(&app)?;
    Ok(VaultStatus {
        exists: path.exists(),
        unlocked: state.0.lock().unwrap().is_some(),
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn vault_create(app: AppHandle, state: State<'_, VaultState>, password: String, data: String) -> Result<(), String> {
    let path = vault_path(&app)?;
    if path.exists() {
        return Err("vault_exists".into());
    }
    let session = new_session(&password)?;
    write_file(&path, &encrypt(&session, &data)?)?;
    *state.0.lock().unwrap() = Some(session);
    Ok(())
}

#[tauri::command]
pub async fn vault_unlock(app: AppHandle, state: State<'_, VaultState>, password: String) -> Result<String, String> {
    let file = read_file(&vault_path(&app)?)?;
    let (data, session) = open(&file, &password)?;
    *state.0.lock().unwrap() = Some(session);
    Ok(data)
}

#[tauri::command]
pub fn vault_lock(state: State<VaultState>) {
    *state.0.lock().unwrap() = None;
}

#[tauri::command]
pub fn vault_save(app: AppHandle, state: State<VaultState>, data: String) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    let session = guard.as_ref().ok_or("vault_locked")?;
    write_file(&vault_path(&app)?, &encrypt(session, &data)?)
}

#[tauri::command]
pub async fn vault_change_password(
    app: AppHandle,
    state: State<'_, VaultState>,
    current: String,
    next: String,
) -> Result<(), String> {
    let path = vault_path(&app)?;
    let (data, old) = open(&read_file(&path)?, &current)?;
    let session = new_session(&next)?;
    let pending = crate::attachments::rekey(&app, &old.key, &session.key)?;
    write_file(&path, &encrypt(&session, &data)?)?;
    crate::attachments::commit(pending);
    crate::hello::rewrap(&app, &session.key);
    *state.0.lock().unwrap() = Some(session);
    Ok(())
}

/// Writes the encrypted vault plus its attachments to `path`. The backup stays
/// protected by the master password.
fn write_backup(app: &AppHandle, path: &Path) -> Result<(), String> {
    let mut file = read_file(&vault_path(app)?)?;
    file.attachments = crate::attachments::bundle(app)?;
    write_file(path, &file).map_err(|e| e.replace("write_failed", "backup_failed"))
}

#[tauri::command]
pub fn vault_export(app: AppHandle, state: State<VaultState>, path: String) -> Result<(), String> {
    if state.0.lock().unwrap().is_none() {
        return Err("vault_locked".into());
    }
    write_backup(&app, Path::new(&path))
}

/// Restores a backup: verifies it opens with `password`, then replaces the current vault.
#[tauri::command]
pub async fn vault_import(app: AppHandle, state: State<'_, VaultState>, path: String, password: String) -> Result<String, String> {
    let mut file = read_file(Path::new(&path))?;
    let (data, session) = open(&file, &password)?;
    let attachments = std::mem::take(&mut file.attachments);
    write_file(&vault_path(&app)?, &file)?;
    crate::attachments::replace_all(&app, &attachments)?;
    crate::hello::rewrap(&app, &session.key);
    *state.0.lock().unwrap() = Some(session);
    Ok(data)
}

/// Deletes the vault for good after checking `password`, returning the app to first-run setup.
#[tauri::command]
pub async fn vault_delete(app: AppHandle, state: State<'_, VaultState>, password: String) -> Result<(), String> {
    let path = vault_path(&app)?;
    open(&read_file(&path)?, &password)?;
    fs::remove_file(&path).map_err(|e| format!("delete_failed:{e}"))?;
    let _ = fs::remove_file(path.with_extension("keyra.tmp"));
    crate::hello::forget(&app);
    crate::browser::forget(&app);
    crate::attachments::remove_all(&app);
    *state.0.lock().unwrap() = None;
    Ok(())
}

/// Copies the vault into `dir` as `keyra-auto-<stamp>.keyra` and keeps only the newest `keep` copies.
#[tauri::command]
pub fn vault_backup_auto(app: AppHandle, state: State<VaultState>, dir: String, stamp: String, keep: usize) -> Result<String, String> {
    if state.0.lock().unwrap().is_none() {
        return Err("vault_locked".into());
    }
    if stamp.is_empty() || !stamp.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("backup_failed:invalid name".into());
    }
    let dir = PathBuf::from(dir);
    if !dir.is_dir() {
        return Err("backup_dir_missing".into());
    }
    let target = dir.join(format!("{AUTO_PREFIX}{stamp}.keyra"));
    write_backup(&app, &target)?;

    // Stamps sort chronologically, so the oldest copies come first.
    let mut copies: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(|e| format!("backup_failed:{e}"))?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            name.starts_with(AUTO_PREFIX) && name.ends_with(".keyra")
        })
        .collect();
    copies.sort();
    let excess = copies.len().saturating_sub(keep.max(1));
    for old in &copies[..excess] {
        let _ = fs::remove_file(old);
    }
    Ok(target.to_string_lossy().into_owned())
}

/// Reads a file the user picked (an export from another password manager).
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let meta = fs::metadata(&path).map_err(|e| format!("read_failed:{e}"))?;
    if meta.len() > MAX_IMPORT_BYTES {
        return Err("file_too_large".into());
    }
    let bytes = fs::read(&path).map_err(|e| format!("read_failed:{e}"))?;
    Ok(String::from_utf8_lossy(&bytes).trim_start_matches('\u{feff}').to_string())
}

pub(crate) fn is_unlocked(state: &VaultState) -> bool {
    state.0.lock().unwrap().is_some()
}

/// The key of the unlocked vault, for wrapping with Windows Hello.
pub(crate) fn session_key(state: &VaultState) -> Option<Zeroizing<[u8; 32]>> {
    state.0.lock().unwrap().as_ref().map(|s| s.key.clone())
}

/// Opens the vault with a key unwrapped by Windows Hello.
pub(crate) fn unlock_with_key(app: &AppHandle, state: &VaultState, key: Zeroizing<[u8; 32]>) -> Result<String, String> {
    let file = read_file(&vault_path(app)?)?;
    let (data, session) = open_with_key(&file, key)?;
    *state.0.lock().unwrap() = Some(session);
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_and_wrong_password() {
        let session = new_session("correct horse").unwrap();
        let file = encrypt(&session, "{\"hello\":1}").unwrap();
        let (text, _) = open(&file, "correct horse").unwrap();
        assert_eq!(text, "{\"hello\":1}");
        assert!(open(&file, "wrong password").is_err());
    }

    #[test]
    fn rejects_short_password() {
        assert!(new_session("short").is_err());
    }
}
