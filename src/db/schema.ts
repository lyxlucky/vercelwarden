import { sqliteTable, text, integer, blob, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ─── Users ────────────────────────────────────────────────
export const users = sqliteTable("users", {
  uuid: text("uuid").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),

  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),

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
export const devices = sqliteTable(
  "devices",
  {
    uuid: text("uuid").primaryKey(),
    userUuid: text("user_uuid").notNull().references(() => users.uuid, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),

    name: text("name").notNull(),
    systemName: text("system_name"),
    note: text("note"),
    type: integer("type").notNull(),
    identifier: text("identifier").notNull(),

    refreshToken: text("refresh_token").notNull(),
    refreshTokenHash: text("refresh_token_hash"),
    trustedAt: integer("trusted_at", { mode: "timestamp" }),
    trustedUntil: integer("trusted_until", { mode: "timestamp" }),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
    pushToken: text("push_token"),
    accessTokenExpiration: integer("access_token_expiration", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("devices_user_identifier_idx").on(table.userUuid, table.identifier),
    index("devices_user_activity_idx").on(table.userUuid, table.revokedAt, table.lastSeenAt),
  ]
);

export const authRequests = sqliteTable(
  "auth_requests",
  {
    uuid: text("uuid").primaryKey(),
    userUuid: text("user_uuid").notNull().references(() => users.uuid, { onDelete: "cascade" }),
    requestingDeviceUuid: text("requesting_device_uuid"),
    requestingDeviceIdentifier: text("requesting_device_identifier").notNull(),
    requestingDeviceType: integer("requesting_device_type").notNull(),
    publicKey: text("public_key").notNull(),
    encryptedKey: text("encrypted_key"),
    ipAddress: text("ip_address"),
    countryCode: text("country_code"),
    status: text("status", { enum: ["pending", "approved", "denied", "expired"] }).notNull().default("pending"),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    respondedAt: integer("responded_at", { mode: "timestamp" }),
    respondingDeviceUuid: text("responding_device_uuid").references(() => devices.uuid, { onDelete: "set null" }),
  },
  (table) => [
    index("auth_requests_user_pending_idx").on(table.userUuid, table.status, table.expiresAt),
    index("auth_requests_requesting_device_idx").on(table.userUuid, table.requestingDeviceIdentifier),
  ]
);

export const domainSettings = sqliteTable("domain_settings", {
  userUuid: text("user_uuid")
    .primaryKey()
    .references(() => users.uuid, { onDelete: "cascade" }),
  equivalentDomains: text("equivalent_domains").notNull().default("[]"),
  customEquivalentDomains: text("custom_equivalent_domains").notNull().default("[]"),
  excludedGlobalDomainIds: text("excluded_global_domain_ids").notNull().default("[]"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const reauthProofNonces = sqliteTable(
  "reauth_proof_nonces",
  {
    uuid: text("uuid").primaryKey(),
    userUuid: text("user_uuid").notNull().references(() => users.uuid, { onDelete: "cascade" }),
    deviceUuid: text("device_uuid").notNull().references(() => devices.uuid, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    securityStamp: text("security_stamp").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp" }),
  },
  (table) => [
    index("reauth_nonce_user_expiry_idx").on(table.userUuid, table.expiresAt),
    index("reauth_nonce_active_idx").on(table.uuid, table.consumedAt, table.expiresAt),
  ]
);

// ─── Ciphers (vault items) ────────────────────────────────
// Type: 1=Login, 2=SecureNote, 3=Card, 4=Identity, 5=SshKey
export const ciphers = sqliteTable(
  "ciphers",
  {
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

    archivedAt: integer("archived_at", { mode: "timestamp" }),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (table) => [
    index("ciphers_user_state_updated_idx").on(
      table.userUuid,
      table.deletedAt,
      table.archivedAt,
      table.updatedAt
    ),
  ]
);

// ─── Folders ──────────────────────────────────────────────
export const folders = sqliteTable("folders", {
  uuid: text("uuid").primaryKey(),
  userUuid: text("user_uuid").notNull().references(() => users.uuid, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  name: text("name").notNull(),
});

export const folderCiphers = sqliteTable(
  "folder_ciphers",
  {
    folderUuid: text("folder_uuid").notNull().references(() => folders.uuid, { onDelete: "cascade" }),
    cipherUuid: text("cipher_uuid").notNull().references(() => ciphers.uuid, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("folder_ciphers_cipher_uuid_idx").on(table.cipherUuid),
    index("folder_ciphers_folder_uuid_idx").on(table.folderUuid),
  ]
);

// ─── Attachments ──────────────────────────────────────────
export const attachments = sqliteTable("attachments", {
  uuid: text("uuid").primaryKey(),
  cipherUuid: text("cipher_uuid").notNull().references(() => ciphers.uuid, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  key: text("key"),
  blobUrl: text("blob_url").notNull(),
  status: text("status", { enum: ["pending", "complete"] }).notNull().default("complete"),
  checksum: text("checksum"),
  uploadTokenHash: text("upload_token_hash"),
  uploadExpiresAt: integer("upload_expires_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// ─── Sends (Bitwarden Send: one-time encrypted shares) ────
// Type: 0=Text, 1=File
export const sends = sqliteTable(
  "sends",
  {
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
  },
  (table) => [
    index("sends_user_updated_idx").on(table.userUuid, table.updatedAt),
    // Maintenance GC scans `WHERE deletion_date < now` across all users; index
    // deletionDate directly. (The old (uuid, ...) composite led with the primary
    // key and was redundant for the by-accessId point lookup.)
    index("sends_deletion_date_idx").on(table.deletionDate),
  ]
);

export const sendFiles = sqliteTable(
  "send_files",
  {
    uuid: text("uuid").primaryKey(),
    sendUuid: text("send_uuid").notNull().references(() => sends.uuid, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    key: text("key"),
    fileSize: integer("file_size").notNull(),
    // Plaintext byte length of the file the user selected. NULL marks a legacy
    // (base64 cipher-string) or official-client Send; non-null marks a new
    // raw-binary Send. Displayed to recipients; fileSize stays the encrypted size.
    plaintextSize: integer("plaintext_size"),
    blobUrl: text("blob_url").notNull().default(""),
    status: text("status", { enum: ["pending", "complete", "failed"] }).notNull().default("pending"),
    checksum: text("checksum"),
    uploadTokenHash: text("upload_token_hash"),
    uploadExpiresAt: integer("upload_expires_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("send_files_send_uuid_idx").on(table.sendUuid),
    index("send_files_pending_expiry_idx").on(table.status, table.uploadExpiresAt),
  ]
);

// ─── Cross-cutting mutation state ──────────────────────────
export const userRevisions = sqliteTable("user_revisions", {
  userUuid: text("user_uuid")
    .primaryKey()
    .references(() => users.uuid, { onDelete: "cascade" }),
  revisionDate: integer("revision_date", { mode: "timestamp" }).notNull(),
  sequence: integer("sequence").notNull().default(0),
});

export const idempotencyRecords = sqliteTable(
  "idempotency_records",
  {
    uuid: text("uuid").primaryKey(),
    userUuid: text("user_uuid").references(() => users.uuid, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status", { enum: ["pending", "completed"] }).notNull().default("pending"),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_scope_key_idx").on(table.scope, table.key),
    index("idempotency_expires_at_idx").on(table.expiresAt),
    index("idempotency_user_uuid_idx").on(table.userUuid),
  ]
);

// Authentication credentials. Legacy users.totp_* columns remain readable
// during migration but new writes use these owner-scoped tables.
export const twoFactorCredentials = sqliteTable(
  "two_factor_credentials",
  {
    uuid: text("uuid").primaryKey(),
    userUuid: text("user_uuid").notNull().references(() => users.uuid, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["totp", "yubikey", "webauthn"] }).notNull(),
    name: text("name").notNull(),
    status: text("status", { enum: ["pending", "active", "disabled"] }).notNull().default("pending"),
    secretCiphertext: text("secret_ciphertext"),
    credentialId: text("credential_id"),
    publicKey: text("public_key"),
    transports: text("transports"),
    signCount: integer("sign_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  },
  (table) => [
    index("two_factor_user_status_idx").on(table.userUuid, table.status),
    uniqueIndex("two_factor_credential_id_idx").on(table.credentialId),
  ]
);

export const accountPasskeys = sqliteTable(
  "account_passkeys",
  {
    uuid: text("uuid").primaryKey(),
    userUuid: text("user_uuid").notNull().references(() => users.uuid, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull(),
    publicKey: text("public_key").notNull(),
    name: text("name").notNull(),
    signCount: integer("sign_count").notNull().default(0),
    transports: text("transports"),
    directUnlock: integer("direct_unlock", { mode: "boolean" }).notNull().default(false),
    encryptedUserKey: text("encrypted_user_key"),
    encryptedPrivateKey: text("encrypted_private_key"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("account_passkey_credential_idx").on(table.credentialId),
    index("account_passkey_user_idx").on(table.userUuid),
  ]
);

export const recoveryCodeHashes = sqliteTable(
  "recovery_code_hashes",
  {
    uuid: text("uuid").primaryKey(),
    userUuid: text("user_uuid").notNull().references(() => users.uuid, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp" }),
  },
  (table) => [index("recovery_code_user_active_idx").on(table.userUuid, table.consumedAt)]
);

export const adminInvites = sqliteTable(
  "admin_invites",
  {
    uuid: text("uuid").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    createdBy: text("created_by").references(() => users.uuid, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    maxUses: integer("max_uses").notNull().default(1),
    useCount: integer("use_count").notNull().default(0),
    usedAt: integer("used_at", { mode: "timestamp" }),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("admin_invite_code_hash_idx").on(table.codeHash),
    index("admin_invite_email_expiry_idx").on(table.email, table.expiresAt),
  ]
);

// ─── Administration, audit, and backup governance ─────────
export const auditEvents = sqliteTable(
  "audit_events",
  {
    uuid: text("uuid").primaryKey(),
    actorUserUuid: text("actor_user_uuid").references(() => users.uuid, { onDelete: "set null" }),
    actorEmailSnapshot: text("actor_email_snapshot"),
    action: text("action").notNull(),
    category: text("category", { enum: ["authentication", "security", "device", "user", "backup", "system"] }).notNull(),
    level: text("level", { enum: ["info", "warning", "critical"] }).notNull().default("info"),
    targetType: text("target_type"),
    targetId: text("target_id"),
    outcome: text("outcome", { enum: ["succeeded", "failed", "denied", "partial"] }).notNull(),
    requestId: text("request_id"),
    ipPrefix: text("ip_prefix"),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("audit_events_created_idx").on(table.createdAt),
    index("audit_events_category_created_idx").on(table.category, table.createdAt),
    index("audit_events_actor_created_idx").on(table.actorUserUuid, table.createdAt),
    index("audit_events_target_idx").on(table.targetType, table.targetId, table.createdAt),
  ]
);

export const auditRetentionSettings = sqliteTable("audit_retention_settings", {
  id: text("id").primaryKey().default("default"),
  retentionDays: integer("retention_days"),
  maxEntries: integer("max_entries"),
  updatedBy: text("updated_by").references(() => users.uuid, { onDelete: "set null" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const backupDestinations = sqliteTable(
  "backup_destinations",
  {
    uuid: text("uuid").primaryKey(),
    name: text("name").notNull(),
    provider: text("provider", { enum: ["local", "vercel-blob", "webdav"] }).notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    schedule: text("schedule"),
    retentionCount: integer("retention_count").notNull().default(10),
    includeAttachments: integer("include_attachments", { mode: "boolean" }).notNull().default(true),
    encryptedConfig: text("encrypted_config").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("backup_destinations_enabled_idx").on(table.enabled)]
);

export const backupRuns = sqliteTable(
  "backup_runs",
  {
    uuid: text("uuid").primaryKey(),
    destinationUuid: text("destination_uuid").references(() => backupDestinations.uuid, { onDelete: "set null" }),
    trigger: text("trigger", { enum: ["manual", "scheduled"] }).notNull(),
    mode: text("mode", { enum: ["full", "database"] }).notNull().default("full"),
    status: text("status", { enum: ["queued", "running", "succeeded", "partially-succeeded", "failed", "cancelled"] }).notNull().default("queued"),
    startedAt: integer("started_at", { mode: "timestamp" }),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
    requestedBy: text("requested_by").references(() => users.uuid, { onDelete: "set null" }),
    progress: integer("progress").notNull().default(0),
    summary: text("summary"),
    errorCode: text("error_code"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("backup_runs_status_created_idx").on(table.status, table.createdAt),
    index("backup_runs_destination_created_idx").on(table.destinationUuid, table.createdAt),
  ]
);

export const backupArtifacts = sqliteTable(
  "backup_artifacts",
  {
    uuid: text("uuid").primaryKey(),
    runUuid: text("run_uuid").notNull().references(() => backupRuns.uuid, { onDelete: "cascade" }),
    formatVersion: integer("format_version").notNull(),
    objectKey: text("object_key").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    encryptedDataKey: text("encrypted_data_key").notNull(),
    manifestSummary: text("manifest_summary").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("backup_artifacts_object_key_idx").on(table.objectKey),
    index("backup_artifacts_run_idx").on(table.runUuid),
    index("backup_artifacts_expiry_idx").on(table.expiresAt),
  ]
);

// ─── Relations ────────────────────────────────────────────
export const usersRelations = relations(users, ({ many, one }) => ({
  devices: many(devices),
  authRequests: many(authRequests),
  ciphers: many(ciphers),
  folders: many(folders),
  sends: many(sends),
  revision: one(userRevisions),
  idempotencyRecords: many(idempotencyRecords),
  twoFactorCredentials: many(twoFactorCredentials),
  accountPasskeys: many(accountPasskeys),
  recoveryCodeHashes: many(recoveryCodeHashes),
  createdInvites: many(adminInvites),
  auditEvents: many(auditEvents),
  domainSettings: one(domainSettings),
  reauthProofNonces: many(reauthProofNonces),
}));

export const devicesRelations = relations(devices, ({ one }) => ({
  user: one(users, { fields: [devices.userUuid], references: [users.uuid] }),
}));

export const authRequestsRelations = relations(authRequests, ({ one }) => ({
  user: one(users, { fields: [authRequests.userUuid], references: [users.uuid] }),
  respondingDevice: one(devices, { fields: [authRequests.respondingDeviceUuid], references: [devices.uuid] }),
}));

export const domainSettingsRelations = relations(domainSettings, ({ one }) => ({
  user: one(users, { fields: [domainSettings.userUuid], references: [users.uuid] }),
}));

export const reauthProofNoncesRelations = relations(reauthProofNonces, ({ one }) => ({
  user: one(users, { fields: [reauthProofNonces.userUuid], references: [users.uuid] }),
  device: one(devices, { fields: [reauthProofNonces.deviceUuid], references: [devices.uuid] }),
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

export const sendsRelations = relations(sends, ({ one, many }) => ({
  user: one(users, { fields: [sends.userUuid], references: [users.uuid] }),
  files: many(sendFiles),
}));

export const sendFilesRelations = relations(sendFiles, ({ one }) => ({
  send: one(sends, { fields: [sendFiles.sendUuid], references: [sends.uuid] }),
}));

export const userRevisionsRelations = relations(userRevisions, ({ one }) => ({
  user: one(users, { fields: [userRevisions.userUuid], references: [users.uuid] }),
}));

export const idempotencyRecordsRelations = relations(idempotencyRecords, ({ one }) => ({
  user: one(users, { fields: [idempotencyRecords.userUuid], references: [users.uuid] }),
}));

export const twoFactorCredentialsRelations = relations(twoFactorCredentials, ({ one }) => ({
  user: one(users, { fields: [twoFactorCredentials.userUuid], references: [users.uuid] }),
}));

export const accountPasskeysRelations = relations(accountPasskeys, ({ one }) => ({
  user: one(users, { fields: [accountPasskeys.userUuid], references: [users.uuid] }),
}));

export const recoveryCodeHashesRelations = relations(recoveryCodeHashes, ({ one }) => ({
  user: one(users, { fields: [recoveryCodeHashes.userUuid], references: [users.uuid] }),
}));

export const adminInvitesRelations = relations(adminInvites, ({ one }) => ({
  creator: one(users, { fields: [adminInvites.createdBy], references: [users.uuid] }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  actor: one(users, { fields: [auditEvents.actorUserUuid], references: [users.uuid] }),
}));

export const auditRetentionSettingsRelations = relations(auditRetentionSettings, ({ one }) => ({
  updater: one(users, { fields: [auditRetentionSettings.updatedBy], references: [users.uuid] }),
}));

export const backupDestinationsRelations = relations(backupDestinations, ({ many }) => ({
  runs: many(backupRuns),
}));

export const backupRunsRelations = relations(backupRuns, ({ one, many }) => ({
  destination: one(backupDestinations, { fields: [backupRuns.destinationUuid], references: [backupDestinations.uuid] }),
  requester: one(users, { fields: [backupRuns.requestedBy], references: [users.uuid] }),
  artifacts: many(backupArtifacts),
}));

export const backupArtifactsRelations = relations(backupArtifacts, ({ one }) => ({
  run: one(backupRuns, { fields: [backupArtifacts.runUuid], references: [backupRuns.uuid] }),
}));
