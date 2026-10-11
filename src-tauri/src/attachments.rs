//! Encrypted file attachments.
//!
//! Each attachment is its own file under `attachments/`, sealed with the vault key
//! (XChaCha20-Poly1305, the attachment id bound in as associated data so files
//! can't be swapped). Keeping them out of the vault JSON keeps saves fast. They
//! are bundled into backups and re-encrypted when the master password changes.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::Serialize;
use tauri::{AppHandle, State};
use zeroize::Zeroizing;

use crate::vault::{self, VaultState};

const DIR: &str = "attachments";
const EXT: &str = "bin";
const MAX_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Serialize)]
pub struct AttachmentMeta {
    id: String,
    name: String,
    size: u64,
}

fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = vault::data_dir(app)?.join(DIR);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn valid_id(id: &str) -> bool {
    id.len() == 32 && id.chars().all(|c| c.is_ascii_hexdigit())
}

fn file_of(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("attachment_missing".into());
    }
    Ok(dir(app)?.join(format!("{id}.{EXT}")))
}

fn aad(id: &str) -> Vec<u8> {
    format!("keyra-attachment-v1:{id}").into_bytes()
}

fn seal(key: &[u8; 32], id: &str, plain: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = XChaCha20Poly1305::new(key.into());
    let mut nonce = [0u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let ct = cipher
        .encrypt(XNonce::from_slice(&nonce), Payload { msg: plain, aad: &aad(id) })
        .map_err(|_| "encrypt_failed".to_string())?;
    Ok([nonce.as_slice(), &ct].concat())
}

fn unseal(key: &[u8; 32], id: &str, blob: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
    if blob.len() < 24 {
        return Err("attachment_corrupt".into());
    }
    let cipher = XChaCha20Poly1305::new(key.into());
    let plain = cipher
        .decrypt(XNonce::from_slice(&blob[..24]), Payload { msg: &blob[24..], aad: &aad(id) })
        .map_err(|_| "attachment_corrupt".to_string())?;
    Ok(Zeroizing::new(plain))
}

/// Every stored attachment as (id, path).
fn stored(app: &AppHandle) -> Result<Vec<(String, PathBuf)>, String> {
    let entries = fs::read_dir(dir(app)?).map_err(|e| format!("read_failed:{e}"))?;
    Ok(entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter_map(|p| {
            let id = p.file_stem()?.to_str()?.to_string();
            (p.extension()? == EXT && valid_id(&id)).then_some((id, p))
        })
        .collect())
}

/// Sealed attachments as base64, for embedding in a backup file.
pub(crate) fn bundle(app: &AppHandle) -> Result<BTreeMap<String, String>, String> {
    stored(app)?
        .into_iter()
        .map(|(id, path)| {
            let blob = fs::read(&path).map_err(|e| format!("backup_failed:{e}"))?;
            Ok((id, B64.encode(blob)))
        })
        .collect()
}

/// Replaces every attachment with the ones from a restored backup.
pub(crate) fn replace_all(app: &AppHandle, bundled: &BTreeMap<String, String>) -> Result<(), String> {
    remove_all(app);
    let dir = dir(app)?;
    for (id, b64) in bundled {
        if !valid_id(id) {
            continue;
        }
        let blob = B64.decode(b64).map_err(|_| "corrupt_vault")?;
        fs::write(dir.join(format!("{id}.{EXT}")), blob).map_err(|e| format!("write_failed:{e}"))?;
    }
    Ok(())
}

pub(crate) fn remove_all(app: &AppHandle) {
    if let Ok(dir) = dir(app) {
        let _ = fs::remove_dir_all(dir);
    }
}

/// Re-encrypts every attachment for a new key into `<id>.new` files. Call [`commit`]
/// once the vault itself has been written with the new key.
pub(crate) fn rekey(app: &AppHandle, old: &[u8; 32], new: &[u8; 32]) -> Result<Vec<(PathBuf, PathBuf)>, String> {
    let mut pending = Vec::new();
    for (id, path) in stored(app)? {
        let blob = fs::read(&path).map_err(|e| format!("read_failed:{e}"))?;
        // An attachment the old key can't open is already lost; leave it alone.
        let Ok(plain) = unseal(old, &id, &blob) else { continue };
        let tmp = path.with_extension("new");
        fs::write(&tmp, seal(new, &id, &plain)?).map_err(|e| format!("write_failed:{e}"))?;
        pending.push((tmp, path));
    }
    Ok(pending)
}

pub(crate) fn commit(pending: Vec<(PathBuf, PathBuf)>) {
    for (tmp, path) in pending {
        let _ = fs::rename(tmp, path);
    }
}

fn key(state: &VaultState) -> Result<Zeroizing<[u8; 32]>, String> {
    vault::session_key(state).ok_or_else(|| "vault_locked".to_string())
}

#[tauri::command]
pub async fn attachment_add(app: AppHandle, state: State<'_, VaultState>, path: String) -> Result<AttachmentMeta, String> {
    let key = key(&state)?;
    let source = Path::new(&path);
    let size = fs::metadata(source).map_err(|e| format!("read_failed:{e}"))?.len();
    if size > MAX_BYTES {
        return Err("file_too_large".into());
    }
    let plain = Zeroizing::new(fs::read(source).map_err(|e| format!("read_failed:{e}"))?);
    let mut raw = [0u8; 16];
    OsRng.fill_bytes(&mut raw);
    let id: String = raw.iter().map(|b| format!("{b:02x}")).collect();
    fs::write(file_of(&app, &id)?, seal(&key, &id, &plain)?).map_err(|e| format!("write_failed:{e}"))?;
    let name = source.file_name().and_then(|n| n.to_str()).unwrap_or("file").to_string();
    Ok(AttachmentMeta { id, name, size })
}

/// Decrypts an attachment to `path` (a location the user picked).
#[tauri::command]
pub async fn attachment_save(app: AppHandle, state: State<'_, VaultState>, id: String, path: String) -> Result<(), String> {
    let key = key(&state)?;
    let blob = fs::read(file_of(&app, &id)?).map_err(|_| "attachment_missing")?;
    let plain = unseal(&key, &id, &blob)?;
    fs::write(&path, plain.as_slice()).map_err(|e| format!("write_failed:{e}"))
}

#[tauri::command]
pub fn attachment_delete(app: AppHandle, id: String) -> Result<(), String> {
    let path = file_of(&app, &id)?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("delete_failed:{e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_roundtrip_binds_id() {
        let key = [3u8; 32];
        let id = "0123456789abcdef0123456789abcdef";
        let blob = seal(&key, id, b"hello").unwrap();
        assert_eq!(unseal(&key, id, &blob).unwrap().as_slice(), b"hello");
        assert!(unseal(&key, "ffffffffffffffffffffffffffffffff", &blob).is_err());
        assert!(unseal(&[4u8; 32], id, &blob).is_err());
    }
}
