export type SynxResolvedTheme = "light" | "dark";
export type SynxThemePreference = SynxResolvedTheme | "system";

type CssVariableMap = Readonly<Record<string, string>>;

const sharedColorTokens = {
  "synx-cyan": "#4cf7ff",
  "synx-magenta": "#b581ff",
  "synx-purple-soft": "#d3b8ff",
  "color-accent-online": "#2af5b1",
  "color-accent-working": "#3ea6ff",
  "color-accent-review": "#be93ff",
  "color-accent-attention": "#ffbe55",
  "color-accent-error": "#ff6278",
} as const satisfies CssVariableMap;

const lightThemeTokens = {
  "color-bg-base": "#edf2fb",
  "color-bg-panel": "#f5f8ff",
  "color-bg-card": "#ffffff",
  "color-stroke-subtle": "rgba(24, 44, 72, 0.16)",
  "color-text-primary": "#101b2d",
  "color-text-secondary": "#4a5e79",
  bg: "#edf2fb",
  "bg-elev": "#e4ebf7",
  "bg-glow-left": "rgba(80, 126, 230, 0.12)",
  "bg-glow-right": "rgba(135, 92, 216, 0.12)",
  panel: "#f5f8ff",
  fg: "#101b2d",
  accent: "#0f9e70",
  "accent-soft": "#d8f5ea",
  card: "#ffffff",
  surface: "#ffffff",
  "surface-soft": "#f4f8ff",
  "surface-strong": "#ffffff",
  muted: "#4a5e79",
  danger: "#c2304c",
  border: "rgba(24, 44, 72, 0.16)",
  focus: "#2f78f6",
  shadow: "0 2px 10px rgba(14, 29, 50, 0.08)",
  "title-gradient": "linear-gradient(90deg, var(--synx-cyan) 0%, var(--synx-magenta) 100%)",
  "status-neutral-bg": "#e4ecfb",
  "status-neutral-fg": "#193555",
  "status-waiting-bg": "#fff1d8",
  "status-waiting-fg": "#6f4a00",
  "status-failed-bg": "#ffe3e8",
  "status-failed-fg": "#7d1d2e",
  "status-done-bg": "#d9f7ec",
  "status-done-fg": "#0f5a42",
  "status-progress-bg": "#e4efff",
  "status-progress-fg": "#18458d",
  "pill-runtime-bg": "#e4efff",
  "pill-runtime-fg": "#18458d",
  "pill-task-bg": "#d9f7ec",
  "pill-task-fg": "#0f5a42",
  "pill-review-bg": "#fff1d8",
  "pill-review-fg": "#6f4a00",
  "pill-metrics-bg": "#e4ecfb",
  "pill-metrics-fg": "#193555",
} as const satisfies CssVariableMap;

const darkThemeTokens = {
  "color-bg-base": "#070b14",
  "color-bg-panel": "#0d1422",
  "color-bg-card": "#111b2e",
  "color-stroke-subtle": "rgba(152, 176, 214, 0.22)",
  "color-text-primary": "#e6efff",
  "color-text-secondary": "#9eb3d1",
  bg: "#070b14",
  "bg-elev": "#0d1422",
  "bg-glow-left": "rgba(29, 92, 255, 0.18)",
  "bg-glow-right": "rgba(122, 72, 255, 0.16)",
  panel: "#0d1422",
  fg: "#e6efff",
  accent: "#2af5b1",
  "accent-soft": "rgba(42, 245, 177, 0.16)",
  card: "#101a2b",
  surface: "#131f33",
  "surface-soft": "#18253c",
  "surface-strong": "#1e2c45",
  muted: "#9eb3d1",
  danger: "#ff6278",
  border: "rgba(152, 176, 214, 0.22)",
  focus: "#69b4ff",
  shadow: "0 2px 10px rgba(2, 7, 17, 0.48)",
  "title-gradient": "linear-gradient(90deg, var(--synx-cyan) 0%, var(--synx-magenta) 100%)",
  "status-neutral-bg": "#16253a",
  "status-neutral-fg": "#bfd3ee",
  "status-waiting-bg": "#3a2a12",
  "status-waiting-fg": "#ffc977",
  "status-failed-bg": "#471927",
  "status-failed-fg": "#ff9bad",
  "status-done-bg": "#12382d",
  "status-done-fg": "#8ef4cc",
  "status-progress-bg": "#113355",
  "status-progress-fg": "#9fcbff",
  "pill-runtime-bg": "#113355",
  "pill-runtime-fg": "#9fcbff",
  "pill-task-bg": "#12382d",
  "pill-task-fg": "#8ef4cc",
  "pill-review-bg": "#3a2a12",
  "pill-review-fg": "#ffc977",
  "pill-metrics-bg": "#16253a",
  "pill-metrics-fg": "#bfd3ee",
} as const satisfies CssVariableMap;

const typographyTokens = {
  "font-sans": '"Inter", "Geist", "IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
  "font-mono": '"JetBrains Mono", "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
  "type-label-size": "0.74rem",
  "type-label-weight": "700",
  "type-label-line": "1.3",
  "type-body-size": "0.94rem",
  "type-body-weight": "500",
  "type-body-line": "1.5",
  "type-value-size": "clamp(1.2rem, 2vw, 1.8rem)",
  "type-value-weight": "700",
  "type-value-line": "1.2",
} as const satisfies CssVariableMap;

const radiusTokens = {
  "radius-sm": "8px",
  "radius-md": "12px",
  "radius-lg": "16px",
  "radius-pill": "999px",
} as const satisfies CssVariableMap;

const spacingTokens = {
  "space-1": "4px",
  "space-2": "8px",
  "space-3": "12px",
  "space-4": "16px",
  "space-5": "24px",
  "space-6": "32px",
} as const satisfies CssVariableMap;

const elevationTokens = {
  "shadow-soft": "0 2px 10px rgba(14, 29, 50, 0.08)",
  "shadow-none": "none",
} as const satisfies CssVariableMap;

const themeByMode = {
  light: lightThemeTokens,
  dark: darkThemeTokens,
} as const satisfies Record<SynxResolvedTheme, CssVariableMap>;

export const synxDesignTokens = {
  colors: {
    shared: sharedColorTokens,
    light: lightThemeTokens,
    dark: darkThemeTokens,
  },
  typography: typographyTokens,
  radius: radiusTokens,
  spacing: spacingTokens,
  elevation: elevationTokens,
} as const;

function toCssVariables(tokens: CssVariableMap): string {
  return Object.entries(tokens)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join("\n");
}

export function buildSynxThemeCssVariables(): string {
  return [
    ":root {",
    "  color-scheme: light;",
    toCssVariables(sharedColorTokens),
    toCssVariables(typographyTokens),
    toCssVariables(radiusTokens),
    toCssVariables(spacingTokens),
    toCssVariables(elevationTokens),
    toCssVariables(themeByMode.light),
    "}",
    'html[data-theme="dark"] {',
    "  color-scheme: dark;",
    toCssVariables(themeByMode.dark),
    "}",
    'html[data-theme="light"] {',
    "  color-scheme: light;",
    "}",
  ].join("\n");
}
