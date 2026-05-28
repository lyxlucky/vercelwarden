import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ─── Users ────────────────────────────────────────────────
export const users = sqliteTable("users", {
  uuid: text("uuid").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),

  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),

  // Password auth — server-side PBKDF2 of the client-submitted masterPasswordHash.
  // passwordHash = PBKDF2-SHA256(clientMasterPasswordHash, salt, passwordIterations)
  passwordHash: blob("password_hash").notNull(),
  salt: blob("salt").notNull(),
  passwordIterations: integer("password_iterations").notNull().default(100000),
  passwordHint: text("password_hint"),

  // Encryption keys (stored encrypted by client)
  akey: text("akey").notNull(),
  privateKey: text("private_key"),
  publicKey: text("public_key"),

  // Client-side KDF config (independent of server-side passwordIterations above)
  clientKdfType: integer("client_kdf_type").notNull().default(1), // 0=PBKDF2, 1=Argon2id
  clientKdfIter: integer("client_kdf_iter").notNull().default(600000),
  clientKdfMemory: integer("client_kdf_memory"),
  clientKdfParallelism: integer("client_kdf_parallelism"),

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
export const devices = sqliteTable("devices", {
  uuid: text("uuid").primaryKey(),
  userUuid: text("user_uuid").notNull().references(() => users.uuid, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),

  name: text("name").notNull(),
  type: integer("type").notNull(),
  identifier: text("identifier").notNull(),

  refreshToken: text("refresh_token").notNull(),
  pushToken: text("push_token"),
  accessTokenExpiration: integer("access_token_expiration", { mode: "timestamp" }),
});

// ─── Ciphers (vault items) ────────────────────────────────
// Type: 1=Login, 2=SecureNote, 3=Card, 4=Identity, 5=SshKey
export const ciphers = sqliteTable("ciphers", {
  uuid: text("uuid").primaryKey(),
  userUuid: text("user_uuid").references(() => users.uuid, { onDelete: "cascade" }),
  organizationUuid: text("organization_uuid"),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),

  type: integer("type").notNull(),
  name: text("name").notNull(),
  notes: text("notes"),
  fields: text("fields"),
  data: text("data").notNull(),
  key: text("key"),
  passwordHistory: text("password_history"),

  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  edit: integer("edit", { mode: "boolean" }).notNull().default(true),
  reprompt: integer("reprompt").notNull().default(0),

  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// ─── Folders ──────────────────────────────────────────────
export const folders = sqliteTable("folders", {
  uuid: text("uuid").primaryKey(),
  userUuid: text("user_uuid").notNull().references(() => users.uuid, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  name: text("name").notNull(),
});

export const folderCiphers = sqliteTable("folder_ciphers", {
  folderUuid: text("folder_uuid").notNull().references(() => folders.uuid, { onDelete: "cascade" }),
  cipherUuid: text("cipher_uuid").notNull().references(() => ciphers.uuid, { onDelete: "cascade" }),
});

// ─── Attachments ──────────────────────────────────────────
export const attachments = sqliteTable("attachments", {
  uuid: text("uuid").primaryKey(),
  cipherUuid: text("cipher_uuid").notNull().references(() => ciphers.uuid, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  key: text("key"),
  blobUrl: text("blob_url").notNull(),
});

// ─── Sends (Bitwarden Send: one-time encrypted shares) ────
// Type: 0=Text, 1=File
export const sends = sqliteTable("sends", {
  uuid: text("uuid").primaryKey(),
  userUuid: text("user_uuid").notNull().references(() => users.uuid, { onDelete: "cascade" }),
  organizationUuid: text("organization_uuid"),

  name: text("name").notNull(),
  notes: text("notes"),
  type: integer("type").notNull(),
  data: text("data").notNull(),
  key: text("key").notNull(),

  password: text("password"),

  maxAccessCount: integer("max_access_count"),
  accessCount: integer("access_count").notNull().default(0),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  expirationDate: integer("expiration_date", { mode: "timestamp" }),
  deletionDate: integer("deletion_date", { mode: "timestamp" }).notNull(),

  disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  hideEmail: integer("hide_email", { mode: "boolean" }).notNull().default(false),
});

// ─── Relations ────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  devices: many(devices),
  ciphers: many(ciphers),
  folders: many(folders),
  sends: many(sends),
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

export const sendsRelations = relations(sends, ({ one }) => ({
  user: one(users, { fields: [sends.userUuid], references: [users.uuid] }),
}));
