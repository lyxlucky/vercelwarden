# Vercelwarden

[English](./README.md) · [简体中文](./README.zh-CN.md)

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

| 端点 | 方法 | 状态 |
|------|------|------|
| `/api/config` `/api/version` `/alive` `/api/alive` | GET | ✅ 服务器元数据 |
| `/identity/connect/token` | POST | ✅ 密码 + 刷新 + 2FA |
| `/identity/accounts/prelogin` `/identity/accounts/prelogin/password` `/api/accounts/prelogin` | POST | ✅ |
| `/api/accounts/register` | POST | ✅ 旧版（CLI） |
| `/identity/accounts/register/send-verification-email` | POST | ✅ 无 SMTP，token 直接返回 |
| `/identity/accounts/register/finish` | POST | ✅ |
| `/api/accounts/profile` | GET/PUT/POST | ✅ |
| `/api/accounts/keys` | POST | ✅ |
| `/api/accounts/password` | POST | ✅ |
| `/api/accounts/kdf` | POST | ✅ |
| `/api/accounts/set-password` | POST | ✅ |
| `/api/accounts/verify-password` | POST | ✅ |
| `/api/accounts/security-stamp` | POST | ✅ 全设备登出 |
| `/api/accounts/delete` | POST/DELETE | ✅ |
| `/api/accounts/password-hint` | POST | ✅ |
| `/api/accounts/avatar` | PUT | ✅ |
| `/api/accounts/revision-date` | GET | ✅ |
| `/api/devices/knowndevice[/{email}/{id}]` | GET | ✅ |
| `/api/sync` | GET | ✅ |
| `/api/ciphers` | GET/POST | ✅ |
| `/api/ciphers/{id}` | GET/PUT/DELETE | ✅ |
| `/api/ciphers/{id}/delete` | PUT | ✅ 软删除 |
| `/api/ciphers/{id}/restore` | PUT | ✅ |
| `/api/ciphers/delete` | PUT | ✅ 批量软删除 |
| `/api/ciphers/move` | POST | ✅ |
| `/api/ciphers/purge` | POST | ✅ |
| `/api/ciphers/{id}/attachment[/{aid}]` | POST/GET/DELETE | ✅ Vercel Blob |
| `/api/folders` `/api/folders/{id}` | GET/POST/PUT/DELETE | ✅ |
| `/api/two-factor` | GET | ✅ |
| `/api/two-factor/get-authenticator` | POST | ✅ |
| `/api/two-factor/authenticator` | PUT/POST | ✅ 启用 TOTP |
| `/api/two-factor/disable` | PUT/POST | ✅ |
| `/api/two-factor/recover` | POST | ✅ 恢复码 |
| `/api/sends` `/api/sends/{id}` | GET/POST/PUT/DELETE | ✅ |
| `/api/sends/file` | POST | ✅ Vercel Blob（hobby 4.5 MB 上限） |
| `/api/sends/{id}/remove-password` | PUT | ✅ |
| `/api/sends/access/{id}[/file/{fid}]` | POST | ✅ 公开访问 |
| `/api/hibp/breach` | GET | ✅ 需要 `HIBP_API_KEY` |
| `/api/icons/{domain}` `/icons/{domain}` | GET | ✅ 图标代理 |
| `/api/settings/domains` | GET | ✅ |
| 2FA（WebAuthn、邮件、Duo） | — | 🚧 不在范围内 |
| 组织 / 集合 | — | 🚧 不在范围内（单用户） |
| 紧急访问 / SSO | — | 🚧 不在范围内 |
| WebSocket 实时通知 | — | ❌ Vercel 无法承载（客户端会自动降级为轮询） |

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
