# ROVault

A **local, fully-encrypted credential vault** built with Tauri 2 + Rust + React.
No cloud, no network — everything is encrypted on your device and only ever
decrypted in memory inside the app.

## Why it's secure

- **Nothing readable touches disk.** Credentials are serialized then encrypted
  with **XChaCha20-Poly1305** (authenticated encryption). Open `vault.json`
  directly and you see only salts and ciphertext.
- **Argon2id** key derivation (memory-hard, ~64 MiB) turns your master password
  and recovery key into keys — resistant to GPU brute force.
- **Dual-wrapped Data Encryption Key (DEK).** One random DEK encrypts your data.
  It's stored twice — wrapped by your password *and* by your recovery key — so
  either can unlock the vault. Changing your password only re-wraps the DEK; it
  never re-encrypts your data, and your recovery key keeps working.
- **All crypto lives in Rust.** The key material never crosses into JavaScript
  and is zeroized from memory on lock/quit.

## Features

- First-launch onboarding: name the vault, set a master password, generate &
  save a one-time recovery key (copy / download).
- Lock screen on every launch; **"Forgot password? Use recovery key"** fallback.
- Dashboard: sidebar (All / Favorites / auto categories) + provider cards.
- Add / edit / delete credentials, copy username & password (clipboard
  auto-clears after 20s), reveal toggle, built-in password generator + strength
  meter, favorites, notes, categories, website links.
- Settings: **light / dark / system** theme, auto-lock timeout, change master
  password.
- Import / export: encrypted `.rovault` backup, and a guarded plaintext
  export/import for migration.

## Data location

`%APPDATA%\com.rdev.rovault\ROVault\vault.json` (Windows) — always ciphertext.

## Develop

```bash
npm install
npm run tauri dev       # run in dev
npm run tauri build     # production build + installer
```

Run the Rust crypto tests:

```bash
cd src-tauri && cargo test
```

## Stack

- **Tauri 2** shell
- **Rust**: `argon2`, `chacha20poly1305`, `rand`, `zeroize`, `base32`, `uuid`
- **React 19 + TypeScript + Vite**
- **Tailwind CSS + shadcn/ui** components, CSS-variable theming

## Roadmap ideas

TOTP/2FA code storage, biometric unlock (Windows Hello), attachments,
password-audit view, multiple vaults, auto-backup.
