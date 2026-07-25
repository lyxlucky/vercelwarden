import "server-only";

import { desc, eq, inArray } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/db";
import {
  accountPasskeys,
  adminInvites,
  attachments,
  auditEvents,
  auditRetentionSettings,
  authRequests,
  backupArtifacts,
  backupDestinations,
  backupRuns,
  ciphers,
  devices,
  domainSettings,
  folderCiphers,
  folders,
  recoveryCodeHashes,
  sendFiles,
  sends,
  twoFactorCredentials,
  userRevisions,
  users,
} from "@/db/schema";
import { newUuid } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/server/audit/events";
import {
  backupEncryptionKeyFromEnvironment,
  createBackupArchive,
  openBackupArchive,
  summarizeRestoreResults,
  type RestoreKindResult,
} from "@/lib/server/backup/archive";
import {
  createDestinationAdapter,
  decryptDestinationConfig,
  type BackupDestinationAdapter,
} from "@/lib/server/backup/destinations";

type BackupDestination = typeof backupDestinations.$inferSelect;
type BackupArtifact = typeof backupArtifacts.$inferSelect;
type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const TABLE_ORDER = [
  "users",
  "devices",
  "authRequests",
  "domainSettings",
  "ciphers",
  "folders",
  "folderCiphers",
  "attachments",
  "sends",
  "sendFiles",
  "userRevisions",
  "twoFactorCredentials",
  "accountPasskeys",
  "recoveryCodeHashes",
  "adminInvites",
  "auditEvents",
  "auditRetentionSettings",
] as const;

const TABLES: Record<(typeof TABLE_ORDER)[number], unknown> = {
  users,
  devices,
  authRequests,
  domainSettings,
  ciphers,
  folders,
  folderCiphers,
  attachments,
  sends,
  sendFiles,
  userRevisions,
  twoFactorCredentials,
  accountPasskeys,
  recoveryCodeHashes,
  adminInvites,
  auditEvents,
  auditRetentionSettings,
};

async function readBackupTables(): Promise<Record<string, unknown[]>> {
  const rows = await Promise.all([
    db.select().from(users),
    db.select().from(devices),
    db.select().from(authRequests),
    db.select().from(domainSettings),
    db.select().from(ciphers),
    db.select().from(folders),
    db.select().from(folderCiphers),
    db.select().from(attachments),
    db.select().from(sends),
    db.select().from(sendFiles),
    db.select().from(userRevisions),
    db.select().from(twoFactorCredentials),
    db.select().from(accountPasskeys),
    db.select().from(recoveryCodeHashes),
    db.select().from(adminInvites),
    db.select().from(auditEvents),
    db.select().from(auditRetentionSettings),
  ]);
  return Object.fromEntries(TABLE_ORDER.map((name, index) => [name, rows[index] ?? []]));
}

async function collectAttachmentBytes(tables: Record<string, unknown[]>): Promise<{
  files: Array<{ id: string; bytes: Uint8Array }>;
  failures: number;
}> {
  const candidates = [
    ...(tables.attachments as Array<{ uuid: string; blobUrl: string; status: string }> ?? [])
      .filter((row) => row.status === "complete" && row.blobUrl)
      .map((row) => ({ id: `attachment:${row.uuid}`, url: row.blobUrl })),
    ...(tables.sendFiles as Array<{ uuid: string; blobUrl: string; status: string }> ?? [])
      .filter((row) => row.status === "complete" && row.blobUrl)
      .map((row) => ({ id: `send:${row.uuid}`, url: row.blobUrl })),
  ];
  const files: Array<{ id: string; bytes: Uint8Array }> = [];
  let failures = 0;
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, { cache: "no-store" });
      if (!response.ok) throw new Error(`status ${response.status}`);
      files.push({ id: candidate.id, bytes: new Uint8Array(await response.arrayBuffer()) });
    } catch {
      failures += 1;
    }
  }
  return { files, failures };
}

function destinationAdapter(destination: BackupDestination): BackupDestinationAdapter {
  return createDestinationAdapter(destination.provider, decryptDestinationConfig(destination.encryptedConfig));
}

export function serializeBackupRun(run: typeof backupRuns.$inferSelect) {
  return {
    id: run.uuid,
    destinationId: run.destinationUuid,
    trigger: run.trigger,
    mode: run.mode,
    status: run.status,
    progress: run.progress,
    summary: run.summary ? JSON.parse(run.summary) : null,
    errorCode: run.errorCode,
    creationDate: run.createdAt.toISOString(),
    startedDate: run.startedAt?.toISOString() ?? null,
    finishedDate: run.finishedAt?.toISOString() ?? null,
    object: "backupRun",
  };
}

async function applyDestinationRetention(destination: BackupDestination, adapter: BackupDestinationAdapter): Promise<number> {
  const runs = await db.select({ id: backupRuns.uuid }).from(backupRuns)
    .where(eq(backupRuns.destinationUuid, destination.uuid))
    .orderBy(desc(backupRuns.createdAt));
  const expiredRunIds = runs.slice(destination.retentionCount).map((run) => run.id);
  if (expiredRunIds.length === 0) return 0;
  const artifacts = await db.select().from(backupArtifacts).where(inArray(backupArtifacts.runUuid, expiredRunIds));
  for (const artifact of artifacts) await adapter.delete(artifact.objectKey).catch(() => undefined);
  await db.delete(backupArtifacts).where(inArray(backupArtifacts.runUuid, expiredRunIds));
  return artifacts.length;
}

export async function executeBackupRun(input: {
  destination: BackupDestination;
  requestedBy: { uuid: string; email: string };
  trigger: "manual" | "scheduled";
  mode: "full" | "database";
  request?: Pick<Request, "headers">;
}): Promise<typeof backupRuns.$inferSelect> {
  const now = new Date();
  const runId = newUuid();
  await db.insert(backupRuns).values({
    uuid: runId,
    destinationUuid: input.destination.uuid,
    trigger: input.trigger,
    mode: input.mode,
    status: "queued",
    requestedBy: input.requestedBy.uuid,
    progress: 0,
    summary: null,
    errorCode: null,
    createdAt: now,
  });
  await recordAuditEvent({
    action: "backup.run.start",
    actorUserUuid: input.requestedBy.uuid,
    actorEmailSnapshot: input.requestedBy.email,
    targetId: runId,
    outcome: "succeeded",
    request: input.request,
    metadata: { trigger: input.trigger, mode: input.mode, includeAttachments: input.destination.includeAttachments },
  });
  try {
    await db.update(backupRuns).set({ status: "running", startedAt: new Date(), progress: 10 })
      .where(eq(backupRuns.uuid, runId));
    const tables = await readBackupTables();
    await db.update(backupRuns).set({ progress: 35 }).where(eq(backupRuns.uuid, runId));
    const attachmentResult = input.mode === "full" && input.destination.includeAttachments
      ? await collectAttachmentBytes(tables)
      : { files: [], failures: 0 };
    const created = createBackupArchive({
      tables,
      attachments: attachmentResult.files,
      encryptionKey: backupEncryptionKeyFromEnvironment(),
    });
    await db.update(backupRuns).set({ progress: 70 }).where(eq(backupRuns.uuid, runId));
    const adapter = destinationAdapter(input.destination);
    const objectName = `backups/${now.toISOString().slice(0, 10)}/${runId}.vwb`;
    const stored = await adapter.write(objectName, created.archive);
    const artifactId = newUuid();
    const summary = {
      tableCount: created.manifest.tableCount,
      attachmentCount: created.manifest.attachmentCount,
      attachmentFailures: attachmentResult.failures,
      size: stored.size,
    };
    const status = attachmentResult.failures > 0 ? "partially-succeeded" : "succeeded";
    await db.transaction(async (tx) => {
      await tx.insert(backupArtifacts).values({
        uuid: artifactId,
        runUuid: runId,
        formatVersion: created.manifest.formatVersion,
        objectKey: stored.key,
        size: stored.size,
        sha256: created.sha256,
        encryptedDataKey: created.encryptedDataKey,
        manifestSummary: JSON.stringify(summary),
        createdAt: new Date(),
        expiresAt: null,
      });
      await tx.update(backupRuns).set({
        status,
        progress: 100,
        summary: JSON.stringify(summary),
        finishedAt: new Date(),
      }).where(eq(backupRuns.uuid, runId));
    });
    await applyDestinationRetention(input.destination, adapter);
    await recordAuditEvent({
      action: "backup.run.finish",
      actorUserUuid: input.requestedBy.uuid,
      actorEmailSnapshot: input.requestedBy.email,
      targetId: runId,
      outcome: status === "succeeded" ? "succeeded" : "partial",
      request: input.request,
      metadata: { status, size: stored.size, count: created.manifest.attachmentCount },
    });
  } catch (error) {
    const errorCode = error instanceof Error ? error.name.slice(0, 80) : "BackupError";
    await db.update(backupRuns).set({
      status: "failed",
      progress: 100,
      errorCode,
      finishedAt: new Date(),
    }).where(eq(backupRuns.uuid, runId));
    await recordAuditEvent({
      action: "backup.run.finish",
      actorUserUuid: input.requestedBy.uuid,
      actorEmailSnapshot: input.requestedBy.email,
      targetId: runId,
      outcome: "failed",
      request: input.request,
      metadata: { status: "failed", size: 0, count: 0 },
    });
  }
  const [run] = await db.select().from(backupRuns).where(eq(backupRuns.uuid, runId)).limit(1);
  if (!run) throw new Error("Backup run disappeared after execution.");
  return run;
}

export async function runScheduledBackups(requestedBy: { uuid: string; email: string }): Promise<Array<typeof backupRuns.$inferSelect>> {
  const destinations = await db.select().from(backupDestinations).where(eq(backupDestinations.enabled, true));
  const scheduled = destinations.filter((destination) => Boolean(destination.schedule));
  const results: Array<typeof backupRuns.$inferSelect> = [];
  for (const destination of scheduled) {
    results.push(await executeBackupRun({
      destination,
      requestedBy,
      trigger: "scheduled",
      mode: destination.includeAttachments ? "full" : "database",
    }));
  }
  return results;
}

async function artifactContext(id: string): Promise<{
  artifact: BackupArtifact;
  destination: BackupDestination;
  adapter: BackupDestinationAdapter;
}> {
  const [artifact] = await db.select().from(backupArtifacts).where(eq(backupArtifacts.uuid, id)).limit(1);
  if (!artifact) throw new Error("Backup artifact was not found.");
  const [run] = await db.select().from(backupRuns).where(eq(backupRuns.uuid, artifact.runUuid)).limit(1);
  if (!run?.destinationUuid) throw new Error("Backup artifact destination is unavailable.");
  const [destination] = await db.select().from(backupDestinations).where(eq(backupDestinations.uuid, run.destinationUuid)).limit(1);
  if (!destination) throw new Error("Backup artifact destination is unavailable.");
  return { artifact, destination, adapter: destinationAdapter(destination) };
}

export async function readBackupArtifact(id: string): Promise<{ artifact: BackupArtifact; bytes: Uint8Array }> {
  const context = await artifactContext(id);
  return { artifact: context.artifact, bytes: await context.adapter.read(context.artifact.objectKey) };
}

export async function verifyBackupArtifact(id: string) {
  try {
    const { artifact, bytes } = await readBackupArtifact(id);
    const opened = openBackupArchive({
      archive: bytes,
      encryptedDataKey: artifact.encryptedDataKey,
      expectedSha256: artifact.sha256,
      encryptionKey: backupEncryptionKeyFromEnvironment(),
    });
    return { status: "valid" as const, manifest: opened.manifest };
  } catch (error) {
    return { status: "corrupt" as const, errorCode: error instanceof Error ? error.name : "BackupError" };
  }
}

export async function deleteBackupArtifact(id: string): Promise<void> {
  const context = await artifactContext(id);
  await context.adapter.delete(context.artifact.objectKey);
  await db.delete(backupArtifacts).where(eq(backupArtifacts.uuid, id));
}

interface DynamicTransaction {
  delete(table: unknown): PromiseLike<unknown>;
  insert(table: unknown): {
    values(rows: unknown[]): { onConflictDoNothing(): PromiseLike<unknown> };
  };
}

async function restoreDatabase(tx: DatabaseTransaction, tables: Record<string, unknown[]>, mode: "merge" | "replace") {
  const dynamic = tx as unknown as DynamicTransaction;
  if (mode === "replace") {
    for (const name of [...TABLE_ORDER].reverse()) await dynamic.delete(TABLES[name]);
  }
  for (const name of TABLE_ORDER) {
    const rows = tables[name] ?? [];
    if (rows.length > 0) await dynamic.insert(TABLES[name]).values(rows).onConflictDoNothing();
  }
}

async function restoreFileObjects(
  tables: Record<string, unknown[]>,
  files: Array<{ id: string; bytes: Uint8Array }>
): Promise<RestoreKindResult> {
  let restored = 0;
  let failed = 0;
  const byId = new Map(files.map((file) => [file.id, file.bytes]));
  for (const row of tables.attachments as Array<{ uuid: string; blobUrl: string; status: string }> ?? []) {
    if (row.status !== "complete") continue;
    const bytes = byId.get(`attachment:${row.uuid}`);
    if (!bytes) { failed += 1; continue; }
    try {
      const blob = await put(`restored/attachments/${row.uuid}`, new Blob([Uint8Array.from(bytes).buffer]), { access: "public", addRandomSuffix: false });
      row.blobUrl = blob.url;
      restored += 1;
    } catch { failed += 1; }
  }
  for (const row of tables.sendFiles as Array<{ uuid: string; blobUrl: string; status: string }> ?? []) {
    if (row.status !== "complete") continue;
    const bytes = byId.get(`send:${row.uuid}`);
    if (!bytes) { failed += 1; continue; }
    try {
      const blob = await put(`restored/sends/${row.uuid}`, new Blob([Uint8Array.from(bytes).buffer]), { access: "public", addRandomSuffix: false });
      row.blobUrl = blob.url;
      restored += 1;
    } catch { failed += 1; }
  }
  return { kind: "attachments", restored, failed };
}

export async function restoreBackupArtifact(input: {
  artifactId: string;
  mode: "merge" | "replace";
}): Promise<ReturnType<typeof summarizeRestoreResults>> {
  const { artifact, bytes } = await readBackupArtifact(input.artifactId);
  const opened = openBackupArchive({
    archive: bytes,
    encryptedDataKey: artifact.encryptedDataKey,
    expectedSha256: artifact.sha256,
    encryptionKey: backupEncryptionKeyFromEnvironment(),
  });
  const fileResult = await restoreFileObjects(opened.tables, opened.attachments);
  await db.transaction((tx) => restoreDatabase(tx, opened.tables, input.mode));
  const databaseRows = Object.values(opened.tables).reduce((total, rows) => total + rows.length, 0);
  return summarizeRestoreResults([
    { kind: "database", restored: databaseRows, failed: 0 },
    fileResult,
  ]);
}
