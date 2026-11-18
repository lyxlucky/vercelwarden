export function securityHeaders(environment: string | undefined = process.env.NODE_ENV) {
  const scriptSources = environment === "development" ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
  const headers = [
    { key: "Content-Security-Policy", value: [
      "default-src 'self'",
      `script-src ${scriptSources}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // The Blob SDK sends upload requests to vercel.com/api/blob/ and serves
      // blob objects from blob.vercel-storage.com.
      "connect-src 'self' https://vercel.com/api/blob/ https://blob.vercel-storage.com https://*.blob.vercel-storage.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ") },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (environment === "production") {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" });
  }
  return headers;
}
