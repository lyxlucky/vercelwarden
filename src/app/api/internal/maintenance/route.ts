import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import {
  attachments,
  auditRetentionSettings,
  authRequests,
  backupArtifacts,
  idempotencyRecords,
  reauthProofNonces,
  sendFiles,
  sends,
} from "@/db/schema";
import { applyAuditRetention } from "@/lib/server/audit/service";
import { deleteBackupArtifact } from "@/lib/server/backup/jobs";
import { ApiError, apiErrorResponse } from "@/lib/server/http/errors";

function authorizeMaintenance(request: Request): void {
  const expected = process.env.MAINTENANCE_CRON_SECRET ?? process.env.BACKUP_CRON_SECRET;
  if (!expected || expected.length < 16) throw new ApiError(503, "maintenance_unconfigured", "Maintenance authentication is not configured.");
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/iu, "") ?? "";
  const left = createHash("sha256").update(presented).digest();
  const right = createHash("sha256").update(expected).digest();
  if (!presented || !timingSafeEqual(left, right)) throw new ApiError(401, "unauthorized", "Maintenance authentication is required.");
}

async function deleteBlobUrls(urls: string[]): Promise<number> {
  let removed = 0;
  for (const url of urls.filter(Boolean)) {
    try { await del(url); removed += 1; } catch { /* database cleanup still proceeds */ }
  }
  return removed;
}

export async function POST(request: Request) {
  try {
    authorizeMaintenance(request);
    const now = new Date();
    const expiredRequests = await db.update(authRequests).set({ status: "expired", respondedAt: now })
      .where(and(eq(authRequests.status, "pending"), lt(authRequests.expiresAt, now)))
      .returning({ id: authRequests.uuid });

    const pendingAttachments = await db.select({ id: attachments.uuid, blobUrl: attachments.blobUrl }).from(attachments)
      .where(and(eq(attachments.status, "pending"), lt(attachments.uploadExpiresAt, now)));
    await deleteBlobUrls(pendingAttachments.map((item) => item.blobUrl));
    if (pendingAttachments.length) await db.delete(attachments)
      .where(and(eq(attachments.status, "pending"), lt(attachments.uploadExpiresAt, now)));

    const pendingSendFiles = await db.select({ id: sendFiles.uuid, blobUrl: sendFiles.blobUrl }).from(sendFiles)
      .where(and(eq(sendFiles.status, "pending"), lt(sendFiles.uploadExpiresAt, now)));
    await deleteBlobUrls(pendingSendFiles.map((item) => item.blobUrl));
    if (pendingSendFiles.length) await db.delete(sendFiles)
      .where(and(eq(sendFiles.status, "pending"), lt(sendFiles.uploadExpiresAt, now)));

    const expiredSends = await db.select({ id: sends.uuid }).from(sends).where(lt(sends.deletionDate, now));
    const expiredSendFiles = expiredSends.length
      ? await db.select({ blobUrl: sendFiles.blobUrl }).from(sendFiles)
        .where(inArray(sendFiles.sendUuid, expiredSends.map((send) => send.id)))
      : [];
    await deleteBlobUrls(expiredSendFiles.map((item) => item.blobUrl));
    if (expiredSends.length) await db.delete(sends).where(lt(sends.deletionDate, now));

    const [retention] = await db.select().from(auditRetentionSettings)
      .where(eq(auditRetentionSettings.id, "default")).limit(1);
    const auditEvents = retention
      ? await applyAuditRetention({ retentionDays: retention.retentionDays, maxEntries: retention.maxEntries })
      : 0;

    const expiredArtifacts = await db.select({ id: backupArtifacts.uuid }).from(backupArtifacts)
      .where(lt(backupArtifacts.expiresAt, now));
    let backupArtifactsRemoved = 0;
    for (const artifact of expiredArtifacts) {
      try { await deleteBackupArtifact(artifact.id); backupArtifactsRemoved += 1; } catch { /* retry next run */ }
    }

    const idempotency = await db.delete(idempotencyRecords).where(lt(idempotencyRecords.expiresAt, now))
      .returning({ id: idempotencyRecords.uuid });
    const reauthProofs = await db.delete(reauthProofNonces).where(lt(reauthProofNonces.expiresAt, now))
      .returning({ id: reauthProofNonces.uuid });

    return Response.json({
      object: "maintenanceResult",
      expiredAuthRequests: expiredRequests.length,
      pendingAttachments: pendingAttachments.length,
      pendingSendFiles: pendingSendFiles.length,
      expiredSends: expiredSends.length,
      auditEvents,
      backupArtifacts: backupArtifactsRemoved,
      idempotencyRecords: idempotency.length,
      reauthProofs: reauthProofs.length,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
