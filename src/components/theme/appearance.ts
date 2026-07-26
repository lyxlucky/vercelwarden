export const ACCENT_PRESETS = ["indigo", "blue", "cyan", "teal", "green", "amber", "rose"] as const;
export const NEUTRAL_TONES = ["cool", "neutral", "warm"] as const;
export const UI_DENSITIES = ["compact", "balanced", "comfortable"] as const;
export const SURFACE_STYLES = ["outlined", "soft", "elevated"] as const;
export const CONTRAST_LEVELS = ["standard", "high"] as const;
export const MOTION_PREFERENCES = ["system", "reduced"] as const;

export type AccentPreset = (typeof ACCENT_PRESETS)[number];
export type AccentPreference = AccentPreset | "custom";
export type NeutralTone = (typeof NEUTRAL_TONES)[number];
export type UiDensity = (typeof UI_DENSITIES)[number];
export type SurfaceStyle = (typeof SURFACE_STYLES)[number];
export type ContrastLevel = (typeof CONTRAST_LEVELS)[number];
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

export interface AppearancePreferences {
  accent: AccentPreference;
  customAccent: string;
  neutralTone: NeutralTone;
  radius: number;
  density: UiDensity;
  fontScale: number;
  surfaceStyle: SurfaceStyle;
  contrast: ContrastLevel;
  motion: MotionPreference;
}

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  accent: "indigo",
  customAccent: "#5268d4",
  neutralTone: "cool",
  radius: 10,
  density: "balanced",
  fontScale: 1,
  surfaceStyle: "soft",
  contrast: "standard",
  motion: "system",
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number, step = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(maximum, Math.max(minimum, value));
  return Number((Math.round(clamped / step) * step).toFixed(4));
}

export function sanitizeAppearance(value: unknown): AppearancePreferences {
  if (!isRecord(value)) return { ...DEFAULT_APPEARANCE };
  const accent = value.accent === "custom" || includes(ACCENT_PRESETS, value.accent)
    ? value.accent
    : DEFAULT_APPEARANCE.accent;
  return {
    accent,
    customAccent: typeof value.customAccent === "string" && HEX_COLOR.test(value.customAccent)
      ? value.customAccent.toLowerCase()
      : DEFAULT_APPEARANCE.customAccent,
    neutralTone: includes(NEUTRAL_TONES, value.neutralTone) ? value.neutralTone : DEFAULT_APPEARANCE.neutralTone,
    radius: clampNumber(value.radius, 4, 16, DEFAULT_APPEARANCE.radius),
    density: includes(UI_DENSITIES, value.density) ? value.density : DEFAULT_APPEARANCE.density,
    fontScale: clampNumber(value.fontScale, 0.9, 1.15, DEFAULT_APPEARANCE.fontScale, 0.05),
    surfaceStyle: includes(SURFACE_STYLES, value.surfaceStyle) ? value.surfaceStyle : DEFAULT_APPEARANCE.surfaceStyle,
    contrast: includes(CONTRAST_LEVELS, value.contrast) ? value.contrast : DEFAULT_APPEARANCE.contrast,
    motion: includes(MOTION_PREFERENCES, value.motion) ? value.motion : DEFAULT_APPEARANCE.motion,
  };
}
