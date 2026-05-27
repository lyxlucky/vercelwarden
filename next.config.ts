import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Web Vault is a SPA in public/web-vault/
  // Next.js serves public/ files automatically
  // No special config needed for static files

  serverExternalPackages: ["@libsql/client"],
};

export default nextConfig;
