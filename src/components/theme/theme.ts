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
        primary: { main: "#2563eb", dark: "#1d4ed8", light: "#dbeafe", contrastText: "#ffffff" },
        secondary: { main: "#475569", dark: "#334155", light: "#e2e8f0" },
        error: { main: "#dc2626" },
        warning: { main: "#d97706" },
        info: { main: "#2563eb" },
        success: { main: "#15803d" },
        background: { default: "#f6f8fc", paper: "#ffffff" },
        text: { primary: "#0f172a", secondary: "#475569" },
        divider: "#dbe3ef",
      },
    },
    dark: {
      palette: {
        primary: { main: "#60a5fa", dark: "#93c5fd", light: "#172554", contrastText: "#08111f" },
        secondary: { main: "#94a3b8", dark: "#cbd5e1", light: "#1e293b" },
        error: { main: "#f87171" },
        warning: { main: "#fbbf24" },
        info: { main: "#60a5fa" },
        success: { main: "#4ade80" },
        background: { default: "#0b1220", paper: "#111b2e" },
        text: { primary: "#f8fafc", secondary: "#b6c2d2" },
        divider: "#2a3a52",
      },
    },
  },
  typography: {
    fontFamily: 'Roboto, "Noto Sans SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
    h1: { fontSize: "clamp(1.5rem, 2vw, 2rem)", fontWeight: 700, lineHeight: 1.2 },
    h2: { fontSize: "1.25rem", fontWeight: 700, lineHeight: 1.3 },
    button: { fontWeight: 650, textTransform: "none" },
  },
  shape: { borderRadius: 10 },
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
      styleOverrides: {
        root: {
          minHeight: 44,
          borderRadius: 10,
          paddingInline: 18,
          transition: "background-color 180ms ease, border-color 180ms ease, color 180ms ease, box-shadow 180ms ease",
        },
        contained: { boxShadow: "none", "&:hover": { boxShadow: "none" } },
      },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 10 } } },
    MuiTextField: { defaultProps: { fullWidth: true, variant: "outlined" } },
    MuiFormControl: { defaultProps: { fullWidth: true } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme: muiTheme }) => ({
          borderRadius: 10,
          backgroundColor: "#ffffff",
          transition: "background-color 180ms ease, box-shadow 180ms ease",
          "&:not(.MuiInputBase-multiline)": { minHeight: 52 },
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#cbd5e1",
            transition: "border-color 180ms ease, border-width 180ms ease",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#60a5fa" },
          "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.12)" },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#2563eb", borderWidth: 2 },
          "&.Mui-error": { boxShadow: "none" },
          "&.Mui-disabled": { backgroundColor: "#f1f5f9" },
          ...muiTheme.applyStyles("dark", {
            backgroundColor: "#0f1a2d",
            "& .MuiOutlinedInput-notchedOutline": { borderColor: "#3a4b63" },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#60a5fa" },
            "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(96, 165, 250, 0.18)" },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#60a5fa" },
            "&.Mui-disabled": { backgroundColor: "#172033" },
          }),
        }),
        input: { padding: "14px 14px" },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: ({ theme: muiTheme }) => ({
          color: "#64748b",
          fontWeight: 500,
          "&.Mui-focused": { color: "#2563eb" },
          ...muiTheme.applyStyles("dark", {
            color: "#94a3b8",
            "&.Mui-focused": { color: "#60a5fa" },
          }),
        }),
      },
    },
    MuiFormHelperText: {
      styleOverrides: { root: { marginTop: 6, lineHeight: 1.45 } },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: "none" } },
    },
    MuiDialog: { defaultProps: { fullWidth: true, maxWidth: "sm" } },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: "1.125rem", fontWeight: 700 } } },
    MuiTooltip: { defaultProps: { arrow: true } },
    MuiLink: { defaultProps: { underline: "hover" } },
    MuiAlert: { styleOverrides: { root: { alignItems: "center", borderRadius: 10 } } },
  },
});
