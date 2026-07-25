import { generateTotpCode, parseTotpInput, remainingTotpSeconds, type ParsedTotp } from "@/lib/client/crypto/totp";
import type { VaultItemView } from "@/features/vault/store";

export interface TotpCodeView {
  itemId: string;
  name: string;
  username: string;
  config: ParsedTotp;
  code: string;
  remaining: number;
}

export async function buildTotpCodeViews(items: readonly VaultItemView[], timestamp = Date.now()): Promise<TotpCodeView[]> {
  const candidates = items.flatMap((item) => {
    if (item.type !== 1 || item.archivedAt || item.deletedAt) return [];
    const value = item.draft?.payload.totp;
    if (typeof value !== "string" || !value) return [];
    try { return [{ item, config: parseTotpInput(value) }]; } catch { return []; }
  });
  return Promise.all(candidates.map(async ({ item, config }) => ({
    itemId: item.id,
    name: item.name,
    username: item.username,
    config,
    code: await generateTotpCode(config, timestamp),
    remaining: remainingTotpSeconds(config.period, timestamp),
  })));
}
