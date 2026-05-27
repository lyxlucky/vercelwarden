# Vercelwarden

Self-hosted Bitwarden-compatible password manager running on Vercel's free tier.

Fully compatible with:
- Bitwarden Browser Extensions (Chrome, Firefox, Safari, Edge)
- Bitwarden Desktop (Windows, macOS, Linux)
- Bitwarden Mobile (iOS, Android)
- Web Vault

## Features

- Full Bitwarden API compatibility
- Zero-knowledge encryption (server never sees your passwords)
- Argon2id + PBKDF2 KDF support
- Invitation-only registration
- Admin dashboard for user/code management
- Favicon proxy for password entries
- Vercel Blob storage for attachments

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
- `JWT_SECRET` — any random string (e.g. `openssl rand -hex 32`)
- `ADMIN_PASSWORD` — your admin dashboard password
- `REQUIRE_INVITE_CODE` — `true` (recommended)

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
vercel env add REQUIRE_INVITE_CODE
```

### 5. Configure Bitwarden Client

1. Open Bitwarden browser extension (or desktop app)
2. Click the gear icon (Settings) on the login screen
3. Set "Self-hosted" → Server URL: `https://your-project.vercel.app`
4. Register a new account (you'll need an invitation code from the admin panel)

## Project Structure

```
src/
├── app/
│   ├── admin/                          # Admin dashboard (web UI)
│   ├── api/
│   │   ├── accounts/
│   │   │   ├── prelogin/route.ts       # KDF params for login
│   │   │   ├── register/route.ts       # User registration
│   │   │   ├── profile/route.ts        # User profile
│   │   │   ├── keys/route.ts           # RSA key upload
│   │   │   ├── password/route.ts       # Password change
│   │   │   └── kdf/route.ts            # KDF settings change
│   │   ├── admin/
│   │   │   ├── invitations/route.ts    # Invitation code CRUD
│   │   │   └── users/route.ts          # User management
│   │   ├── ciphers/
│   │   │   ├── route.ts                # Cipher list/create
│   │   │   └── [id]/route.ts           # Cipher get/update/delete
│   │   ├── folders/
│   │   │   ├── route.ts                # Folder list/create
│   │   │   └── [id]/route.ts           # Folder get/update/delete
│   │   ├── icons/[domain]/route.ts     # Favicon proxy
│   │   ├── identity/
│   │   │   └── connect/token/route.ts  # OAuth token endpoint
│   │   ├── settings/domains/route.ts   # Equivalent domains
│   │   └── sync/route.ts               # Full vault sync
│   └── page.tsx                        # Homepage
├── db/
│   ├── index.ts                        # Turso client setup
│   └── schema.ts                       # Drizzle ORM schema
└── lib/
    ├── auth.ts                         # JWT auth + token generation
    ├── kdf.ts                          # KDF configuration
    └── responses.ts                    # Bitwarden-compatible responses
```

## API Compatibility

| Endpoint | Method | Status |
|----------|--------|--------|
| `/identity/connect/token` | POST | ✅ password login |
| `/api/accounts/prelogin` | POST | ✅ |
| `/api/accounts/register` | POST | ✅ with invite code |
| `/api/accounts/profile` | GET | ✅ |
| `/api/accounts/keys` | POST | ✅ |
| `/api/accounts/password` | POST | ✅ |
| `/api/accounts/kdf` | POST | ✅ |
| `/api/sync` | GET | ✅ |
| `/api/ciphers` | GET/POST | ✅ |
| `/api/ciphers/{id}` | GET/PUT/DELETE | ✅ |
| `/api/folders` | GET/POST | ✅ |
| `/api/folders/{id}` | GET/PUT/DELETE | ✅ |
| `/api/icons/{domain}` | GET | ✅ favicon proxy |
| `/api/settings/domains` | GET | ✅ |
| `/identity/connect/token` | POST (refresh) | 🚧 TODO |
| 2FA (TOTP) | — | 🚧 Phase 2 |
| Attachments | — | 🚧 Phase 2 |
| Organizations | — | 🚧 Phase 3 |
| Sends | — | 🚧 Phase 3 |
| WebSocket notifications | — | ❌ Not available (use polling) |

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: Turso (SQLite edge) + Drizzle ORM
- **Auth**: JWT (jose library)
- **Attachments**: Vercel Blob
- **Hosting**: Vercel (free tier)

## License

MIT
