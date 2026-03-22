import { describe, expect, it } from "vitest";
import { buildThemeBootstrapScript, sanitizeThemePreference, SYNX_THEME_STORAGE_KEY } from "./theme-provider.js";
import { buildSynxThemeCssVariables, synxDesignTokens } from "./theme.js";

describe("lib/ui/theme tokens", () => {
  it("builds root and dark mode css variable maps for mission control", () => {
    const css = buildSynxThemeCssVariables();
    expect(css).toContain(":root {");
    expect(css).toContain('html[data-theme="dark"]');
    expect(css).toContain("--color-bg-base");
    expect(css).toContain("--color-bg-panel");
    expect(css).toContain("--color-bg-card");
    expect(css).toContain("--color-accent-online");
    expect(css).toContain("--color-accent-working");
    expect(css).toContain("--color-accent-review");
    expect(css).toContain("--color-accent-error");
    expect(css).toContain("--radius-sm: 8px;");
    expect(css).toContain("--radius-md: 12px;");
    expect(css).toContain("--space-1: 4px;");
    expect(css).toContain("--space-6: 32px;");
    expect(css).toContain("--font-sans");
    expect(css).toContain("--font-mono");
  });

  it("exposes typed design token scales", () => {
    expect(synxDesignTokens.spacing["space-1"]).toBe("4px");
    expect(synxDesignTokens.radius["radius-sm"]).toBe("8px");
    expect(synxDesignTokens.typography["type-label-size"]).toBe("0.74rem");
    expect(synxDesignTokens.colors.dark["color-bg-base"]).toBe("#070b14");
  });
});

describe("lib/ui/theme provider", () => {
  it("builds no-flicker bootstrap script with storage + system detection", () => {
    const script = buildThemeBootstrapScript();
    expect(script).toContain(SYNX_THEME_STORAGE_KEY);
    expect(script).toContain("matchMedia('(prefers-color-scheme: dark)')");
    expect(script).toContain("data-theme-preference");
    expect(script).toContain("data-theme");
    expect(script).toContain("colorScheme");
  });

  it("sanitizes unknown theme preference to system", () => {
    expect(sanitizeThemePreference("light")).toBe("light");
    expect(sanitizeThemePreference("dark")).toBe("dark");
    expect(sanitizeThemePreference("system")).toBe("system");
    expect(sanitizeThemePreference("unknown")).toBe("system");
    expect(sanitizeThemePreference(undefined)).toBe("system");
  });
});
