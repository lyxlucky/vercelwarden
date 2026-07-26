import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Vercelwarden",
    short_name: "Vercelwarden",
    description: "自托管、零知识的密码库客户端。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#7186ff",
    orientation: "any",
    icons: [
      { src: "/pwa/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/pwa/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
      { src: "/pwa/maskable-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
