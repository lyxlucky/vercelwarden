import { alpha, createTheme, darken, getContrastRatio, lighten } from "@mui/material/styles";
import {
  DEFAULT_APPEARANCE,
  sanitizeAppearance,
  type AccentPreset,
  type AppearancePreferences,
  type NeutralTone,
} from "@/components/theme/appearance";

export const THEME_STORAGE_KEY = "vercelwarden.theme";
export const COLOR_SCHEME_STORAGE_KEY = "vercelwarden.color-scheme";
export const THEME_ATTRIBUTE = "data-theme";

const accentColors: Record<AccentPreset, { light: string; dark: string }> = {
  indigo: { light: "#5268d4", dark: "#9aa8ff" },
  blue: { light: "#2563c7", dark: "#7eb6ff" },
  cyan: { light: "#087f9c", dark: "#67d4ef" },
  teal: { light: "#087f73", dark: "#5ed8c7" },
  green: { light: "#2f7d4d", dark: "#75d99b" },
  amber: { light: "#a86408", dark: "#f4bd57" },
  rose: { light: "#b54864", dark: "#f29aae" },
};

interface NeutralPalette {
  light: { background: string; paper: string; text: string; secondaryText: string; divider: string; secondary: string };
  dark: { background: string; paper: string; text: string; secondaryText: string; divider: string; secondary: string };
}

const neutralColors: Record<NeutralTone, NeutralPalette> = {
  cool: {
    light: { background: "#f5f7fa", paper: "#ffffff", text: "#172033", secondaryText: "#586477", divider: "#dfe4eb", secondary: "#667085" },
    dark: { background: "#0f141c", paper: "#171d27", text: "#f3f5f8", secondaryText: "#b5bfcc", divider: "#303a49", secondary: "#a8b3c2" },
  },
  neutral: {
    light: { background: "#f7f7f8", paper: "#ffffff", text: "#202124", secondaryText: "#62656a", divider: "#e1e2e5", secondary: "#6b6f76" },
    dark: { background: "#121314", paper: "#1b1c1e", text: "#f4f4f5", secondaryText: "#b9babd", divider: "#383a3e", secondary: "#b0b2b7" },
  },
  warm: {
    light: { background: "#f8f7f5", paper: "#fffefa", text: "#292621", secondaryText: "#686158", divider: "#e6e1da", secondary: "#736b61" },
    dark: { background: "#151311", paper: "#1f1c19", text: "#f6f3ef", secondaryText: "#c2bbb1", divider: "#403a34", secondary: "#b9b0a5" },
  },
};

function ensureAccentContrast(color: string, surface: string, scheme: "light" | "dark") {
  let result = color;
  for (let index = 0; index < 8 && getContrastRatio(result, surface) < 3; index += 1) {
    result = scheme === "dark" ? lighten(result, 0.14) : darken(result, 0.14);
  }
  return result;
}

function primaryColor(appearance: AppearancePreferences, scheme: "light" | "dark", surface: string) {
  if (appearance.accent !== "custom") return accentColors[appearance.accent][scheme];
  const requested = scheme === "dark" ? lighten(appearance.customAccent, 0.26) : appearance.customAccent;
  return ensureAccentContrast(requested, surface, scheme);
}

function primaryPalette(main: string, scheme: "light" | "dark") {
  const contrastText = getContrastRatio(main, "#ffffff") >= 4.5 ? "#ffffff" : "#101318";
  return {
    main,
    dark: scheme === "dark" ? lighten(main, 0.14) : darken(main, 0.18),
    light: scheme === "dark" ? darken(main, 0.68) : lighten(main, 0.82),
    contrastText,
  };
}

const densityTokens = {
  compact: { spacing: 7, controlHeight: 44, smallControlHeight: 34, contentPadding: 16 },
  balanced: { spacing: 8, controlHeight: 48, smallControlHeight: 36, contentPadding: 20 },
  comfortable: { spacing: 9, controlHeight: 52, smallControlHeight: 38, contentPadding: 24 },
} as const;

export function createAppTheme(input: AppearancePreferences = DEFAULT_APPEARANCE) {
  const appearance = sanitizeAppearance(input);
  const neutral = neutralColors[appearance.neutralTone];
  const density = densityTokens[appearance.density];
  const componentRadius = appearance.radius;
  const focusWidth = appearance.contrast === "high" ? 4 : 3;
  const surfaceShadow = appearance.surfaceStyle === "elevated"
    ? "0 8px 24px rgba(15, 23, 42, 0.10), 0 2px 6px rgba(15, 23, 42, 0.06)"
    : appearance.surfaceStyle === "soft"
      ? "0 2px 8px rgba(15, 23, 42, 0.055)"
      : "none";

  return createTheme({
    cssVariables: {
      cssVarPrefix: "vw",
      colorSchemeSelector: THEME_ATTRIBUTE,
    },
    colorSchemes: {
      light: {
        palette: {
          primary: primaryPalette(primaryColor(appearance, "light", neutral.light.paper), "light"),
          secondary: { main: neutral.light.secondary, contrastText: "#ffffff" },
          error: { main: "#c83f49" },
          warning: { main: "#a86408" },
          info: { main: "#2563c7" },
          success: { main: "#2f7d4d" },
          background: { default: neutral.light.background, paper: neutral.light.paper },
          text: {
            primary: neutral.light.text,
            secondary: appearance.contrast === "high" ? darken(neutral.light.secondaryText, 0.16) : neutral.light.secondaryText,
          },
          divider: appearance.contrast === "high" ? darken(neutral.light.divider, 0.18) : neutral.light.divider,
          action: {
            hoverOpacity: appearance.contrast === "high" ? 0.1 : 0.065,
            selectedOpacity: appearance.contrast === "high" ? 0.16 : 0.11,
            disabledOpacity: appearance.contrast === "high" ? 0.5 : 0.42,
          },
        },
      },
      dark: {
        palette: {
          primary: primaryPalette(primaryColor(appearance, "dark", neutral.dark.paper), "dark"),
          secondary: { main: neutral.dark.secondary, contrastText: "#111318" },
          error: { main: "#f08a91" },
          warning: { main: "#f4bd57" },
          info: { main: "#7eb6ff" },
          success: { main: "#75d99b" },
          background: { default: neutral.dark.background, paper: neutral.dark.paper },
          text: {
            primary: neutral.dark.text,
            secondary: appearance.contrast === "high" ? lighten(neutral.dark.secondaryText, 0.12) : neutral.dark.secondaryText,
          },
          divider: appearance.contrast === "high" ? lighten(neutral.dark.divider, 0.16) : neutral.dark.divider,
          action: {
            hoverOpacity: appearance.contrast === "high" ? 0.14 : 0.1,
            selectedOpacity: appearance.contrast === "high" ? 0.22 : 0.16,
            disabledOpacity: appearance.contrast === "high" ? 0.56 : 0.48,
          },
        },
      },
    },
    spacing: density.spacing,
    shape: { borderRadius: componentRadius / 2 },
    // MUI 9 transition components consume this value directly. Application-specific
    // transitions use useReducedMotion for the same persisted + system behavior.
    motion: { reducedMotion: appearance.motion === "reduced" ? "always" : "system" },
    typography: {
      fontFamily: 'Roboto, "Noto Sans SC", "Microsoft YaHei", "Segoe UI", Arial, sans-serif',
      h1: { fontSize: "clamp(1.5rem, 2vw, 2rem)", fontWeight: 720, lineHeight: 1.22, letterSpacing: "-0.018em" },
      h2: { fontSize: "1.25rem", fontWeight: 700, lineHeight: 1.32, letterSpacing: "-0.01em" },
      h6: { fontWeight: 680, lineHeight: 1.35 },
      body1: { lineHeight: 1.62 },
      body2: { lineHeight: 1.55 },
      button: { fontWeight: 650, textTransform: "none", letterSpacing: "0.005em" },
      overline: { fontWeight: 700, letterSpacing: "0.08em" },
    },
    transitions: {
      easing: {
        easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
        easeOut: "cubic-bezier(0, 0, 0.2, 1)",
        easeIn: "cubic-bezier(0.4, 0, 1, 1)",
        sharp: "cubic-bezier(0.4, 0, 0.6, 1)",
      },
      duration: { shortest: 120, shorter: 160, short: 200, standard: 240, complex: 300, enteringScreen: 240, leavingScreen: 180 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: (muiTheme) => ({
          html: {
            minHeight: "100%",
            colorScheme: "light",
            fontSize: `${appearance.fontScale * 100}%`,
            WebkitFontSmoothing: "antialiased",
            textRendering: "optimizeLegibility",
          },
          body: {
            minHeight: "100%",
            margin: 0,
            backgroundColor: muiTheme.palette.background.default,
            color: muiTheme.palette.text.primary,
            ...muiTheme.applyStyles("dark", { colorScheme: "dark" }),
          },
          "::selection": { backgroundColor: alpha(muiTheme.palette.primary.main, 0.24) },
          "html[data-vw-motion='reduced'] *, html[data-vw-motion='reduced'] *::before, html[data-vw-motion='reduced'] *::after": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            scrollBehavior: "auto !important",
            transitionDuration: "0.01ms !important",
          },
          "@media (prefers-reduced-motion: reduce)": {
            "*, *::before, *::after": {
              animationDuration: "0.01ms !important",
              animationIterationCount: "1 !important",
              scrollBehavior: "auto !important",
              transitionDuration: "0.01ms !important",
            },
          },
        }),
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: ({ theme: muiTheme }) => ({
            minHeight: density.controlHeight,
            borderRadius: componentRadius,
            paddingInline: density.contentPadding,
            transition: muiTheme.transitions.create(["background-color", "border-color", "color", "box-shadow"], { duration: muiTheme.transitions.duration.shorter }),
            "@media (pointer: coarse)": { minHeight: 44 },
            "&.Mui-focusVisible": {
              outline: `${focusWidth}px solid ${alpha(muiTheme.palette.primary.main, 0.28)}`,
              outlineOffset: 2,
            },
          }),
          sizeSmall: { minHeight: density.smallControlHeight, paddingInline: Math.max(12, density.contentPadding - 6), "@media (pointer: coarse)": { minHeight: 44 } },
          contained: ({ theme: muiTheme }) => ({
            boxShadow: appearance.surfaceStyle === "elevated" ? `0 2px 6px ${alpha(muiTheme.palette.primary.main, 0.22)}` : "none",
            "&:hover": { boxShadow: appearance.surfaceStyle === "elevated" ? `0 3px 9px ${alpha(muiTheme.palette.primary.main, 0.26)}` : "none" },
          }),
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: ({ theme: muiTheme }) => ({
            borderRadius: componentRadius,
            transition: muiTheme.transitions.create(["background-color", "color", "box-shadow"], { duration: muiTheme.transitions.duration.shorter }),
            "@media (pointer: coarse)": { minWidth: 44, minHeight: 44 },
            "&.Mui-focusVisible": { outline: `${focusWidth}px solid ${alpha(muiTheme.palette.primary.main, 0.28)}`, outlineOffset: 2 },
          }),
        },
      },
      MuiTextField: { defaultProps: { fullWidth: true, variant: "outlined", size: "medium" } },
      MuiFormControl: { defaultProps: { fullWidth: true } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme: muiTheme }) => ({
            borderRadius: componentRadius,
            backgroundColor: muiTheme.palette.background.paper,
            transition: muiTheme.transitions.create(["background-color", "border-color", "box-shadow"], { duration: muiTheme.transitions.duration.shorter }),
            "&:not(.MuiInputBase-multiline)": { minHeight: density.controlHeight },
            "& .MuiOutlinedInput-notchedOutline": { borderColor: muiTheme.palette.divider, transition: muiTheme.transitions.create(["border-color", "border-width"], { duration: muiTheme.transitions.duration.shorter }) },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: alpha(muiTheme.palette.primary.main, 0.72) },
            "&.Mui-focused": { boxShadow: `0 0 0 ${focusWidth}px ${alpha(muiTheme.palette.primary.main, 0.14)}` },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: muiTheme.palette.primary.main, borderWidth: 2 },
            "& input:focus-visible, & textarea:focus-visible, & .MuiSelect-select:focus-visible": { outline: "none", boxShadow: "none" },
            "&.Mui-error": { boxShadow: "none" },
            "&.Mui-disabled": { backgroundColor: muiTheme.palette.action.disabledBackground },
          }),
          input: { paddingBlock: Math.max(12, (density.controlHeight - 24) / 2), paddingInline: 14 },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: ({ theme: muiTheme }) => ({
            color: muiTheme.palette.text.secondary,
            fontWeight: 520,
            "&.Mui-focused": { color: muiTheme.palette.primary.main },
          }),
        },
      },
      MuiFormLabel: { styleOverrides: { root: ({ theme: muiTheme }) => ({ color: muiTheme.palette.text.primary, fontSize: "0.875rem", fontWeight: 620, lineHeight: 1.4, "&.Mui-focused": { color: muiTheme.palette.text.primary } }) } },
      MuiFormHelperText: { styleOverrides: { root: { marginTop: 6, lineHeight: 1.45 } } },
      MuiPaper: {
        styleOverrides: {
          root: ({ theme: muiTheme }) => ({
            backgroundImage: "none",
            transition: muiTheme.transitions.create(["background-color", "border-color", "box-shadow"], { duration: muiTheme.transitions.duration.short }),
          }),
        },
      },
      MuiCard: {
        styleOverrides: {
          root: ({ theme: muiTheme }) => ({
            borderRadius: componentRadius + 2,
            border: appearance.surfaceStyle === "elevated" ? "1px solid transparent" : "1px solid",
            borderColor: appearance.surfaceStyle === "elevated" ? "transparent" : muiTheme.palette.divider,
            boxShadow: surfaceShadow,
            transition: muiTheme.transitions.create(["border-color", "box-shadow", "background-color"], { duration: muiTheme.transitions.duration.short }),
            ...muiTheme.applyStyles("dark", {
              boxShadow: appearance.surfaceStyle === "elevated" ? "0 8px 24px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(0, 0, 0, 0.2)" : appearance.surfaceStyle === "soft" ? "0 2px 8px rgba(0, 0, 0, 0.2)" : "none",
            }),
          }),
        },
      },
      MuiCardHeader: { styleOverrides: { root: { padding: density.contentPadding }, action: { marginTop: 0, alignSelf: "center" } } },
      MuiCardContent: { styleOverrides: { root: { padding: density.contentPadding, "&:last-child": { paddingBottom: density.contentPadding } } } },
      MuiDrawer: {
        styleOverrides: {
          paper: ({ theme: muiTheme }) => ({
            backgroundImage: "none",
            transition: muiTheme.transitions.create(["background-color", "border-color", "box-shadow"], { duration: muiTheme.transitions.duration.short }),
          }),
        },
      },
      MuiDialog: {
        defaultProps: { fullWidth: true, maxWidth: "sm" },
        styleOverrides: {
          paper: ({ theme: muiTheme }) => ({
            borderRadius: Math.min(componentRadius + 6, 22),
            transition: muiTheme.transitions.create(["background-color", "border-color", "box-shadow"], { duration: muiTheme.transitions.duration.short }),
          }),
        },
      },
      MuiDialogTitle: { styleOverrides: { root: { fontSize: "1.125rem", fontWeight: 700 } } },
      MuiDialogActions: { styleOverrides: { root: { gap: density.spacing, padding: density.contentPadding } } },
      MuiMenu: {
        styleOverrides: {
          paper: ({ theme: muiTheme }) => ({
            borderRadius: componentRadius + 2,
            marginTop: 6,
            transition: muiTheme.transitions.create(["background-color", "border-color", "box-shadow"], { duration: muiTheme.transitions.duration.short }),
          }),
          list: { padding: 6 },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: ({ theme: muiTheme }) => ({
            minHeight: density.smallControlHeight,
            borderRadius: Math.max(6, componentRadius - 2),
            transition: muiTheme.transitions.create(["background-color", "color"], { duration: muiTheme.transitions.duration.shorter }),
            "@media (pointer: coarse)": { minHeight: 44 },
            "&.Mui-focusVisible": { outline: `${focusWidth}px solid ${alpha(muiTheme.palette.primary.main, 0.28)}`, outlineOffset: -2 },
          }),
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: ({ theme: muiTheme }) => ({
            borderRadius: componentRadius,
            transition: muiTheme.transitions.create(["background-color", "color", "box-shadow"], { duration: muiTheme.transitions.duration.shorter }),
            "@media (pointer: coarse)": { minHeight: 44 },
            "&.Mui-focusVisible": { outline: `${focusWidth}px solid ${alpha(muiTheme.palette.primary.main, 0.28)}`, outlineOffset: -2 },
          }),
        },
      },
      MuiTooltip: { defaultProps: { arrow: true, enterDelay: 450 }, styleOverrides: { tooltip: { borderRadius: Math.max(6, componentRadius - 2), fontSize: "0.75rem" } } },
      MuiLink: { defaultProps: { underline: "hover" } },
      MuiAlert: {
        styleOverrides: {
          root: ({ theme: muiTheme }) => ({
            alignItems: "center",
            borderRadius: componentRadius + 2,
            transition: muiTheme.transitions.create(["background-color", "border-color", "box-shadow", "opacity", "transform"], { duration: muiTheme.transitions.duration.short }),
          }),
        },
      },
      MuiSnackbarContent: { styleOverrides: { root: { borderRadius: componentRadius + 2 } } },
      MuiChip: { styleOverrides: { root: { borderRadius: Math.max(6, componentRadius - 2), fontWeight: 560 } } },
      MuiToggleButton: { styleOverrides: { root: { minHeight: density.controlHeight, borderRadius: `${componentRadius}px !important`, textTransform: "none", fontWeight: 600 } } },
      MuiSlider: { styleOverrides: { thumb: { width: 18, height: 18 }, valueLabel: { borderRadius: Math.max(6, componentRadius - 2) } } },
      MuiSwitch: { styleOverrides: { root: { marginInline: 2 } } },
      MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: 3 } } },
      MuiSkeleton: { defaultProps: { animation: appearance.motion === "reduced" ? false : "pulse" } },
    },
  });
}

export const theme = createAppTheme(DEFAULT_APPEARANCE);
