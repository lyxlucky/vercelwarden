export interface NotificationOriginEnvironment {
  [key: string]: string | undefined;
  BROWSER_EXTENSION_ORIGINS?: string;
}

const OFFICIAL_BITWARDEN_DESKTOP_ORIGINS = new Set(["bw-desktop-file://bundle"]);

export function normalizeClientOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (!url.protocol || !url.host) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function isBrowserExtensionOrigin(origin: string): boolean {
  try {
    return new URL(origin).protocol.endsWith("-extension:");
  } catch {
    return false;
  }
}

export function configuredClientOrigins(
  env: NotificationOriginEnvironment = process.env
): Set<string> {
  const origins = new Set(OFFICIAL_BITWARDEN_DESKTOP_ORIGINS);
  for (const value of (env.BROWSER_EXTENSION_ORIGINS ?? "").split(",")) {
    const origin = normalizeClientOrigin(value);
    if (origin) origins.add(origin);
  }
  return origins;
}

export function isAllowedNotificationOrigin(input: {
  origin: string | null;
  requestOrigin: string;
  env?: NotificationOriginEnvironment;
}): boolean {
  if (!input.origin) return true;
  const origin = normalizeClientOrigin(input.origin);
  if (!origin) return false;
  return origin === normalizeClientOrigin(input.requestOrigin)
    || isBrowserExtensionOrigin(origin)
    || configuredClientOrigins(input.env).has(origin);
}

