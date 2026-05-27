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
        // Normal case: settings.json uses absolute paths /api, /identity, /icons —
        // handled by the root-path rewrites above. The rewrites below cover the
        // (rarer) case where the SPA's APP_BASE_HREF is misconfigured and it
        // produces URLs like /web-vault/api/... or /web-vault/identity/...
        { source: "/web-vault/api/:path*", destination: "/api/:path*" },
        { source: "/web-vault/identity/:path*", destination: "/api/identity/:path*" },
        { source: "/web-vault/icons/:path*", destination: "/api/icons/:path*" },
      ],

      afterFiles: [],

      // fallback: runs AFTER everything else (pages, route handlers, static
      // files). Anything still unmatched under /web-vault/ is SPA navigation
      // and gets the index.html shell, letting Angular's client-side router
      // handle it.
      fallback: [
        { source: "/web-vault/:path*", destination: "/web-vault/index.html" },
      ],
    };
  },

  serverExternalPackages: ["@libsql/client"],
};

export default nextConfig;
