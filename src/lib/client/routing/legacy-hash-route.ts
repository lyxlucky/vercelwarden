interface BrowserLocationLike {
  pathname: string;
  hash: string;
  replace(url: string): void;
}

const LEGACY_SEND_HASH = /^#\/send\/([A-Za-z0-9_-]{16,128})\/([A-Za-z0-9_-]{16,256})\/?$/;

export function legacyHashRouteDestination(pathname: string, hash: string): string | null {
  if (pathname !== "/") return null;
  const match = LEGACY_SEND_HASH.exec(hash);
  if (!match) return null;
  const [, accessId, key] = match;
  return `/send/${accessId}#${key}`;
}

export function redirectLegacyHashRoute(location: BrowserLocationLike): boolean {
  const destination = legacyHashRouteDestination(location.pathname, location.hash);
  if (!destination) return false;
  location.replace(destination);
  return true;
}
