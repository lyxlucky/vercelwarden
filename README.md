<div align="center">
  <img src="./public/brand/logo-mark.svg" width="104" height="104" alt="VercelWarden logo" />

  # VercelWarden

  **A self-hosted, Bitwarden-compatible password manager built for Vercel**

  [![MIT License](https://img.shields.io/badge/license-MIT-52D6C5.svg)](./LICENSE)
  [![Next.js 16](https://img.shields.io/badge/Next.js-16-0B1220.svg?logo=next.js)](https://nextjs.org/)
  [![Deploy on Vercel](https://img.shields.io/badge/deploy-Vercel-7186FF.svg?logo=vercel&logoColor=white)](https://vercel.com/)
  [![Turso](https://img.shields.io/badge/database-Turso-4FF8D2.svg)](https://turso.tech/)

  [English](./README.md) · [简体中文](./README.zh-CN.md)

  [Live Demo](https://vercelwarden.vercel.app/login) · [Deployment](./DEPLOYMENT.md) · [API Documentation](./API.md)
</div>

---

## Background

Traditional self-hosted password managers often require an always-on server and ongoing infrastructure or subscription costs. VercelWarden offers a lighter path: it combines Vercel, Turso, and Vercel Blob so individuals and small teams can run a private password vault on a familiar serverless platform.

The project implements the core Bitwarden-compatible APIs required by common clients and includes its own Web Vault. Sensitive vault data is encrypted by the client before synchronization; the server does not store a plaintext master password or plaintext vault contents.

> VercelWarden is a community project. It is not affiliated with or endorsed by Bitwarden Inc. Perform your own security review, key management, and backup planning before production use.

## What it does

VercelWarden lets you:

- host password data inside your own Vercel and Turso accounts;
- use the built-in Web Vault or connect Bitwarden browser, desktop, and mobile clients;
- manage logins, secure notes, TOTP, attachments, folders, favorites, archives, and trash;
- share text or files with Send;
- identify risks with password health, duplicate detection, and optional HIBP checks;
- manage users, audit events, backups, and optional real-time notifications from the admin area.

## Core capabilities

| Capability | Description |
| --- | --- |
| Client-side encryption | Argon2id and PBKDF2 support, plus server-side stretching of submitted authentication hashes |
| Multi-client access | Bitwarden browser, desktop, and mobile clients plus the built-in Web Vault |
| Two-factor authentication | TOTP and recovery codes, with optional Passkey/WebAuthn feature flags in the repository |
| Import and export | Bitwarden JSON/CSV plus account-key or password-protected exports |
| Attachments and Send | Vercel Blob-backed attachments and file Sends |
| Administration and recovery | User governance, auditing, encrypted backups, and merge/replace restore workflows |
| Notifications | Polling by default, optional SSE, and experimental SignalR WebSockets |

## Compatible clients

- Bitwarden browser extensions for Chrome, Firefox, Safari, and Edge
- Bitwarden desktop applications for Windows, macOS, and Linux
- Bitwarden mobile applications for iOS and Android
- Built-in VercelWarden Web Vault

See [API.md](./API.md) for detailed endpoint coverage.

## Technology

- Next.js 16 (App Router) and React 19
- Turso (libSQL) and Drizzle ORM
- JWT / JOSE, Web Crypto, Argon2id / PBKDF2
- Vercel Functions and Vercel Blob
- Vitest and Playwright

## Quick start

Requirements: Node.js 20+, pnpm, a Turso account, and a Vercel account.

```bash
git clone https://github.com/lyxlucky/vercelwarden.git
cd vercelwarden
pnpm install
cp .env.example .env.local
```

Configure at least the following variables:

```dotenv
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-token
JWT_SECRET=your-random-secret
ADMIN_PASSWORD=your-admin-password
SERVER_ENCRYPTION_KEY=your-random-32-byte-base64-key
BACKUP_ENCRYPTION_KEY=another-random-32-byte-base64-key
DOMAIN=https://your-project.vercel.app
```

Then initialize the database and start the development server:

```bash
pnpm db:migrate
pnpm dev
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment, key generation, and optional capabilities. Every supported variable is documented in [.env.example](./.env.example).

## Connect a Bitwarden client

1. Open the server settings from the Bitwarden client login screen.
2. Choose the self-hosted environment.
3. Set the Server URL to `https://your-project.vercel.app`.
4. Register or sign in with your VercelWarden account.

## Known limitations

- The project targets personal and small deployments; organizations, collections, SSO, and emergency access are currently out of scope.
- Vercel Blob Hobby request and upload limits affect larger attachments and file Sends.
- SMTP is not included. Set `DISABLE_REGISTRATION=true` when public registration should be closed.
- WebSocket notifications require Vercel Fluid Compute and Redis-compatible Pub/Sub and remain experimental; SSE and polling are available as fallbacks.

## Documentation

- [Deployment guide](./DEPLOYMENT.md)
- [API compatibility](./API.md)
- [Environment variable template](./.env.example)
- [Database schema](./schema.sql)

## License

VercelWarden is released under the [MIT License](./LICENSE). You may use, copy, modify, merge, publish, distribute, sublicense, or sell copies of the software as long as the original copyright and permission notices are retained.

The software is provided “as is,” without warranty of any kind. Password managers are security-sensitive software; review the code and protect all production keys, database tokens, and backups.

---

<div align="center">
  Built for people who want to own their vault.
</div>
