import { createTheme } from "@mui/material/styles";

export const THEME_STORAGE_KEY = "vercelwarden.theme";
export const COLOR_SCHEME_STORAGE_KEY = "vercelwarden.color-scheme";
export const THEME_ATTRIBUTE = "data-theme";

export const theme = createTheme({
  cssVariables: {
    cssVarPrefix: "vw",
    colorSchemeSelector: THEME_ATTRIBUTE,
  },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#0f6b6d", dark: "#084f51", light: "#d8eeee" },
        secondary: { main: "#52606d" },
        error: { main: "#b4232f" },
        warning: { main: "#a65f0b" },
        info: { main: "#2563a8" },
        success: { main: "#267a45" },
        background: { default: "#f4f6f8", paper: "#ffffff" },
        text: { primary: "#17212b", secondary: "#5d6975" },
        divider: "#d6dce2",
      },
    },
    dark: {
      palette: {
        primary: { main: "#57b7b4", dark: "#2b8584", light: "#9edbd8" },
        secondary: { main: "#aab4bd" },
        error: { main: "#ef7d86" },
        warning: { main: "#e2a858" },
        info: { main: "#70a7e4" },
        success: { main: "#6bc38a" },
        background: { default: "#11161b", paper: "#191f25" },
        text: { primary: "#eef2f4", secondary: "#aab4bd" },
        divider: "#35404a",
      },
    },
  },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontSize: "clamp(1.5rem, 2vw, 2rem)", fontWeight: 700, lineHeight: 1.2 },
    h2: { fontSize: "1.25rem", fontWeight: 700, lineHeight: 1.3 },
    button: { fontWeight: 650, textTransform: "none" },
  },
  shape: { borderRadius: 8 },
  spacing: 8,
  components: {
    MuiCssBaseline: {
      styleOverrides: (muiTheme) => ({
        html: { minHeight: "100%", colorScheme: "light" },
        body: {
          minHeight: "100%",
          margin: 0,
          backgroundColor: muiTheme.palette.background.default,
          color: muiTheme.palette.text.primary,
          ...muiTheme.applyStyles("dark", { colorScheme: "dark" }),
        },
        "*:focus-visible": {
          outline: `3px solid ${muiTheme.palette.info.main}`,
          outlineOffset: 2,
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
      styleOverrides: { root: { minHeight: 40, borderRadius: 8 } },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiTextField: { defaultProps: { fullWidth: true, size: "small" } },
    MuiFormControl: { defaultProps: { fullWidth: true, size: "small" } },
    MuiDialog: { defaultProps: { fullWidth: true, maxWidth: "sm" } },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: "1.125rem", fontWeight: 700 } } },
    MuiTooltip: { defaultProps: { arrow: true } },
    MuiLink: { defaultProps: { underline: "hover" } },
    MuiAlert: { styleOverrides: { root: { alignItems: "center" } } },
  },
});
