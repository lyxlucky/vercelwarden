import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ─── Users ────────────────────────────────────────────────
// Aligned with Vaultwarden's users table
export const users = sqliteTable("users", {
  uuid: text("uuid").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),

  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),

  // Password auth
  passwordHash: blob("password_hash").notNull(),
  salt: blob("salt").notNull(),
  passwordIterations: integer("password_iterations").notNull().default(100000),
  passwordHint: text("password_hint"),

  // Encryption keys (stored encrypted by client)
  akey: text("akey").notNull(),           // encrypted symmetric key
  privateKey: text("private_key"),        // encrypted RSA private key
  publicKey: text("public_key"),          // RSA public key (unencrypted)

  // KDF config
  clientKdfType: integer("client_kdf_type").notNull().default(1), // 0=PBKDF2, 1=Argon2id
  clientKdfIter: integer("client_kdf_iter").notNull().default(600000),
  clientKdfMemory: integer("client_kdf_memory"),      // Argon2 memory in MB
  clientKdfParallelism: integer("client_kdf_parallelism"), // Argon2 parallelism

  // Security
  securityStamp: text("security_stamp").notNull(),
  totpSecret: text("totp_secret"),
  totpRecover: text("totp_recover"),

  // Settings
  equivalentDomains: text("equivalent_domains").notNull().default("[]"),
  excludedGlobals: text("excluded_globals").notNull().default("[]"),
  avatarColor: text("avatar_color"),
  apiKey: text("api_key"),

  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  verifiedAt: integer("verified_at", { mode: "timestamp" }),
});

// ─── Devices (login sessions) ─────────────────────────────
// Each login creates a device with its own refresh token
export const devices = sqliteTable("devices", {
  uuid: text("uuid").primaryKey(),
  userUuid: text("user_uuid").notNull().references(() => users.uuid, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),

  name: text("name").notNull(),          // device name (e.g. "Chrome Extension")
  type: integer("type").notNull(),       // device type (0=Android, 1=iOS, 2=Chrome, etc.)
  identifier: text("identifier").notNull(), // unique device identifier

  // Tokens
  refreshToken: text("refresh_token").notNull(),
  pushToken: text("push_token"),

  // Access token expiry
  accessTokenExpiration: integer("access_token_expiration", { mode: "timestamp" }),
});

// ─── Ciphers (vault items) ────────────────────────────────
// Type: 1=Login, 2=SecureNote, 3=Card, 4=Identity, 5=SshKey
export const ciphers = sqliteTable("ciphers", {
  uuid: text("uuid").primaryKey(),
  userUuid: text("user_uuid").references(() => users.uuid, { onDelete: "cascade" }),
  organizationUuid: text("organization_uuid"), // future: org support

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),

  type: integer("type").notNull(),       // 1=Login, 2=SecureNote, 3=Card, 4=Identity
  name: text("name").notNull(),          // encrypted
  notes: text("notes"),                  // encrypted
  fields: text("fields"),                // encrypted JSON
  data: text("data").notNull(),          // encrypted JSON (type-specific data)
  key: text("key"),                      // cipher key (for org items)
  passwordHistory: text("password_history"),

  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  edit: integer("edit", { mode: "boolean" }).notNull().default(true),
  reprompt: integer("reprompt").notNull().default(0), // 0=None, 1=Password

  deletedAt: integer("deleted_at", { mode: "timestamp" }), // soft delete
});

// ─── Folders ──────────────────────────────────────────────
export const folders = sqliteTable("folders", {
  uuid: text("uuid").primaryKey(),
  userUuid: text("user_uuid").notNull().references(() => users.uuid, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  name: text("name").notNull(),          // encrypted
});

// ─── Folder ↔ Cipher junction ─────────────────────────────
export const folderCiphers = sqliteTable("folder_ciphers", {
  folderUuid: text("folder_uuid").notNull().references(() => folders.uuid, { onDelete: "cascade" }),
  cipherUuid: text("cipher_uuid").notNull().references(() => ciphers.uuid, { onDelete: "cascade" }),
});

// ─── Attachments ──────────────────────────────────────────
export const attachments = sqliteTable("attachments", {
  uuid: text("uuid").primaryKey(),
  cipherUuid: text("cipher_uuid").notNull().references(() => ciphers.uuid, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  fileName: text("file_name").notNull(),     // encrypted
  fileSize: integer("file_size").notNull(),
  blobUrl: text("blob_url").notNull(),       // Vercel Blob URL
});

// ─── Invitation Codes ─────────────────────────────────────
export const invitationCodes = sqliteTable("invitation_codes", {
  code: text("code").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp" }),
  usedBy: text("used_by"),               // email of user who used it
  createdBy: text("created_by").notNull().default("admin"),
});

// ─── Relations ────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  devices: many(devices),
  ciphers: many(ciphers),
  folders: many(folders),
}));

export const devicesRelations = relations(devices, ({ one }) => ({
  user: one(users, { fields: [devices.userUuid], references: [users.uuid] }),
}));

export const ciphersRelations = relations(ciphers, ({ one, many }) => ({
  user: one(users, { fields: [ciphers.userUuid], references: [users.uuid] }),
  attachments: many(attachments),
  folderCiphers: many(folderCiphers),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  user: one(users, { fields: [folders.userUuid], references: [users.uuid] }),
  folderCiphers: many(folderCiphers),
}));

export const folderCiphersRelations = relations(folderCiphers, ({ one }) => ({
  folder: one(folders, { fields: [folderCiphers.folderUuid], references: [folders.uuid] }),
  cipher: one(ciphers, { fields: [folderCiphers.cipherUuid], references: [ciphers.uuid] }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  cipher: one(ciphers, { fields: [attachments.cipherUuid], references: [ciphers.uuid] }),
}));
