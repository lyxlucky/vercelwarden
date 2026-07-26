import { eq } from "drizzle-orm";
import { z } from "zod";
import { domainSettings, users } from "@/db/schema";
import { GLOBAL_EQUIVALENT_DOMAINS } from "@/features/domains/global-domains";
import { normalizeDomainSettings } from "@/features/domains/domain-rules";
import { readStoredDomainSettings } from "@/features/domains/store";
import { buildCapabilityDocument } from "@/lib/contracts/capabilities";
import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { ApiError, apiErrorResponse, parseJsonBody } from "@/lib/server/http/errors";
import { commitUserMutation } from "@/lib/server/mutations/commit";

const customGroupSchema = z.object({
  id: z.string().min(1).max(100),
  domains: z.array(z.string().min(1).max(2048)).min(1).max(50),
  enabled: z.boolean().default(true),
}).strict();

const updateSchema = z.object({
  equivalentDomains: z.array(z.array(z.string().min(1).max(2048)).max(50)).max(100).default([]),
  customEquivalentDomains: z.array(customGroupSchema).max(100).default([]),
  excludedGlobalDomainIds: z.array(z.number().int().nonnegative()).max(500).optional(),
  excludedGlobalEquivalentDomains: z.array(z.number().int().nonnegative()).max(500).optional(),
}).strict();

function responseBody(settings: {
  equivalentDomains: string[][];
  customEquivalentDomains: Array<{ id: string; domains: string[]; enabled: boolean }>;
  excludedGlobalDomainIds: number[];
}) {
  return {
    ...settings,
    excludedGlobalEquivalentDomains: settings.excludedGlobalDomainIds,
    globalEquivalentDomains: GLOBAL_EQUIVALENT_DOMAINS,
    object: "domains",
  };
}

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const settings = await readStoredDomainSettings(auth.user);
    return Response.json(responseBody(settings), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (!buildCapabilityDocument().capabilities["domainRules.write"]) {
      throw new ApiError(404, "not_found", "Domain rule editing is unavailable.");
    }
    const body = await parseJsonBody(request, updateSchema, 256 * 1024);
    const normalized = normalizeDomainSettings({
      equivalentDomains: body.equivalentDomains,
      customEquivalentDomains: body.customEquivalentDomains,
      excludedGlobalDomainIds: body.excludedGlobalDomainIds ?? body.excludedGlobalEquivalentDomains ?? [],
    }, GLOBAL_EQUIVALENT_DOMAINS.map((group) => group.id));
    const now = new Date();
    await commitUserMutation({
      userUuid: auth.user.uuid,
      resourceKind: "domainSettings",
      actingDeviceIdentifier: auth.device.identifier,
      mutate: async (tx) => {
        await tx.insert(domainSettings).values({
          userUuid: auth.user.uuid,
          equivalentDomains: JSON.stringify(normalized.equivalentDomains),
          customEquivalentDomains: JSON.stringify(normalized.customEquivalentDomains),
          excludedGlobalDomainIds: JSON.stringify(normalized.excludedGlobalDomainIds),
          updatedAt: now,
        }).onConflictDoUpdate({
          target: domainSettings.userUuid,
          set: {
            equivalentDomains: JSON.stringify(normalized.equivalentDomains),
            customEquivalentDomains: JSON.stringify(normalized.customEquivalentDomains),
            excludedGlobalDomainIds: JSON.stringify(normalized.excludedGlobalDomainIds),
            updatedAt: now,
          },
        });
        await tx.update(users).set({
          equivalentDomains: JSON.stringify(normalized.equivalentDomains),
          excludedGlobals: JSON.stringify(normalized.excludedGlobalDomainIds),
          updatedAt: now,
        }).where(eq(users.uuid, auth.user.uuid));
      },
    });
    return Response.json(responseBody(normalized), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
