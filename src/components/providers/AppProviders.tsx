"use client";

import { useEffect, type ReactNode } from "react";
import { CssBaseline } from "@mui/material";
import { ThemeProvider, useColorScheme } from "@mui/material/styles";
import { AuthLifecycle } from "@/features/auth/AuthLifecycle";
import { loadPreferences, PREFERENCES_CHANGED_EVENT, type ClientPreferences } from "@/lib/client/state/preferences";
import { COLOR_SCHEME_STORAGE_KEY, THEME_STORAGE_KEY, theme } from "@/components/theme/theme";
import { SkipLink } from "@/components/ui/SkipLink";
import { ToastProvider } from "@/components/ui/ToastProvider";

function PreferenceIntegration() {
  const { setMode } = useColorScheme();
  useEffect(() => {
    const apply = (preferences: ClientPreferences) => {
      setMode(preferences.theme);
      document.documentElement.lang = preferences.locale;
    };
    apply(loadPreferences());
    const onChange = (event: Event) => apply((event as CustomEvent<ClientPreferences>).detail);
    window.addEventListener(PREFERENCES_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PREFERENCES_CHANGED_EVENT, onChange);
  }, [setMode]);
  return null;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      theme={theme}
      defaultMode="system"
      modeStorageKey={THEME_STORAGE_KEY}
      colorSchemeStorageKey={COLOR_SCHEME_STORAGE_KEY}
      disableTransitionOnChange
      noSsr
    >
      <CssBaseline />
      <PreferenceIntegration />
      {children}
    </ThemeProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppThemeProvider>
      <ToastProvider>
        <SkipLink />
        <AuthLifecycle />
        {children}
      </ToastProvider>
    </AppThemeProvider>
  );
}
