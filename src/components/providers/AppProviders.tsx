"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CssBaseline } from "@mui/material";
import { ThemeProvider, useColorScheme } from "@mui/material/styles";
import { AuthLifecycle } from "@/features/auth/AuthLifecycle";
import { DEFAULT_APPEARANCE, type AppearancePreferences } from "@/components/theme/appearance";
import { loadPreferences, PREFERENCES_CHANGED_EVENT, type ClientPreferences } from "@/lib/client/state/preferences";
import { COLOR_SCHEME_STORAGE_KEY, createAppTheme, THEME_STORAGE_KEY } from "@/components/theme/theme";
import { SkipLink } from "@/components/ui/SkipLink";
import { ToastProvider } from "@/components/ui/ToastProvider";

function PreferenceIntegration({ onAppearanceChange }: { onAppearanceChange: (appearance: AppearancePreferences) => void }) {
  const { setMode } = useColorScheme();
  useEffect(() => {
    const apply = (preferences: ClientPreferences) => {
      setMode(preferences.theme);
      document.documentElement.lang = preferences.locale;
      document.documentElement.dataset.vwMotion = preferences.appearance.motion;
      document.documentElement.dataset.vwDensity = preferences.appearance.density;
      onAppearanceChange(preferences.appearance);
    };
    apply(loadPreferences());
    const onChange = (event: Event) => apply((event as CustomEvent<ClientPreferences>).detail);
    window.addEventListener(PREFERENCES_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PREFERENCES_CHANGED_EVENT, onChange);
  }, [onAppearanceChange, setMode]);
  return null;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<AppearancePreferences>(DEFAULT_APPEARANCE);
  const handleAppearanceChange = useCallback((next: AppearancePreferences) => setAppearance(next), []);
  const dynamicTheme = useMemo(() => createAppTheme(appearance), [appearance]);

  return (
    <ThemeProvider
      theme={dynamicTheme}
      defaultMode="system"
      modeStorageKey={THEME_STORAGE_KEY}
      colorSchemeStorageKey={COLOR_SCHEME_STORAGE_KEY}
      disableTransitionOnChange
      noSsr
    >
      <CssBaseline />
      <PreferenceIntegration onAppearanceChange={handleAppearanceChange} />
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
