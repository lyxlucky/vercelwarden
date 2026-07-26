"use client";

import {
  DEFAULT_APPEARANCE,
  sanitizeAppearance,
  type AppearancePreferences,
} from "@/components/theme/appearance";

export type ThemePreference = "system" | "light" | "dark";
export type LocalePreference = "zh-CN" | "en";
export type TimeoutAction = "lock" | "logout";
export const PREFERENCES_CHANGED_EVENT = "vercelwarden:preferences-changed";
export const APPEARANCE_STORAGE_KEY = "vercelwarden.appearance";

export interface ClientPreferences {
  theme: ThemePreference;
  locale: LocalePreference;
  lockTimeoutMs: number;
  timeoutAction: TimeoutAction;
  appearance: AppearancePreferences;
}

export const DEFAULT_CLIENT_PREFERENCES: ClientPreferences = {
  theme: "system",
  locale: "zh-CN",
  lockTimeoutMs: 15 * 60_000,
  timeoutAction: "lock",
  appearance: DEFAULT_APPEARANCE,
};

function loadAppearance(): AppearancePreferences {
  const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_APPEARANCE };
  try {
    return sanitizeAppearance(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function loadPreferences(): ClientPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_CLIENT_PREFERENCES, appearance: { ...DEFAULT_APPEARANCE } };
  const theme = localStorage.getItem("vercelwarden.theme");
  const locale = localStorage.getItem("vercelwarden.locale");
  const timeout = Number(localStorage.getItem("vercelwarden.lock-timeout-ms"));
  const action = localStorage.getItem("vercelwarden.timeout-action");
  return {
    theme: theme === "light" || theme === "dark" ? theme : "system",
    locale: locale === "en" ? "en" : "zh-CN",
    lockTimeoutMs: Number.isFinite(timeout) && timeout >= 60_000 ? timeout : DEFAULT_CLIENT_PREFERENCES.lockTimeoutMs,
    timeoutAction: action === "logout" ? "logout" : "lock",
    appearance: loadAppearance(),
  };
}

export function savePreferences(preferences: ClientPreferences): void {
  const appearance = sanitizeAppearance(preferences.appearance);
  localStorage.setItem("vercelwarden.theme", preferences.theme);
  localStorage.setItem("vercelwarden.locale", preferences.locale);
  localStorage.setItem("vercelwarden.lock-timeout-ms", String(preferences.lockTimeoutMs));
  localStorage.setItem("vercelwarden.timeout-action", preferences.timeoutAction);
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  document.documentElement.lang = preferences.locale;
  window.dispatchEvent(new CustomEvent<ClientPreferences>(PREFERENCES_CHANGED_EVENT, {
    detail: { ...preferences, appearance },
  }));
}
