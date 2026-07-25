# Vercelwarden 部署指南

> 自托管 Bitwarden 兼容密码管理器，部署在 Vercel 免费层

---

## 前置条件

- Node.js 18+ (推荐 20+)
- Vercel 账号 (免费): https://vercel.com
- Turso 账号 (免费): https://turso.tech
- Git

---

## 第一步: 创建 Turso 数据库

Turso 是基于 SQLite 的边缘数据库，免费层提供 9GB 存储。

```bash
# 1. 安装 Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash
# Windows (PowerShell):
# iwr -useb https://get.tur.so/install.ps1 | iex

# 2. 登录
turso auth login

# 3. 创建数据库
turso db create vercelwarden

# 4. 获取数据库 URL (记下来)
turso db show vercelwarden --url
# 输出类似: libsql://vercelwarden-xxx.turso.io

# 5. 创建 auth token (记下来)
turso db tokens create vercelwarden
# 输出类似: eyJhbGciOiJFZDI1NTE5...
```

记录下两个值:
- `TURSO_DATABASE_URL` = 上面第 4 步的 URL
- `TURSO_AUTH_TOKEN` = 上面第 5 步的 token

---

## 第二步: 推送数据库 Schema

```bash
# 进入项目目录
cd vercelwarden

# 创建临时 .env 文件
cat > .env << 'EOF'
TURSO_DATABASE_URL=libsql://vercelwarden-xxx.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOiJFZDI1NTE5...
EOF

# 推送 schema 到 Turso
npx drizzle-kit push
```

预期输出:
```
[✓] Pushing schema changes...
```

---

## 第三步: 生成密钥

```bash
# 生成 JWT 密钥 (32字节随机hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 输出类似: a1b2c3d4e5f6...

# 生成管理员密码
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
# 输出类似: f7e8d9c0b1a2...
```

记录下:
- `JWT_SECRET` = 第一个输出
- `ADMIN_PASSWORD` = 第二个输出

---

## 第四步: 部署到 Vercel

### 方式 A: Vercel CLI (推荐)

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署 (会引导你关联项目)
vercel

# 设置环境变量
vercel env add TURSO_DATABASE_URL
# 粘贴: libsql://vercelwarden-xxx.turso.io

vercel env add TURSO_AUTH_TOKEN
# 粘贴: eyJhbGciOiJFZDI1NTE5...

vercel env add JWT_SECRET
# 粘贴: a1b2c3d4e5f6...

vercel env add ADMIN_PASSWORD
# 粘贴: f7e8d9c0b1a2...

# 生产环境部署
vercel --prod
```

### 方式 B: GitHub 集成

1. 把代码推到 GitHub:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/vercelwarden.git
git push -u origin main
```

2. 去 https://vercel.com/new 导入仓库

3. 在 Vercel Dashboard → Settings → Environment Variables 添加:
   - `TURSO_DATABASE_URL` = libsql://vercelwarden-xxx.turso.io
   - `TURSO_AUTH_TOKEN` = eyJhbGciOiJFZDI1NTE5...
   - `JWT_SECRET` = a1b2c3d4e5f6...
   - `ADMIN_PASSWORD` = f7e8d9c0b1a2...

4. 点击 Deploy

---

## 第五步: 配置 Web Vault (可选)

Web Vault 让你可以在浏览器中直接使用密码管理器，不需要安装插件。

```bash
# 下载 Web Vault (约 15MB)
bash scripts/setup-web-vault.sh

# 重新部署
vercel --prod
```

部署后访问: `https://your-project.vercel.app/web-vault/`

---

## 第六步: 注册账号

1. 默认开放注册（如需关闭，设置 `DISABLE_REGISTRATION=true`）。
2. 在 Bitwarden 客户端选择 "Self-hosted" 并填入你的部署 URL。
3. 点击 "Create Account" 注册第一个账号。
4. 之后可在管理后台 `https://your-project.vercel.app/admin` 用 `ADMIN_PASSWORD` 登录管理用户（启用/停用/删除）。

---

## 第七步: 配置 Bitwarden 客户端

### 浏览器插件 (Chrome/Firefox/Edge)

1. 安装 Bitwarden 浏览器插件
2. 点击插件图标 → 登录页面底部齿轮图标 ⚙️
3. 选择 "Self-hosted"
4. Server URL 填: `https://your-project.vercel.app`
5. 保存
6. 点击 "Create Account" 注册
7. 填写邮箱并设置主密码 (这个密码永远不会发送到服务器)

### 桌面端 (Windows/macOS/Linux)

1. 下载: https://bitwarden.com/download/
2. 打开 → 登录页面底部 "Settings" (齿轮图标)
3. Server URL 填: `https://your-project.vercel.app`
4. 保存 → 注册/登录

### 手机 App (iOS/Android)

1. 下载 Bitwarden App
2. 打开 → 登录页面底部齿轮图标 ⚙️
3. Server URL 填: `https://your-project.vercel.app`
4. 保存 → 注册/登录

### Web Vault (浏览器直接访问)

1. 访问: `https://your-project.vercel.app/web-vault/`
2. 注册/登录

---

## 环境变量参考

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `TURSO_DATABASE_URL` | ✅ | Turso 数据库连接 URL |
| `TURSO_AUTH_TOKEN` | ✅ | Turso 认证 token |
| `JWT_SECRET` | ✅ | JWT 签名密钥 (随机 hex) |
| `ADMIN_PASSWORD` | ✅ | 管理后台密码 |
| `DISABLE_REGISTRATION` | 可选 | `true` 关闭公开注册 |
| `BLOB_READ_WRITE_TOKEN` | 可选 | Vercel Blob token (附件功能) |

---

## 常见问题

### Q: 部署后访问报错 "TURSO_DATABASE_URL is not set"
A: 检查 Vercel Dashboard → Settings → Environment Variables 是否配置正确。确保 Production 环境也设置了。

### Q: 注册时提示 "Registration is disabled"
A: 当前 `DISABLE_REGISTRATION` 被设为 `true`。如需开放注册，删除该环境变量或改为 `false` 后重新部署。

### Q: Bitwarden 客户端连接不上
A: 检查:
1. Server URL 是否正确 (不要加尾部 `/`)
2. 域名是否可访问
3. Vercel 部署是否成功

### Q: 附件上传失败
A: 需要在 Vercel Dashboard 配置 `BLOB_READ_WRITE_TOKEN`:
1. 去 Vercel Dashboard → Storage → Create Database → Blob
2. 复制 token 到环境变量
3. 重新部署

### Q: 如何更新?
A:
```bash
git pull
vercel --prod
# 如果 schema 有变化:
# npx drizzle-kit push
```

### Q: 如何备份数据?
A: Turso 支持导出:
```bash
turso db shell vercelwarden .dump > backup.sql
```

---

## 项目结构

```
vercelwarden/
├── src/
│   ├── app/
│   │   ├── admin/page.tsx              # 管理后台
│   │   ├── api/
│   │   │   ├── identity/connect/token/  # 登录
│   │   │   ├── accounts/               # 用户管理
│   │   │   ├── ciphers/                # 密码项 CRUD
│   │   │   ├── folders/                # 文件夹 CRUD
│   │   │   ├── sync/                   # 全量同步
│   │   │   ├── icons/                  # 图标代理
│   │   │   └── admin/                  # 管理 API
│   │   └── page.tsx                    # 首页
│   ├── db/
│   │   ├── schema.ts                   # 数据库 schema
│   │   └── index.ts                    # Turso 客户端
│   └── lib/
│       ├── auth.ts                     # JWT 认证
│       ├── kdf.ts                      # KDF 配置
│       └── responses.ts               # 响应格式
├── public/web-vault/                   # Web Vault (需下载)
├── scripts/setup-web-vault.sh          # Web Vault 安装脚本
├── drizzle.config.ts                   # Drizzle 配置
└── README.md                           # 项目文档
```

---

## 技术栈

- **框架**: Next.js 16 (App Router + Route Handlers)
- **数据库**: Turso (SQLite edge) + Drizzle ORM
- **认证**: JWT (jose)
- **附件**: Vercel Blob
- **部署**: Vercel (免费层)

---

## 免费层限制

| 资源 | 限制 |
|------|------|
| Vercel 带宽 | 100GB/月 |
| Vercel Serverless Functions | 100GB-hrs/月 |
| Vercel Blob 存储 | 500MB |
| Turso 数据库 | 9GB 存储, 500 连接 |
| Turso 行读取 | 25B 行/月 |
| Turso 行写入 | 25M 行/月 |

对个人/小团队使用完全足够。

---

## 安全说明

- 主密码永远不会离开客户端 (零知识加密)
- 服务端只存储加密后的数据
- JWT token 有过期时间 (1小时 access + 30天 refresh)
- Refresh token rotation 防止 token 重用攻击
- 可通过 `DISABLE_REGISTRATION=true` 关闭公开注册

---

## 自有客户端与治理部署

1. 先部署数据库 migrations，再部署应用；不要回滚或重新生成已删除的 `public/web-vault/**`。
2. 为 `SERVER_ENCRYPTION_KEY` 和 `BACKUP_ENCRYPTION_KEY` 分别生成独立的 32 字节 Base64 密钥，并纳入部署平台密钥轮换流程。
3. 设置 `ADMIN_BOOTSTRAP_EMAIL`，使用该邮箱完成普通注册后首次启动会提升为管理员；产生首位管理员后此变量不再提升其他账号。
4. 逐项开启 `ENABLE_ADMIN_INVITES`、`ENABLE_ADMIN_AUDIT`、`ENABLE_ADMIN_BACKUP`。旧 Basic 管理认证仅在过渡期显式设置 `ALLOW_LEGACY_ADMIN_BASIC=true`，且只允许读取。
5. 为 `/api/internal/maintenance` 配置带 `Authorization: Bearer <MAINTENANCE_CRON_SECRET>` 的定时 POST，用于清理过期登录请求、pending Blob、Send、审计记录和备份 artifact。
6. 备份恢复演练必须先运行完整性检查；`replace` 会清空受管业务表后恢复，`merge` 只插入缺失记录。两种模式都会返回逐类成功/失败计数并写审计事件。

发布门禁：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:contract`、`pnpm build`、`pnpm test:e2e`、`pnpm test:compat`。生产响应启用 CSP、禁止 framing、no-referrer、nosniff、Permissions-Policy 和 HSTS。

*最后更新: 2026-07-25*
