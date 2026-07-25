import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/server/http/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
  async rewrites() {
    return {
      // beforeFiles: rewrites run BEFORE Next checks for static files or
      // route handlers. The API/identity/icons paths must be remapped here
      // because their physical implementations live under /api/*.
      beforeFiles: [
        // === Bitwarden clients use root-path access ===
        { source: "/identity/:path*", destination: "/api/identity/:path*" },
        { source: "/icons/:path*", destination: "/api/icons/:path*" },

      ],

      afterFiles: [],

      fallback: [],
    };
  },

  serverExternalPackages: ["@libsql/client"],
};

export default nextConfig;
