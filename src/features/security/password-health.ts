import { apiClient } from "@/lib/client/api/client";
import type { VaultItemView } from "@/features/vault/store";

export interface PasswordRiskItem {
  itemId: string;
  name: string;
  username: string;
  password: string;
  weak: boolean;
  reused: boolean;
  breached: "yes" | "no" | "unknown";
  breachCount: number | null;
}

function weakPassword(password: string) {
  if (password.length < 12) return true;
  let groups = 0;
  if (/[a-z]/.test(password)) groups += 1;
  if (/[A-Z]/.test(password)) groups += 1;
  if (/\d/.test(password)) groups += 1;
  if (/[^A-Za-z0-9]/.test(password)) groups += 1;
  return groups < 3 || /^(.)\1+$/.test(password) || /password|qwerty|123456|letmein/i.test(password);
}

export function classifyPasswordHealth(items: readonly VaultItemView[]): PasswordRiskItem[] {
  const active = items.filter((item) => item.type === 1 && item.password && !item.archivedAt && !item.deletedAt);
  const counts = new Map<string, number>();
  for (const item of active) counts.set(item.password, (counts.get(item.password) ?? 0) + 1);
  return active.map((item) => ({ itemId: item.id, name: item.name, username: item.username, password: item.password, weak: weakPassword(item.password), reused: (counts.get(item.password) ?? 0) > 1, breached: "unknown", breachCount: null }));
}

async function sha1(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
  bytes.fill(0);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export async function checkBreachedPasswords(items: PasswordRiskItem[]) {
  const hashes = await Promise.all(items.map(async (item) => ({ item, hash: await sha1(item.password) })));
  const prefixes = new Map<string, typeof hashes>();
  for (const entry of hashes) {
    const prefix = entry.hash.slice(0, 5);
    prefixes.set(prefix, [...(prefixes.get(prefix) ?? []), entry]);
  }
  const results = new Map<string, number | null>();
  await Promise.all(Array.from(prefixes.entries()).map(async ([prefix, entries]) => {
    try {
      const response = await apiClient<{ status: "available"; suffixes: Record<string, number> }>(`/api/hibp/breach?prefix=${prefix}`);
      for (const entry of entries) results.set(entry.item.itemId, response.suffixes[entry.hash.slice(5)] ?? 0);
    } catch {
      for (const entry of entries) results.set(entry.item.itemId, null);
    }
  }));
  return items.map((item) => {
    const count = results.get(item.itemId) ?? null;
    return { ...item, breached: count == null ? "unknown" as const : count > 0 ? "yes" as const : "no" as const, breachCount: count };
  });
}
