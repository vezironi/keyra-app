//! Windows Hello unlock.
//!
//! When enabled, the vault key is wrapped with DPAPI (bound to the current Windows
//! user account) and stored next to the vault. Unwrapping it is gated behind a
//! Windows Hello prompt (PIN, fingerprint or face). The master password keeps
//! working as before; Hello is only a shortcut to the same key.

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, State, WebviewWindow};
use zeroize::Zeroizing;

use crate::vault::{self, VaultState};

const FILE_NAME: &str = "hello.bin";

#[derive(Serialize)]
pub struct HelloStatus {
    available: bool,
    enabled: bool,
}

fn key_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(vault::data_dir(app)?.join(FILE_NAME))
}

fn window_handle(window: &WebviewWindow) -> isize {
    #[cfg(windows)]
    {
        window.hwnd().map(|h| h.0 as isize).unwrap_or(0)
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        0
    }
}

/// Runs a Hello prompt off the async runtime (the WinRT call blocks until the user answers).
async fn verify(window: &WebviewWindow, message: String) -> Result<(), String> {
    let hwnd = window_handle(window);
    tauri::async_runtime::spawn_blocking(move || platform::verify(hwnd, &message))
        .await
        .map_err(|e| format!("hello_failed:{e}"))?
}

/// Re-wraps the key after the master password changed or a backup was restored.
/// If that fails, Hello is turned off rather than left pointing at a stale key.
pub(crate) fn rewrap(app: &AppHandle, key: &Zeroizing<[u8; 32]>) {
    let Ok(path) = key_path(app) else { return };
    if !path.exists() {
        return;
    }
    let written = platform::protect(key.as_ref()).and_then(|blob| fs::write(&path, blob).map_err(|e| e.to_string()));
    if written.is_err() {
        let _ = fs::remove_file(&path);
    }
}

pub(crate) fn forget(app: &AppHandle) {
    if let Ok(path) = key_path(app) {
        let _ = fs::remove_file(path);
    }
}

#[tauri::command]
pub async fn hello_status(app: AppHandle) -> Result<HelloStatus, String> {
    let available = tauri::async_runtime::spawn_blocking(platform::available).await.unwrap_or(false);
    Ok(HelloStatus { available, enabled: available && key_path(&app)?.exists() })
}

#[tauri::command]
pub async fn hello_enable(app: AppHandle, window: WebviewWindow, state: State<'_, VaultState>, message: String) -> Result<(), String> {
    let key = vault::session_key(&state).ok_or("vault_locked")?;
    verify(&window, message).await?;
    let blob = platform::protect(key.as_ref())?;
    fs::write(key_path(&app)?, blob).map_err(|e| format!("write_failed:{e}"))
}

#[tauri::command]
pub fn hello_disable(app: AppHandle) {
    forget(&app);
}

#[tauri::command]
pub async fn hello_unlock(app: AppHandle, window: WebviewWindow, state: State<'_, VaultState>, message: String) -> Result<String, String> {
    let path = key_path(&app)?;
    if !path.exists() {
        return Err("hello_not_enabled".into());
    }
    verify(&window, message).await?;
    let blob = fs::read(&path).map_err(|e| format!("read_failed:{e}"))?;
    let raw = platform::unprotect(&blob)?;
    let key: [u8; 32] = raw.as_slice().try_into().map_err(|_| "hello_invalid")?;
    vault::unlock_with_key(&app, &state, Zeroizing::new(key)).map_err(|e| {
        // A key that no longer opens the vault is useless; make the user re-enable Hello.
        if e == "wrong_password" {
            forget(&app);
            "hello_invalid".to_string()
        } else {
            e
        }
    })
}

#[cfg(windows)]
mod platform {
    use windows::core::{factory, HSTRING, PCWSTR};
    use windows::Security::Credentials::UI::{UserConsentVerificationResult, UserConsentVerifier, UserConsentVerifierAvailability};
    use windows::Win32::Foundation::{LocalFree, HLOCAL, HWND};
    use windows::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB};
    use windows::Win32::System::WinRT::IUserConsentVerifierInterop;
    use windows_future::IAsyncOperation;
    use zeroize::{Zeroize, Zeroizing};

    const ENTROPY: &[u8] = b"keyra-hello-v1";

    pub fn available() -> bool {
        UserConsentVerifier::CheckAvailabilityAsync()
            .and_then(|op| op.join())
            .map(|a| a == UserConsentVerifierAvailability::Available)
            .unwrap_or(false)
    }

    pub fn verify(hwnd: isize, message: &str) -> Result<(), String> {
        let fail = |e: windows::core::Error| format!("hello_failed:{}", e.message());
        let interop = factory::<UserConsentVerifier, IUserConsentVerifierInterop>().map_err(fail)?;
        // Parented to our window so the prompt opens in front of the app.
        let op: IAsyncOperation<UserConsentVerificationResult> =
            unsafe { interop.RequestVerificationForWindowAsync(HWND(hwnd as _), &HSTRING::from(message)) }.map_err(fail)?;
        match op.join().map_err(fail)? {
            UserConsentVerificationResult::Verified => Ok(()),
            UserConsentVerificationResult::Canceled => Err("hello_cancelled".into()),
            _ => Err("hello_failed".into()),
        }
    }

    fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
    }

    /// Copies a DPAPI output buffer and frees it (wiping it first).
    unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Zeroizing<Vec<u8>> {
        let slice = unsafe { std::slice::from_raw_parts_mut(out.pbData, out.cbData as usize) };
        let bytes = Zeroizing::new(slice.to_vec());
        slice.zeroize();
        unsafe { LocalFree(Some(HLOCAL(out.pbData as _))) };
        bytes
    }

    pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
        let mut out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptProtectData(&blob(data), PCWSTR::null(), Some(&blob(ENTROPY)), None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
                .map_err(|e| format!("hello_failed:{}", e.message()))?;
            Ok(take(out).to_vec())
        }
    }

    pub fn unprotect(data: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
        let mut out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptUnprotectData(&blob(data), None, Some(&blob(ENTROPY)), None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
                .map_err(|_| "hello_invalid".to_string())?;
            Ok(take(out))
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use zeroize::Zeroizing;

    pub fn available() -> bool {
        false
    }
    pub fn verify(_hwnd: isize, _message: &str) -> Result<(), String> {
        Err("hello_unavailable".into())
    }
    pub fn protect(_data: &[u8]) -> Result<Vec<u8>, String> {
        Err("hello_unavailable".into())
    }
    pub fn unprotect(_data: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
        Err("hello_unavailable".into())
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::platform;

    #[test]
    fn dpapi_roundtrip() {
        let key = [7u8; 32];
        let blob = platform::protect(&key).unwrap();
        assert_ne!(blob.as_slice(), key.as_slice());
        assert_eq!(platform::unprotect(&blob).unwrap().as_slice(), key.as_slice());
        let mut tampered = blob.clone();
        let last = tampered.len() - 1;
        tampered[last] ^= 1;
        assert!(platform::unprotect(&tampered).is_err());
    }
}
