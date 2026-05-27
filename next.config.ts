import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      // beforeFiles: rewrites run BEFORE Next checks for static files or
      // route handlers. The API/identity/icons paths must be remapped here
      // because their physical implementations live under /api/*.
      beforeFiles: [
        // === Bitwarden clients use root-path access ===
        { source: "/identity/:path*", destination: "/api/identity/:path*" },
        { source: "/icons/:path*", destination: "/api/icons/:path*" },

        // === Web Vault SPA embedded under /web-vault/ ===
        // settings.json uses absolute paths /api, /identity, /icons — already
        // handled by the root-path rewrites above. The rewrites below are a
        // safety net for the case where the SPA's APP_BASE_HREF is wrong and
        // it produces /web-vault/...-prefixed URLs.
        { source: "/web-vault/api/:path*", destination: "/api/:path*" },
        { source: "/web-vault/identity/:path*", destination: "/api/identity/:path*" },
        { source: "/web-vault/icons/:path*", destination: "/api/icons/:path*" },

        // Same safety net when the SPA additionally prepends /index.html to
        // its base path. Without these, e.g. POSTing to
        // /web-vault/index.html/identity/accounts/prelogin/password 404s.
        { source: "/web-vault/index.html/api/:path*", destination: "/api/:path*" },
        { source: "/web-vault/index.html/identity/:path*", destination: "/api/identity/:path*" },
        { source: "/web-vault/index.html/icons/:path*", destination: "/api/icons/:path*" },
      ],

      afterFiles: [],

      // fallback: runs AFTER pages, route handlers, and static files. Anything
      // still unmatched under /web-vault/ is SPA navigation and gets the
      // index.html shell so Angular's client-side router can handle it.
      fallback: [
        { source: "/web-vault/:path*", destination: "/web-vault/index.html" },
      ],
    };
  },

  serverExternalPackages: ["@libsql/client"],
};

export default nextConfig;
