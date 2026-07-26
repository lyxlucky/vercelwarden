import "server-only";
import { waitUntil } from "@vercel/functions";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { userRevisions } from "@/db/schema";
import { publishNotification } from "@/lib/server/notifications/service";
import { recordNotificationMetric } from "@/lib/server/notifications/observability";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface RevisionStamp {
  sequence: number;
  revisionDate: Date;
}

export interface MutationNotification extends RevisionStamp {
  userUuid: string;
  resourceKind: string;
  resourceId?: string;
  actingDeviceIdentifier?: string;
}

export function scheduleMutationNotification(
  event: MutationNotification,
  notify: (event: MutationNotification) => Promise<void> | void,
  defer: (promise: Promise<unknown>) => void | undefined = waitUntil
): Promise<void> {
  const notification = Promise.resolve()
    .then(() => notify(event))
    .catch((error) => {
      recordNotificationMetric("broker_publish_failure", {
        detail: error instanceof Error ? error.name : "unknown",
        resourceKind: event.resourceKind,
      }, "warn");
    });
  defer(notification);
  return notification;
}

export async function commitUserMutation<T>(input: {
  userUuid: string;
  resourceKind: string;
  resourceId?: string;
  actingDeviceIdentifier?: string;
  mutate: (tx: DatabaseTransaction) => Promise<T>;
  notify?: (event: MutationNotification) => Promise<void> | void;
}): Promise<{ value: T; revision: RevisionStamp }> {
  const committed = await db.transaction(async (tx) => {
    const value = await input.mutate(tx);
    const revisionDate = new Date();
    await tx
      .insert(userRevisions)
      .values({ userUuid: input.userUuid, revisionDate, sequence: 1 })
      .onConflictDoUpdate({
        target: userRevisions.userUuid,
        set: {
          revisionDate,
          sequence: sql`${userRevisions.sequence} + 1`,
        },
      });
    const [revision] = await tx
      .select({ sequence: userRevisions.sequence, revisionDate: userRevisions.revisionDate })
      .from(userRevisions)
      .where(sql`${userRevisions.userUuid} = ${input.userUuid}`)
      .limit(1);
    if (!revision) throw new Error("User revision was not committed.");
    return { value, revision };
  });

  const notify = input.notify ?? publishNotification;
  if (notify) {
    scheduleMutationNotification({
      ...committed.revision,
      userUuid: input.userUuid,
      resourceKind: input.resourceKind,
      resourceId: input.resourceId,
      actingDeviceIdentifier: input.actingDeviceIdentifier,
    }, notify);
  }
  return committed;
}
