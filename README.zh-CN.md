<div align="center">
  <img src="./public/brand/logo-mark.svg" width="104" height="104" alt="VercelWarden 项目 Logo" />

  # VercelWarden

  **部署在 Vercel 上的自托管、Bitwarden 兼容密码管理器**

  [![MIT License](https://img.shields.io/badge/license-MIT-52D6C5.svg)](./LICENSE)
  [![Next.js 16](https://img.shields.io/badge/Next.js-16-0B1220.svg?logo=next.js)](https://nextjs.org/)
  [![Deploy on Vercel](https://img.shields.io/badge/deploy-Vercel-7186FF.svg?logo=vercel&logoColor=white)](https://vercel.com/)
  [![Turso](https://img.shields.io/badge/database-Turso-4FF8D2.svg)](https://turso.tech/)

  [English](./README.md) · [简体中文](./README.zh-CN.md)

  [在线体验](https://vercelwarden.vercel.app/login) · [部署文档](./DEPLOYMENT.md) · [API 文档](./API.md)
</div>

---

## 项目背景

成熟的密码管理器通常需要一台长期运行的服务器，也可能带来持续的订阅或运维成本。VercelWarden 希望提供一种更轻量的选择：利用 Vercel、Turso 与 Vercel Blob 的托管能力，让个人开发者和小型团队可以在熟悉的 Serverless 平台上部署自己的密码保险库。

项目实现了 Bitwarden 客户端所需的核心兼容接口，并提供自有 Web Vault。敏感保险库数据由客户端加密后再同步，服务端不保存明文主密码或明文保险库内容。

> VercelWarden 是社区项目，与 Bitwarden Inc. 没有关联，也未获得其背书。请在生产使用前自行完成安全评估、密钥管理和备份策略。

## 项目作用

VercelWarden 可以帮助你：

- 在自己的 Vercel 与 Turso 账号中托管密码数据；
- 使用自有 Web Vault，或连接 Bitwarden 浏览器扩展、桌面端与移动端；
- 管理登录信息、安全笔记、TOTP、附件、文件夹、收藏、归档和回收站；
- 使用文本或文件 Send 分享内容；
- 通过密码健康度、重复项检测和可选 HIBP 查询发现安全风险；
- 通过管理后台管理用户、审计、备份及可选实时通知能力。

## 核心能力

| 能力 | 说明 |
| --- | --- |
| 客户端加密 | 支持 Argon2id 与 PBKDF2；服务端对提交的认证哈希再次拉伸 |
| 多端兼容 | 对接 Bitwarden 浏览器扩展、桌面端、移动端及自有 Web Vault |
| 双重验证 | 支持 TOTP 与恢复码，仓库中另有可选 Passkey/WebAuthn 能力开关 |
| 导入与导出 | 支持 Bitwarden JSON/CSV，并可生成账户密钥或独立密码保护的导出文件 |
| 附件与 Send | 使用 Vercel Blob 存储附件和文件 Send |
| 管理与恢复 | 提供用户治理、审计、加密备份及 merge/replace 恢复流程 |
| 通知 | 默认轮询，可选 SSE；SignalR WebSocket 为实验性功能 |

## 兼容客户端

- Chrome、Firefox、Safari 和 Edge 的 Bitwarden 浏览器扩展
- Windows、macOS 和 Linux 的 Bitwarden 桌面客户端
- iOS 和 Android 的 Bitwarden 移动客户端
- VercelWarden 自有 Web Vault

详细接口覆盖情况见 [API.md](./API.md)。

## 技术栈

- Next.js 16（App Router）与 React 19
- Turso（libSQL）与 Drizzle ORM
- JWT / JOSE、Web Crypto、Argon2id / PBKDF2
- Vercel Functions 与 Vercel Blob
- Vitest 与 Playwright

## 快速开始

环境要求：Node.js 20+、pnpm、Turso 账号和 Vercel 账号。

```bash
git clone https://github.com/lyxlucky/vercelwarden.git
cd vercelwarden
pnpm install
cp .env.example .env.local
```

至少配置以下环境变量：

```dotenv
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-token
JWT_SECRET=your-random-secret
ADMIN_PASSWORD=your-admin-password
SERVER_ENCRYPTION_KEY=your-random-32-byte-base64-key
BACKUP_ENCRYPTION_KEY=another-random-32-byte-base64-key
DOMAIN=https://your-project.vercel.app
```

随后初始化数据库并启动开发服务器：

```bash
pnpm db:migrate
pnpm dev
```

生产部署、密钥生成和可选能力配置请阅读 [DEPLOYMENT.md](./DEPLOYMENT.md)。完整变量说明见 [.env.example](./.env.example)。

## 连接 Bitwarden 客户端

1. 在 Bitwarden 客户端登录页打开服务器设置。
2. 选择自托管环境。
3. 将 Server URL 设置为 `https://your-project.vercel.app`。
4. 注册或登录你的 VercelWarden 账号。

## 已知限制

- 项目主要面向个人和小型部署；组织、集合、SSO 与紧急访问不在当前范围内。
- Vercel Blob Hobby 套餐的请求与上传限制会影响较大的附件和文件 Send。
- 项目不提供 SMTP 服务。需要限制注册时，请设置 `DISABLE_REGISTRATION=true`。
- WebSocket 通知依赖 Vercel Fluid Compute 和 Redis 兼容的 Pub/Sub 服务，目前仍属实验性能力；SSE 与轮询可作为回退。

## 文档

- [部署指南](./DEPLOYMENT.md)
- [API 兼容文档](./API.md)
- [环境变量示例](./.env.example)
- [数据库结构](./schema.sql)

## 开源协议

本项目采用 [MIT License](./LICENSE) 开源。你可以自由使用、复制、修改、合并、发布、分发、再许可或销售本项目的副本，但需要保留原始版权声明和许可声明。

软件按“原样”提供，不附带任何形式的担保。密码管理器属于安全敏感软件，请自行审查代码并妥善管理生产密钥、数据库访问令牌与备份。

---

<div align="center">
  为希望掌控自己密码保险库的人而构建。
</div>
