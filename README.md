<div align="center">

<img src="app-icon.png" width="112" alt="Keyra logo" />

# Keyra

**Your passwords and subscriptions, in one encrypted vault.**

A local-first desktop password manager and subscription tracker. No cloud, no account: your data never leaves your device.

[![Release](https://img.shields.io/github/v/release/vezironi/keyra-app?style=flat-square&color=6366f1)](https://github.com/vezironi/keyra-app/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/vezironi/keyra-app/total?style=flat-square&color=10b981)](https://github.com/vezironi/keyra-app/releases)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![Rust](https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white)

[**Download**](https://github.com/vezironi/keyra-app/releases/latest) · [Features](#-features) · [Security](#-security) · [Development](#%EF%B8%8F-development)

</div>

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🔑 Password vault
- Logins, cards, secure notes and identities
- Folders, quick search and command palette
- Built-in **TOTP (2FA)** codes
- Encrypted file attachments (up to 50 MB)
- Password generator
- 30-day trash with restore

</td>
<td width="50%" valign="top">

### 📅 Subscription tracker
- Weekly to yearly and custom billing cycles
- Payment calendar and upcoming payments
- Spending per card and per category
- 6-month history + 6-month projection
- Yearly reports
- Trial-ending and unused-subscription alerts
- Multi-currency with automatic exchange rates

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🛡️ Security center
- Weak and reused password detection
- Breach checks via **Have I Been Pwned** (k-anonymity)
- Expiring card alerts

</td>
<td width="50%" valign="top">

### 🖥️ Desktop integration
- **Windows Hello** unlock (PIN, fingerprint, face)
- System tray and close-to-tray
- Global quick-search shortcut
- Auto-type (Windows)
- Auto-lock and clipboard clearing
- Browser extension bridge

</td>
</tr>
</table>

### 📦 Import from anywhere

Bitwarden · 1Password · LastPass · Dashlane · KeePass / KeePassXC · Chrome / Edge / Brave · Firefox · generic CSV

Scheduled automatic backups to a folder of your choice. Available in **English** and **Turkish**.

## 🔒 Security

Keyra is **zero-knowledge** and **local-first**. The vault is a single encrypted file on your device.

| | |
|---|---|
| **Key derivation** | Argon2id from your master password |
| **Encryption** | XChaCha20-Poly1305, 256-bit key |
| **In memory** | The key exists only while unlocked and is zeroized on lock |
| **Attachments** | Encrypted separately, bound to their id so files can't be swapped |
| **Windows Hello** | Vault key wrapped with DPAPI, gated behind a Hello prompt |
| **Browser bridge** | Loopback only, rejects web pages; in-app pairing approval and a 256-bit token |
| **Breach check** | Only the first 5 characters of a SHA-1 hash are sent |

The app only talks to the network for breach checks (`api.pwnedpasswords.com`), exchange rates (`api.frankfurter.dev`) and site icons.

> [!IMPORTANT]
> There is no password recovery. If you forget your master password, the vault can't be decrypted. Keep backups.

## 📥 Installation

Grab the latest installer from the [**Releases**](https://github.com/vezironi/keyra-app/releases/latest) page.

| Platform | File |
|---|---|
| Windows | `.exe` installer or `.msi` |
| macOS | `.dmg` |
| Linux | `.AppImage` / `.deb` |

## 🛠️ Development

**Requirements:** [Node.js](https://nodejs.org) 20+, [pnpm](https://pnpm.io), [Rust](https://rustup.rs) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
pnpm install        # install dependencies
pnpm tauri dev      # run the app in development
pnpm tauri build    # build installers into src-tauri/target/release/bundle
```

### Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui
- **Backend:** Rust, Tauri 2
- **Crypto:** `argon2`, `chacha20poly1305`, `zeroize`

### Project structure

```
src/
├── pages/        # Dashboard, vault, subscriptions, calendar, reports, security, settings
├── components/   # UI components (shadcn/ui in components/ui)
├── lib/          # Vault logic, importers, TOTP, breach check, reports
└── i18n/         # English and Turkish translations
src-tauri/src/
├── vault.rs        # Encrypted vault storage
├── attachments.rs  # Encrypted file attachments
├── hello.rs        # Windows Hello unlock
├── browser.rs      # Browser extension bridge
└── shell.rs        # Tray, global shortcut, auto-type
```

## 🤝 Contributing

Bug reports and feature requests are welcome. [Open an issue](https://github.com/vezironi/keyra-app/issues).

---

<div align="center">

Made with ❤️ by [vezironi](https://github.com/vezironi)

</div>
