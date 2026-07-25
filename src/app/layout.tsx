import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/primitives";
import { AuthLifecycle } from "@/features/auth/AuthLifecycle";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vercelwarden",
    template: "%s | Vercelwarden",
  },
  description: "A private, self-hosted password vault.",
  applicationName: "Vercelwarden",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#0f766e" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full" suppressHydrationWarning>
      <body><ToastProvider><AuthLifecycle />{children}</ToastProvider></body>
    </html>
  );
}
