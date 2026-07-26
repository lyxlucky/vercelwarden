import type { Metadata, Viewport } from "next";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { AppProviders } from "@/components/providers/AppProviders";
import { COLOR_SCHEME_STORAGE_KEY, THEME_ATTRIBUTE, THEME_STORAGE_KEY } from "@/components/theme/theme";
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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f141c" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <InitColorSchemeScript
          attribute={THEME_ATTRIBUTE}
          defaultMode="system"
          modeStorageKey={THEME_STORAGE_KEY}
          colorSchemeStorageKey={COLOR_SCHEME_STORAGE_KEY}
        />
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <AppProviders>
            <div id="main-content" tabIndex={-1}>{children}</div>
          </AppProviders>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
