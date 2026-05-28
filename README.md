# Vercelwarden

[English](./README.md) · [简体中文](./README.zh-CN.md)

Self-hosted Bitwarden-compatible password manager running on Vercel's free tier.

<a href="https://vercelwarden.vercel.app/web-vault/index.html#/login" target="_blank">Live demo</a>

Fully compatible with:
- Bitwarden Browser Extensions (Chrome, Firefox, Safari, Edge)
- Bitwarden Desktop (Windows, macOS, Linux)
- Bitwarden Mobile (iOS, Android)
- Web Vault

## Features

- Full Bitwarden API compatibility
- Zero-knowledge encryption (server never sees your passwords)
- Argon2id + PBKDF2 KDF support, server-side PBKDF2 stretching of submitted hashes
- TOTP two-factor authentication with recovery code
- Bitwarden Send (text + file)
- Admin dashboard with user management (enable/disable/delete)
- Favicon proxy for password entries
- Vercel Blob storage for attachments and file Sends
- HIBP breach checking (optional)

## Quick Start

### 1. Create a Turso Database

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login and create database
turso db create vercelwarden
turso db tokens create vercelwarden

# Get connection URL
turso db show vercelwarden --url
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Fill in:
- `TURSO_DATABASE_URL` — from step 1
- `TURSO_AUTH_TOKEN` — from step 1
- `JWT_SECRET` — **required, ≥ 32 chars** (e.g. `openssl rand -hex 32`)
- `ADMIN_PASSWORD` — **required, ≥ 8 chars**
- `HIBP_API_KEY` — *optional*, enables breach checking
- `BLOB_READ_WRITE_TOKEN` — *optional*, needed for attachments and file Sends
- `DISABLE_REGISTRATION` — *optional*, set to `true` to close public registration (advertised in `/api/config`)

### 3. Push Database Schema

```bash
npx drizzle-kit push
```

### 4. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# or via CLI:
vercel env add TURSO_DATABASE_URL
vercel env add TURSO_AUTH_TOKEN
vercel env add JWT_SECRET
vercel env add ADMIN_PASSWORD
```

### 5. Configure Bitwarden Client

1. Open Bitwarden browser extension (or desktop app)
2. Click the gear icon (Settings) on the login screen
3. Set "Self-hosted" → Server URL: `https://your-project.vercel.app`
4. Register a new account (registration is open unless you set `DISABLE_REGISTRATION=true`)

## API Compatibility

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/config` `/api/version` `/alive` `/api/alive` | GET | ✅ server metadata |
| `/identity/connect/token` | POST | ✅ password + refresh + 2FA |
| `/identity/accounts/prelogin` `/identity/accounts/prelogin/password` `/api/accounts/prelogin` | POST | ✅ |
| `/api/accounts/register` | POST | ✅ legacy (CLI) |
| `/identity/accounts/register/send-verification-email` | POST | ✅ no SMTP — returns token in-band |
| `/identity/accounts/register/finish` | POST | ✅ |
| `/api/accounts/profile` | GET/PUT/POST | ✅ |
| `/api/accounts/keys` | POST | ✅ |
| `/api/accounts/password` | POST | ✅ |
| `/api/accounts/kdf` | POST | ✅ |
| `/api/accounts/set-password` | POST | ✅ |
| `/api/accounts/verify-password` | POST | ✅ |
| `/api/accounts/security-stamp` | POST | ✅ logout all devices |
| `/api/accounts/delete` | POST/DELETE | ✅ |
| `/api/accounts/password-hint` | POST | ✅ |
| `/api/accounts/avatar` | PUT | ✅ |
| `/api/accounts/revision-date` | GET | ✅ |
| `/api/devices/knowndevice[/{email}/{id}]` | GET | ✅ |
| `/api/sync` | GET | ✅ |
| `/api/ciphers` | GET/POST | ✅ |
| `/api/ciphers/{id}` | GET/PUT/DELETE | ✅ |
| `/api/ciphers/{id}/delete` | PUT | ✅ soft-delete |
| `/api/ciphers/{id}/restore` | PUT | ✅ |
| `/api/ciphers/delete` | PUT | ✅ bulk soft-delete |
| `/api/ciphers/move` | POST | ✅ |
| `/api/ciphers/purge` | POST | ✅ |
| `/api/ciphers/{id}/attachment[/{aid}]` | POST/GET/DELETE | ✅ Vercel Blob |
| `/api/folders` `/api/folders/{id}` | GET/POST/PUT/DELETE | ✅ |
| `/api/two-factor` | GET | ✅ |
| `/api/two-factor/get-authenticator` | POST | ✅ |
| `/api/two-factor/authenticator` | PUT/POST | ✅ TOTP enable |
| `/api/two-factor/disable` | PUT/POST | ✅ |
| `/api/two-factor/recover` | POST | ✅ recovery code |
| `/api/sends` `/api/sends/{id}` | GET/POST/PUT/DELETE | ✅ |
| `/api/sends/file` | POST | ✅ Vercel Blob (4.5 MB on hobby) |
| `/api/sends/{id}/remove-password` | PUT | ✅ |
| `/api/sends/access/{id}[/file/{fid}]` | POST | ✅ public access |
| `/api/hibp/breach` | GET | ✅ requires `HIBP_API_KEY` |
| `/api/icons/{domain}` `/icons/{domain}` | GET | ✅ favicon proxy |
| `/api/settings/domains` | GET | ✅ |
| 2FA (WebAuthn, Email, Duo) | — | 🚧 Out of scope |
| Organizations / Collections | — | 🚧 Out of scope (single-user) |
| Emergency access / SSO | — | 🚧 Out of scope |
| WebSocket notifications | — | ❌ Not available on Vercel (clients fall back to polling) |

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Turso (libSQL edge) + Drizzle ORM
- **Auth**: JWT (jose library)
- **Attachments**: Vercel Blob
- **Hosting**: Vercel (free tier)

## Known Limits

- **File Sends and attachments**: Vercel Blob hobby tier caps individual uploads at ~4.5 MB. Pro tier raises this to 5 GB.
- **No SMTP**: registration uses `/identity/accounts/register/send-verification-email`, but no email is actually sent — the verification token is returned in-band. If you need a real signup gate, set `DISABLE_REGISTRATION=true` and create accounts on a trusted host first.
- **No WebSocket notifications**: Vercel serverless cannot host the SignalR hub. Bitwarden clients fall back to polling `/api/sync` (works fine, just delayed).

## Upgrade Notes (2026-05-27 Bitwarden parity pass)

If you are upgrading from an earlier checkout, the password field semantics changed: `users.password_hash` is now the server's second-round PBKDF2 hash, not the client-submitted hash. **All previously registered accounts must be deleted and re-created** (admin panel → users → delete). Run `npx drizzle-kit push` after pulling. The `invitation_codes` table and `REQUIRE_INVITE_CODE` flag have been removed — drop the table with `DROP TABLE IF EXISTS invitation_codes;` if upgrading.

## License

MIT
