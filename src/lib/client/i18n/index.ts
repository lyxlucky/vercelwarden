import { en } from "./locales/en";
import { zhCN, type TranslationKey } from "./locales/zh-CN";

export const SUPPORTED_LOCALES = ["zh-CN", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const dictionaries = { "zh-CN": zhCN, en } as const;

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  const normalized = value?.trim().toLowerCase();
  return normalized?.startsWith("en") ? "en" : "zh-CN";
}

export function getDictionary(locale: string | null | undefined) {
  return dictionaries[normalizeLocale(locale)];
}

export function translate(locale: string | null | undefined, key: TranslationKey): string {
  return getDictionary(locale)[key] ?? zhCN[key];
}

export function missingTranslationKeys(dictionary: Partial<Record<TranslationKey, string>>): TranslationKey[] {
  return (Object.keys(zhCN) as TranslationKey[]).filter((key) => !dictionary[key]);
}
