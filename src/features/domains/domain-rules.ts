export interface CustomEquivalentDomainGroup {
  id: string;
  domains: string[];
  enabled: boolean;
}

export interface DomainSettingsInput {
  equivalentDomains: string[][];
  customEquivalentDomains: CustomEquivalentDomainGroup[];
  excludedGlobalDomainIds: number[];
}

function domainError(message: string): never {
  throw new Error(message);
}

export function normalizeDomainName(input: string): string {
  const value = input.normalize("NFKC").trim();
  if (!value || value.length > 2048 || /[\s*]/u.test(value)) {
    return domainError("Domain must be a valid hostname.");
  }
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return domainError("Domain must be a valid hostname.");
  }
  if (!/^https?:$/i.test(parsed.protocol) || parsed.username || parsed.password) {
    return domainError("Domain must use an HTTP(S) hostname without credentials.");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/u, "");
  if (!hostname || hostname.length > 253) return domainError("Domain must be a valid hostname.");
  const labels = hostname.split(".");
  if (labels.some((label) => !label || label.length > 63 || !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/u.test(label))) {
    return domainError("Domain must be a valid hostname.");
  }
  return hostname;
}

function normalizeGroup(domains: string[], label: string): string[] {
  if (!Array.isArray(domains)) return domainError(`${label} domains must be an array.`);
  const normalized = domains.map(normalizeDomainName);
  const unique = new Set(normalized);
  if (unique.size < 2) return domainError(`${label} must contain at least two distinct domains.`);
  if (unique.size !== normalized.length) return domainError(`${label} contains a domain more than once.`);
  return normalized;
}

export function normalizeDomainSettings(
  input: DomainSettingsInput,
  knownGlobalDomainIds: readonly number[]
): DomainSettingsInput {
  if (!input || !Array.isArray(input.equivalentDomains) || !Array.isArray(input.customEquivalentDomains) ||
      !Array.isArray(input.excludedGlobalDomainIds)) {
    return domainError("Domain settings have an invalid shape.");
  }

  const equivalentDomains = input.equivalentDomains.map((group, index) =>
    normalizeGroup(group, `Equivalent domain group ${index + 1}`)
  );
  const customIds = new Set<string>();
  const customEquivalentDomains = input.customEquivalentDomains.map((group, index) => {
    const id = group.id?.trim();
    if (!id || id.length > 100 || !/^[a-zA-Z0-9_-]+$/u.test(id) || customIds.has(id)) {
      return domainError(`Custom domain group ${index + 1} has an invalid or duplicate id.`);
    }
    customIds.add(id);
    return {
      id,
      enabled: Boolean(group.enabled),
      domains: normalizeGroup(group.domains, `Custom domain group ${id}`),
    };
  });

  const domainOwners = new Map<string, string>();
  const allGroups = [
    ...equivalentDomains.map((domains, index) => ({ label: `equivalent group ${index + 1}`, domains })),
    ...customEquivalentDomains.map((group) => ({ label: `custom group ${group.id}`, domains: group.domains })),
  ];
  for (const group of allGroups) {
    for (const domain of group.domains) {
      const previous = domainOwners.get(domain);
      if (previous) return domainError(`Domain ${domain} appears in more than one group (${previous} and ${group.label}).`);
      domainOwners.set(domain, group.label);
    }
  }

  const known = new Set(knownGlobalDomainIds);
  const excludedGlobalDomainIds = [...new Set(input.excludedGlobalDomainIds)].sort((a, b) => a - b);
  if (excludedGlobalDomainIds.some((id) => !Number.isSafeInteger(id) || !known.has(id))) {
    return domainError("Domain settings contain an unknown global domain id.");
  }
  return { equivalentDomains, customEquivalentDomains, excludedGlobalDomainIds };
}
