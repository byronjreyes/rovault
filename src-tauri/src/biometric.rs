//! Windows Hello biometric unlock support.
//!
//! Security model: biometrics are a CONVENIENCE unlock, not a replacement for the
//! master password. We store a random 32-byte "biometric KEK" in the OS credential
//! store (Windows Credential Manager via the `keyring` crate). The vault's keyfile
//! holds the DEK wrapped by that KEK. To release/use it we first require a genuine
//! Windows Hello gesture (`UserConsentVerifier`). If Hello is unavailable, disabled,
//! or the stored key is missing, the caller falls back to password / recovery key.
//!
//! The user's biometric data never reaches ROVault — Windows performs the check and
//! only tells us pass/fail.

const SERVICE: &str = "ROVault";

fn entry_key(vault_id: &str) -> String {
    format!("biometric-kek::{vault_id}")
}

/// Is Windows Hello available and enrolled on this device?
#[cfg(target_os = "windows")]
pub fn hello_available() -> bool {
    availability_reason() == "available"
}

/// Detailed availability reason, so the UI can guide the user.
/// Returns one of: "available", "device_not_present", "not_configured",
/// "disabled_by_policy", "device_busy", "unknown", or "error: …".
#[cfg(target_os = "windows")]
pub fn availability_reason() -> String {
    use windows::Security::Credentials::UI::{
        UserConsentVerifier, UserConsentVerifierAvailability,
    };
    match UserConsentVerifier::CheckAvailabilityAsync() {
        Ok(op) => match block_on(op) {
            Ok(a) => match a {
                UserConsentVerifierAvailability::Available => "available".into(),
                UserConsentVerifierAvailability::DeviceNotPresent => "device_not_present".into(),
                UserConsentVerifierAvailability::NotConfiguredForUser => "not_configured".into(),
                UserConsentVerifierAvailability::DisabledByPolicy => "disabled_by_policy".into(),
                UserConsentVerifierAvailability::DeviceBusy => "device_busy".into(),
                _ => "unknown".into(),
            },
            Err(e) => format!("error: {e}"),
        },
        Err(e) => format!("error: {e}"),
    }
}

#[cfg(not(target_os = "windows"))]
pub fn hello_available() -> bool {
    false
}

#[cfg(not(target_os = "windows"))]
pub fn availability_reason() -> String {
    "not_windows".into()
}

/// Minimal blocking executor for a WinRT IAsyncOperation (which implements
/// `IntoFuture`). Parks the thread and wakes it when the future is ready — no
/// async runtime dependency required.
#[cfg(target_os = "windows")]
fn block_on<F: std::future::IntoFuture>(op: F) -> F::Output {
    use std::future::Future;
    use std::sync::{Arc, Mutex, Condvar};
    use std::task::{Context, Poll, Wake, Waker};

    struct ThreadWaker {
        ready: Mutex<bool>,
        cv: Condvar,
    }
    impl Wake for ThreadWaker {
        fn wake(self: Arc<Self>) {
            self.wake_by_ref();
        }
        fn wake_by_ref(self: &Arc<Self>) {
            *self.ready.lock().unwrap() = true;
            self.cv.notify_one();
        }
    }

    let waker_state = Arc::new(ThreadWaker {
        ready: Mutex::new(false),
        cv: Condvar::new(),
    });
    let waker = Waker::from(waker_state.clone());
    let mut cx = Context::from_waker(&waker);

    let fut = op.into_future();
    let mut fut = Box::pin(fut);
    loop {
        match fut.as_mut().poll(&mut cx) {
            Poll::Ready(val) => return val,
            Poll::Pending => {
                let mut ready = waker_state.ready.lock().unwrap();
                while !*ready {
                    ready = waker_state.cv.wait(ready).unwrap();
                }
                *ready = false;
            }
        }
    }
}

/// Prompt the user for a Windows Hello gesture. Returns Ok(()) only on success.
#[cfg(target_os = "windows")]
pub fn request_hello(message: &str) -> Result<(), String> {
    use windows::core::HSTRING;
    use windows::Security::Credentials::UI::{UserConsentVerificationResult, UserConsentVerifier};
    let msg = HSTRING::from(message);
    let op = UserConsentVerifier::RequestVerificationAsync(&msg)
        .map_err(|e| format!("Hello request failed: {e}"))?;
    let result = block_on(op).map_err(|e| format!("Hello prompt failed: {e}"))?;
    if result == UserConsentVerificationResult::Verified {
        Ok(())
    } else {
        Err("Windows Hello verification was not successful".into())
    }
}

#[cfg(not(target_os = "windows"))]
pub fn request_hello(_message: &str) -> Result<(), String> {
    Err("Windows Hello is only available on Windows".into())
}

/// Store the biometric KEK (base64) in the OS credential store for a vault.
pub fn store_kek(vault_id: &str, kek: &[u8]) -> Result<(), String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let entry = keyring::Entry::new(SERVICE, &entry_key(vault_id))
        .map_err(|e| format!("keyring error: {e}"))?;
    entry
        .set_password(&STANDARD.encode(kek))
        .map_err(|e| format!("could not store key: {e}"))
}

/// Retrieve the biometric KEK from the OS credential store.
pub fn load_kek(vault_id: &str) -> Result<Vec<u8>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let entry = keyring::Entry::new(SERVICE, &entry_key(vault_id))
        .map_err(|e| format!("keyring error: {e}"))?;
    let b64 = entry
        .get_password()
        .map_err(|e| format!("no stored biometric key: {e}"))?;
    STANDARD
        .decode(b64.trim())
        .map_err(|e| format!("corrupt stored key: {e}"))
}

/// Remove the biometric KEK (when the user disables Hello or deletes the vault).
pub fn delete_kek(vault_id: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, &entry_key(vault_id))
        .map_err(|e| format!("keyring error: {e}"))?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        // Not-found is fine — nothing to remove.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("could not remove key: {e}")),
    }
}
