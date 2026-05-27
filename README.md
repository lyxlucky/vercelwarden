# Vercelwarden

> **English** · [中文](#中文文档)

Self-hosted Bitwarden-compatible password manager running on Vercel's free tier.

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
- Invitation-only registration
- Admin dashboard for user/code management
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
- `REQUIRE_INVITE_CODE` — `true` (recommended)
- `HIBP_API_KEY` — *optional*, enables breach checking
- `BLOB_READ_WRITE_TOKEN` — *optional*, needed for attachments and file Sends
- `DISABLE_REGISTRATION` — *optional*, advertises registration-disabled in `/api/config`

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

## API Compatibility

| Endpoint | Method | Status |
|----------|--------|--------|
| `/api/config` `/api/version` `/alive` `/api/alive` | GET | ✅ server metadata |
| `/identity/connect/token` | POST | ✅ password + refresh + 2FA |
| `/identity/accounts/prelogin` `/api/accounts/prelogin` | POST | ✅ |
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
- **No SMTP**: registration uses `/identity/accounts/register/send-verification-email`, but no email is actually sent — the verification token is returned in-band. Combine with invite-code mode (`REQUIRE_INVITE_CODE=true`) for the real gate.
- **No WebSocket notifications**: Vercel serverless cannot host the SignalR hub. Bitwarden clients fall back to polling `/api/sync` (works fine, just delayed).

## Upgrade Notes (2026-05-27 Bitwarden parity pass)

If you are upgrading from an earlier checkout, the password field semantics changed: `users.password_hash` is now the server's second-round PBKDF2 hash, not the client-submitted hash. **All previously registered accounts must be deleted and re-invited** (admin panel → users → delete). Run `npx drizzle-kit push` after pulling.

## License

MIT

---

# 中文文档

> [English](#vercelwarden) · **中文**

部署在 Vercel 免费层上的自托管 Bitwarden 兼容密码管理器。

完全兼容：
- Bitwarden 浏览器扩展（Chrome / Firefox / Safari / Edge）
- Bitwarden 桌面端（Windows / macOS / Linux）
- Bitwarden 移动端（iOS / Android）
- Web Vault

## 特性

- 完整对标 Bitwarden API 协议
- 零知识加密（服务端永远看不到明文密码）
- 同时支持 Argon2id 与 PBKDF2 KDF；服务端对客户端提交的 hash 再做一次 PBKDF2 拉伸
- TOTP 两步验证 + 恢复码
- Bitwarden Send（文本 + 文件）
- 邀请码注册
- 管理员后台（用户/邀请码管理）
- 网站图标代理
- Vercel Blob 存储附件与文件 Send
- 可选 HIBP 密码泄露检查

## 快速开始

### 1. 创建 Turso 数据库

```bash
# 安装 Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# 登录并创建数据库
turso db create vercelwarden
turso db tokens create vercelwarden

# 获取连接 URL
turso db show vercelwarden --url
```

### 2. 配置环境变量

```bash
cp .env.example .env.local
```

填入：
- `TURSO_DATABASE_URL` — 步骤 1 获得
- `TURSO_AUTH_TOKEN` — 步骤 1 获得
- `JWT_SECRET` — **必填，≥ 32 字符**（例如 `openssl rand -hex 32`）
- `ADMIN_PASSWORD` — **必填，≥ 8 字符**
- `REQUIRE_INVITE_CODE` — `true`（推荐）
- `HIBP_API_KEY` — *可选*，启用密码泄露检查
- `BLOB_READ_WRITE_TOKEN` — *可选*，附件和文件 Send 需要
- `DISABLE_REGISTRATION` — *可选*，在 `/api/config` 中声明禁止注册

### 3. 推送数据库 schema

```bash
npx drizzle-kit push
```

### 4. 部署到 Vercel

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
vercel

# 在 Vercel 控制台或 CLI 中设置环境变量：
vercel env add TURSO_DATABASE_URL
vercel env add TURSO_AUTH_TOKEN
vercel env add JWT_SECRET
vercel env add ADMIN_PASSWORD
vercel env add REQUIRE_INVITE_CODE
```

### 5. 配置 Bitwarden 客户端

1. 打开 Bitwarden 浏览器扩展（或桌面端）
2. 登录界面点击齿轮（设置）
3. 选 "Self-hosted" → 服务器 URL 填 `https://your-project.vercel.app`
4. 注册新账号（需要从管理后台获取的邀请码）

## API 兼容性

详见上方英文表格，本项目实现了从基础登录、保险库同步、密码项 CRUD、附件、文件夹、TOTP 两步验证到 Bitwarden Send 的完整 P0 + Sends 协议。

未实现（按设计不做）：组织/集合（多用户）、紧急访问、SSO、WebAuthn/邮件 2FA、WebSocket 实时通知（Vercel serverless 不支持）。

## 技术栈

- **框架**：Next.js 16（App Router）
- **数据库**：Turso（libSQL 边缘）+ Drizzle ORM
- **认证**：JWT（jose 库）
- **附件**：Vercel Blob
- **托管**：Vercel（免费层）

## 已知限制

- **文件 Send 和附件**：Vercel Blob hobby 层单文件上限约 4.5 MB；Pro 层升到 5 GB。
- **不支持 SMTP**：注册流程会调用 `/identity/accounts/register/send-verification-email`，但实际不发邮件 —— verification token 直接随响应返回。请配合邀请码模式 (`REQUIRE_INVITE_CODE=true`) 做真实门禁。
- **不支持 WebSocket 实时通知**：Vercel serverless 无法承载 SignalR Hub。Bitwarden 客户端会自动降级为轮询 `/api/sync`（功能正常，只是会有延迟）。

## 升级说明（2026-05-27 Bitwarden 对标）

如果你是从早期版本升级过来：`users.password_hash` 字段语义已变更，现在存的是服务端二次 PBKDF2 后的 hash，不再是客户端提交的原始 hash。**所有旧账号必须删除后重新邀请注册**（管理后台 → 用户 → 删除）。拉取代码后运行 `npx drizzle-kit push`。

## 许可证

MIT
