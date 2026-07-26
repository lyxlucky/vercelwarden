import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { domainSettings } from "@/db/schema";
import type { CustomEquivalentDomainGroup, DomainSettingsInput } from "@/features/domains/domain-rules";

function parsedArray<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Fields the fallback path needs from the authenticated user row. Both
// `verifyAuth` and `authenticateRequest` return the full `users.$inferSelect`,
// which satisfies this.
export interface StoredDomainSettingsUser {
  uuid: string;
  equivalentDomains: string;
  excludedGlobals: string;
}

// Single source of truth for a user's persisted domain settings. Reads the
// dedicated `domain_settings` row (which alone holds custom groups); when a user
// has never saved via the settings UI, falls back to the legacy columns mirrored
// onto the `users` row. Consumed by `/api/sync` (serialized to the client wire
// format) and `GET /api/settings/domains` (first-party settings UI).
export async function readStoredDomainSettings(
  user: StoredDomainSettingsUser
): Promise<DomainSettingsInput> {
  const [stored] = await db
    .select()
    .from(domainSettings)
    .where(eq(domainSettings.userUuid, user.uuid))
    .limit(1);
  if (stored) {
    return {
      equivalentDomains: parsedArray<string[][]>(stored.equivalentDomains, []),
      customEquivalentDomains: parsedArray<CustomEquivalentDomainGroup[]>(stored.customEquivalentDomains, []),
      excludedGlobalDomainIds: parsedArray<number[]>(stored.excludedGlobalDomainIds, []),
    };
  }
  return {
    equivalentDomains: parsedArray<string[][]>(user.equivalentDomains, []),
    customEquivalentDomains: [],
    excludedGlobalDomainIds: parsedArray<number[]>(user.excludedGlobals, []),
  };
}
