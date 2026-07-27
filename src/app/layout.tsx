import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { AppProviders } from "@/components/providers/AppProviders";
import { COLOR_SCHEME_STORAGE_KEY, THEME_ATTRIBUTE, THEME_STORAGE_KEY } from "@/components/theme/theme";
import "./globals.css";

// Self-hosted at build time (no runtime requests to Google). Latin glyphs come from
// these faces; CJK falls through to the system stack declared in the theme fontFamily.
// --font-sans   Inter          — body / UI
// --font-display Space Grotesk — headings, wordmark, big figures (engineered grotesque)
// --font-mono   JetBrains Mono — the signature: every secret renders as monospace ledger data
const sans = Inter({ subsets: ["latin"], display: "swap", variable: "--font-sans" });
const display = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-mono" });
const fontVariables = `${sans.variable} ${display.variable} ${mono.variable}`;

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
    { media: "(prefers-color-scheme: light)", color: "#f4f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0e17" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={fontVariables} suppressHydrationWarning>
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
