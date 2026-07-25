const CACHE_PREFIX = "vercelwarden-shell-";
const CACHE_VERSION = "v1";
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const PRECACHE_URLS = [
  "/",
  "/login",
  "/lock",
  "/vault",
  "/manifest.webmanifest",
  "/pwa/icon-192.svg",
  "/pwa/icon-512.svg",
  "/pwa/maskable-512.svg",
];
const PROTECTED_PREFIXES = ["/api/", "/identity/", "/icons/", "/notifications/", "/send/"];
const SHELL_ROUTES = new Set(["/", "/login", "/lock", "/vault"]);

function mustBypass(request, url) {
  return request.method !== "GET" ||
    request.headers.has("authorization") ||
    (request.credentials !== "omit" && request.mode !== "navigate" && !isImmutableAsset(url)) ||
    PROTECTED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

function isImmutableAsset(url) {
  return url.origin === self.location.origin && (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/pwa/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

function isShellRscRequest(request, url) {
  return request.method === "GET" && request.headers.get("rsc") === "1" && SHELL_ROUTES.has(url.pathname);
}

function shellRscCacheKey(url) {
  return `/__vercelwarden_rsc__${url.pathname === "/" ? "/root" : url.pathname}`;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      const response = await fetch(new Request(url, { credentials: "omit", cache: "reload" }));
      if (!response.ok) return;
      await cache.put(url, response.clone());
      if (response.headers.get("content-type")?.includes("text/html")) {
        const html = await response.text();
        const assets = [...html.matchAll(/\/_next\/static\/[^"'<>\s]+/g)].map((match) => match[0]);
        await Promise.all([...new Set(assets)].map(async (asset) => {
          const assetResponse = await fetch(new Request(asset, { credentials: "omit", cache: "reload" }));
          if (assetResponse.ok) await cache.put(asset, assetResponse);
        }));
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) =>
      cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME ? caches.delete(cacheName) : undefined
    ));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isShellRscRequest(request, url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok && response.headers.get("content-type")?.includes("text/x-component")) {
          await cache.put(shellRscCacheKey(url), response.clone());
        }
        return response;
      } catch {
        return (await cache.match(shellRscCacheKey(url))) ?? Response.error();
      }
    })());
    return;
  }

  if (mustBypass(request, url)) return;

  if (isImmutableAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const network = fetch(request).then(async (response) => {
        if (response.ok && response.type === "basic") await cache.put(request, response.clone());
        return response;
      });
      return cached ?? network;
    })());
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(url.pathname)) ?? (await cache.match("/")) ?? Response.error();
    }));
  }
});
