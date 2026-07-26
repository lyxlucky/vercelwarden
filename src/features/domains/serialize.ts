import {
  GLOBAL_EQUIVALENT_DOMAINS,
  type GlobalEquivalentDomainGroup,
} from "@/features/domains/global-domains";
import type { DomainSettingsInput } from "@/features/domains/domain-rules";

// Bitwarden `domains` sync payload. Wire format is fully camelCase — matches
// Vaultwarden's `GlobalDomain` struct (`{ type, domains, excluded }`) and every
// other serializer in this repo (see src/lib/auth.ts, src/lib/folder.ts).
// Note: this differs from the first-party `/api/settings/domains` shape, which
// uses `{ id, name, domains }` for its own settings UI.
export interface ClientGlobalEquivalentDomain {
  type: number;
  domains: string[];
  excluded: boolean;
}

export interface ClientDomains {
  equivalentDomains: string[][];
  globalEquivalentDomains: ClientGlobalEquivalentDomain[];
  object: "domains";
}

// Project a user's stored domain settings into the wire format that stock
// Bitwarden clients (browser extension, mobile, desktop) read from `/api/sync`
// to drive equivalent-domain autofill matching. Enabled custom groups are
// surfaced alongside the compatibility `equivalentDomains` groups so rules
// created in the settings UI actually reach clients; global groups are always
// listed with an `excluded` flag derived from the user's opt-out list.
export function serializeDomainsForClient(
  settings: DomainSettingsInput,
  globals: readonly GlobalEquivalentDomainGroup[] = GLOBAL_EQUIVALENT_DOMAINS
): ClientDomains {
  const customGroups = settings.customEquivalentDomains
    .filter((group) => group.enabled)
    .map((group) => group.domains);
  const excluded = new Set(settings.excludedGlobalDomainIds);
  return {
    equivalentDomains: [...settings.equivalentDomains, ...customGroups],
    globalEquivalentDomains: globals.map((group) => ({
      type: group.id,
      domains: group.domains,
      excluded: excluded.has(group.id),
    })),
    object: "domains",
  };
}
