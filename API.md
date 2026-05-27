# Vercelwarden API 文档

> 完全兼容 Bitwarden 客户端 API 协议
> Base URL: `https://your-domain.vercel.app`

---

## 目录

1. [认证](#1-认证)
2. [账户管理](#2-账户管理)
3. [保险库同步](#3-保险库同步)
4. [密码项 (Ciphers)](#4-密码项-ciphers)
5. [文件夹 (Folders)](#5-文件夹-folders)
6. [附件 (Attachments)](#6-附件-attachments)
7. [图标代理](#7-图标代理)
8. [管理后台](#8-管理后台)
9. [错误格式](#9-错误格式)

---

## 1. 认证

### POST /identity/connect/token

获取访问令牌。支持三种授权方式。

#### 密码登录

```
POST /identity/connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=password
&username=user@example.com
&password=<masterPasswordHash>
&scope=api offline_access
&client_id=web
&deviceIdentifier=<uuid>
&deviceName=Chrome
&deviceType=2
```

**响应:**
```json
{
  "access_token": "eyJhbG...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "refresh_token": "eyJhbG...",
  "Key": "encryptedSymmetricKey",
  "PrivateKey": "encryptedPrivateKey",
  "MasterPasswordPolicy": null,
  "ForcePasswordReset": false,
  "scope": "api offline_access",
  "uuid": "user-uuid",
  "email": "user@example.com",
  "name": "User Name",
  "emailVerified": true,
  "premium": true,
  "masterPasswordHint": null,
  "culture": "en-US",
  "twoFactorEnabled": false,
  "securityStamp": "stamp-uuid",
  "avatarColor": null,
  "creationDate": "2026-01-01T00:00:00.000Z",
  "unofficialServer": null
}
```

#### 刷新令牌

```
POST /identity/connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=<jwt>
&deviceIdentifier=<uuid>
```

**响应:** 同密码登录（新的 access_token + refresh_token）

---

## 2. 账户管理

### POST /api/accounts/prelogin

获取用户的 KDF 配置（客户端用此派生主密钥）。

```
POST /api/accounts/prelogin
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**响应:**
```json
{
  "kdf": 1,
  "kdfIterations": 3,
  "kdfMemory": 64,
  "kdfParallelism": 4,
  "kdfSalt": null,
  "kdfSaltB64": null,
  "Object": "prelogin"
}
```

> kdf: 0=PBKDF2, 1=Argon2id

---

### POST /api/accounts/register

注册新用户（需要邀请码）。

```
POST /api/accounts/register
Content-Type: application/json

{
  "email": "user@example.com",
  "masterPasswordHash": "base64hash",
  "masterPasswordHint": "optional hint",
  "name": "User Name",
  "key": "encryptedSymmetricKey",
  "privateKey": "encryptedPrivateKey",
  "publicKey": "rsaPublicKey",
  "token": "INVITECODE",
  "kdfType": 1,
  "kdfIterations": 3,
  "kdfMemory": 64,
  "kdfParallelism": 4
}
```

**响应:** 用户 profile 对象（同 prelogin 格式）

**错误:**
- 400: `Invitation code is required`
- 400: `Invalid or expired invitation code`
- 400: `Email is already registered`

---

### GET /api/accounts/profile

获取当前用户信息（需要 Bearer Token）。

```
GET /api/accounts/profile
Authorization: Bearer <access_token>
```

**响应:** 用户 profile 对象

---

### POST /api/accounts/keys

上传 RSA 密钥对。

```
POST /api/accounts/keys
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "publicKey": "rsaPublicKey",
  "encryptedPrivateKey": "encryptedPrivateKey"
}
```

**响应:**
```json
{ "Object": "keys" }
```

---

### POST /api/accounts/password

修改主密码。

```
POST /api/accounts/password
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "masterPasswordHash": "currentHash",
  "newMasterPasswordHash": "newHash",
  "key": "newEncryptedSymmetricKey"
}
```

**响应:**
```json
{ "Object": "password" }
```

---

### POST /api/accounts/kdf

修改 KDF 配置。

```
POST /api/accounts/kdf
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "masterPasswordHash": "currentHash",
  "kdf": 1,
  "kdfIterations": 3,
  "kdfMemory": 64,
  "kdfParallelism": 4,
  "key": "newEncryptedSymmetricKey"
}
```

**响应:**
```json
{ "Object": "kdf" }
```

---

## 3. 保险库同步

### GET /api/sync

一次性获取所有保险库数据。

```
GET /api/sync
Authorization: Bearer <access_token>
```

**响应:**
```json
{
  "profile": {
    "uuid": "...",
    "email": "user@example.com",
    "name": "User Name",
    "key": "encryptedKey",
    "privateKey": "encryptedPrivateKey",
    "securityStamp": "...",
    "organizations": [],
    "providers": [],
    "providerOrganizations": []
  },
  "folders": [
    {
      "Id": "folder-uuid",
      "Name": "encryptedFolderName",
      "RevisionDate": "2026-01-01T00:00:00.000Z",
      "Object": "folder"
    }
  ],
  "ciphers": [
    {
      "Id": "cipher-uuid",
      "Type": 1,
      "Name": "encryptedName",
      "Notes": "encryptedNotes",
      "Fields": null,
      "Login": {
        "Uri": "encryptedUri",
        "Uris": null,
        "Username": "encryptedUsername",
        "Password": "encryptedPassword",
        "PasswordRevisionDate": null,
        "Totp": null,
        "AutofillOnPageLoad": null
      },
      "SecureNote": null,
      "Card": null,
      "Identity": null,
      "OrganizationId": null,
      "FolderId": "folder-uuid",
      "Favorite": false,
      "Edit": true,
      "Reprompt": 0,
      "Key": null,
      "PasswordHistory": null,
      "Attachments": null,
      "CreationDate": "2026-01-01T00:00:00.000Z",
      "RevisionDate": "2026-01-01T00:00:00.000Z",
      "DeletedDate": null,
      "Object": "cipher"
    }
  ],
  "collections": [],
  "domains": {
    "EquivalentDomains": [],
    "GlobalEquivalentDomains": [],
    "Object": "domains"
  },
  "policies": [],
  "sends": [],
  "Object": "sync"
}
```

---

## 4. 密码项 (Ciphers)

### GET /api/ciphers

获取所有密码项列表。

```
GET /api/ciphers
Authorization: Bearer <access_token>
```

**响应:**
```json
{
  "data": [...],
  "object": "list",
  "continuationToken": null
}
```

---

### POST /api/ciphers

创建密码项。

```
POST /api/ciphers
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "Type": 1,
  "Name": "encryptedName",
  "Notes": "encryptedNotes",
  "Fields": [{ "Name": "encrypted", "Value": "encrypted", "Type": 0 }],
  "Login": {
    "Uri": "encryptedUri",
    "Uris": [{ "Uri": "encryptedUri", "Match": null }],
    "Username": "encryptedUsername",
    "Password": "encryptedPassword",
    "Totp": null
  },
  "SecureNote": null,
  "Card": null,
  "Identity": null,
  "FolderId": "folder-uuid",
  "Favorite": false,
  "Reprompt": 0,
  "Key": null
}
```

**Cipher Types:**
| Type | 名称 | 数据字段 |
|------|------|----------|
| 1 | Login | Login: { Uri, Uris, Username, Password, Totp } |
| 2 | SecureNote | SecureNote: { Type: 0 } |
| 3 | Card | Card: { CardholderName, Brand, Number, ExpMonth, ExpYear, Code } |
| 4 | Identity | Identity: { Title, FirstName, MiddleName, LastName, Email, Phone, ... } |

**响应:** 创建的 cipher 对象

---

### GET /api/ciphers/{id}

获取单个密码项。

```
GET /api/ciphers/{id}
Authorization: Bearer <access_token>
```

**响应:** cipher 对象

---

### PUT /api/ciphers/{id}

更新密码项。

```
PUT /api/ciphers/{id}
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "Type": 1,
  "Name": "encryptedName",
  "Login": { ... },
  "FolderId": "folder-uuid",
  "Favorite": true
}
```

**响应:** 更新后的 cipher 对象

---

### DELETE /api/ciphers/{id}

软删除密码项（移入回收站）。

```
DELETE /api/ciphers/{id}
Authorization: Bearer <access_token>
```

**响应:**
```json
{ "Object": "cipher" }
```

---

## 5. 文件夹 (Folders)

### GET /api/folders

获取所有文件夹。

```
GET /api/folders
Authorization: Bearer <access_token>
```

**响应:**
```json
{
  "data": [
    {
      "Id": "folder-uuid",
      "Name": "encryptedName",
      "RevisionDate": "2026-01-01T00:00:00.000Z",
      "Object": "folder"
    }
  ],
  "object": "list",
  "continuationToken": null
}
```

---

### POST /api/folders

创建文件夹。

```
POST /api/folders
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "Name": "encryptedFolderName"
}
```

**响应:** folder 对象

---

### GET /api/folders/{id}

获取单个文件夹。

```
GET /api/folders/{id}
Authorization: Bearer <access_token>
```

---

### PUT /api/folders/{id}

更新文件夹。

```
PUT /api/folders/{id}
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "Name": "encryptedNewName"
}
```

---

### DELETE /api/folders/{id}

删除文件夹。

```
DELETE /api/folders/{id}
Authorization: Bearer <access_token>
```

**响应:**
```json
{ "Object": "folder" }
```

---

## 6. 附件 (Attachments)

### POST /api/ciphers/{id}/attachment

上传附件（multipart/form-data）。

```
POST /api/ciphers/{id}/attachment
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

data: <file binary>
fileName: "encryptedFileName"
```

**响应:**
```json
{
  "Id": "attachment-uuid",
  "FileName": "encryptedFileName",
  "Size": 12345,
  "SizeName": null,
  "Url": "/api/ciphers/{id}/attachment/{attachmentId}",
  "Object": "attachment"
}
```

---

### GET /api/ciphers/{id}/attachment/{attachmentId}

下载附件。

```
GET /api/ciphers/{id}/attachment/{attachmentId}
Authorization: Bearer <access_token>
```

**响应:** 文件二进制流 (application/octet-stream)

---

### DELETE /api/ciphers/{id}/attachment/{attachmentId}

删除附件。

```
DELETE /api/ciphers/{id}/attachment/{attachmentId}
Authorization: Bearer <access_token>
```

---

## 7. 图标代理

### GET /api/icons/{domain}/icon.png

获取网站图标。

```
GET /api/icons/github.com/icon.png
```

**响应:** 图标文件 (image/x-icon)，缓存 24 小时

---

## 8. 管理后台

所有管理接口需要 Basic Auth: `Authorization: Basic base64(admin:password)`

### GET /api/admin/invitations

获取所有邀请码。

```
GET /api/admin/invitations
Authorization: Basic base64(admin:<ADMIN_PASSWORD>)
```

**响应:**
```json
{
  "data": [
    {
      "code": "A1B2C3D4",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "usedAt": null,
      "usedBy": null,
      "createdBy": "admin"
    }
  ],
  "object": "list"
}
```

---

### POST /api/admin/invitations

生成邀请码。

```
POST /api/admin/invitations
Authorization: Basic base64(admin:<ADMIN_PASSWORD>)
Content-Type: application/json

{
  "code": "CUSTOMCODE"  // 可选，不填自动生成
}
```

**响应:**
```json
{
  "code": "A1B2C3D4",
  "object": "invitation"
}
```

---

### DELETE /api/admin/invitations

删除邀请码。

```
DELETE /api/admin/invitations
Authorization: Basic base64(admin:<ADMIN_PASSWORD>)
Content-Type: application/json

{
  "code": "A1B2C3D4"
}
```

---

### GET /api/admin/users

获取所有注册用户。

```
GET /api/admin/users
Authorization: Basic base64(admin:<ADMIN_PASSWORD>)
```

**响应:**
```json
{
  "data": [
    {
      "uuid": "user-uuid",
      "email": "user@example.com",
      "name": "User Name",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "enabled": true,
      "emailVerified": true,
      "twoFactorEnabled": false,
      "kdfType": 1
    }
  ],
  "object": "list"
}
```

---

## 9. 错误格式

所有错误响应遵循统一格式：

```json
{
  "message": "错误描述",
  "validationErrors": {
    "field": ["具体错误"]
  },
  "object": "error"
}
```

**常见 HTTP 状态码:**
| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 / Token 无效 |
| 404 | 资源不存在 |
| 501 | 功能未实现 |

---

## 附录: 认证流程

```
客户端                          服务端
  │                               │
  │── POST /accounts/prelogin ──>│  获取 KDF 参数
  │<── { kdf, iterations... } ───│
  │                               │
  │  [本地: KDF(password,email)   │
  │   → masterPasswordHash]       │
  │                               │
  │── POST /identity/token ─────>│  密码登录
  │    grant_type=password        │
  │    username=email             │
  │    password=hash              │
  │<── { access_token, key... } ─│
  │                               │
  │── GET /api/sync ────────────>│  同步数据
  │    Authorization: Bearer xxx  │
  │<── { profile, ciphers... } ──│
  │                               │
  │  [本地: 解密数据, 展示]        │
  │                               │
  │── POST /identity/token ─────>│  刷新令牌
  │    grant_type=refresh_token   │
  │<── { new tokens } ───────────│
```

---

## 附录: 加密说明

所有保险库数据在客户端加密后传输到服务端：

- **主密码** → 从不离开客户端
- **masterPasswordHash** = PBKDF2/Argon2id(主密码, 邮箱) → 发送给服务端验证
- **对称密钥 (Key)** = 客户端生成，用主密码派生的密钥加密后存储
- **密码项数据** = 用对称密钥加密后存储
- **RSA 密钥对** = 用于组织共享，私钥用对称密钥加密后存储

服务端只看到密文，无法解密用户数据。

---

*Vercelwarden API v1.0 — 2026-05-27*
