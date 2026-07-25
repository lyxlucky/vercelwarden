"use client";

export type ThemePreference = "system" | "light" | "dark";
export type LocalePreference = "zh-CN" | "en";
export type TimeoutAction = "lock" | "logout";

export interface ClientPreferences {
  theme: ThemePreference;
  locale: LocalePreference;
  lockTimeoutMs: number;
  timeoutAction: TimeoutAction;
}

const defaults: ClientPreferences = {
  theme: "system",
  locale: "zh-CN",
  lockTimeoutMs: 15 * 60_000,
  timeoutAction: "lock",
};

export function loadPreferences(): ClientPreferences {
  if (typeof window === "undefined") return defaults;
  const theme = localStorage.getItem("vercelwarden.theme");
  const locale = localStorage.getItem("vercelwarden.locale");
  const timeout = Number(localStorage.getItem("vercelwarden.lock-timeout-ms"));
  const action = localStorage.getItem("vercelwarden.timeout-action");
  return {
    theme: theme === "light" || theme === "dark" ? theme : "system",
    locale: locale === "en" ? "en" : "zh-CN",
    lockTimeoutMs: Number.isFinite(timeout) && timeout >= 60_000 ? timeout : defaults.lockTimeoutMs,
    timeoutAction: action === "logout" ? "logout" : "lock",
  };
}

export function savePreferences(preferences: ClientPreferences): void {
  localStorage.setItem("vercelwarden.theme", preferences.theme);
  localStorage.setItem("vercelwarden.locale", preferences.locale);
  localStorage.setItem("vercelwarden.lock-timeout-ms", String(preferences.lockTimeoutMs));
  localStorage.setItem("vercelwarden.timeout-action", preferences.timeoutAction);
  document.documentElement.dataset.theme = preferences.theme === "system" ? "" : preferences.theme;
  document.documentElement.lang = preferences.locale;
}
