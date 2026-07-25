"use client";

import { apiClient } from "@/lib/client/api/client";
import type { DomainSettingsInput } from "@/features/domains/domain-rules";
import type { GlobalEquivalentDomainGroup } from "@/features/domains/global-domains";

export interface DomainSettingsResponse extends DomainSettingsInput {
  globalEquivalentDomains: GlobalEquivalentDomainGroup[];
}

export function fetchDomainSettings() {
  return apiClient<DomainSettingsResponse>("/api/settings/domains");
}

export function saveDomainSettings(settings: DomainSettingsInput) {
  return apiClient<DomainSettingsResponse>("/api/settings/domains", { method: "PUT", body: { ...settings } });
}
