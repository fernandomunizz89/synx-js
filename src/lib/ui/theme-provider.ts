import type { SynxThemePreference } from "./theme.js";

export const SYNX_THEME_STORAGE_KEY = "synx-theme-preference";

export function buildThemeBootstrapScript(storageKey = SYNX_THEME_STORAGE_KEY): string {
  const safeStorageKey = JSON.stringify(storageKey);
  return [
    "(function () {",
    "  var root = document.documentElement;",
    "  var preference = 'system';",
    `  var storageKey = ${safeStorageKey};`,
    "  try {",
    "    var stored = window.localStorage ? window.localStorage.getItem(storageKey) : null;",
    "    if (stored === 'light' || stored === 'dark' || stored === 'system') preference = stored;",
    "  } catch (error) {",
    "    // ignore storage access failures",
    "  }",
    "  var resolved = preference;",
    "  if (preference === 'system') {",
    "    try {",
    "      var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;",
    "      resolved = prefersDark ? 'dark' : 'light';",
    "    } catch (error) {",
    "      resolved = 'light';",
    "    }",
    "  }",
    "  if (resolved !== 'light' && resolved !== 'dark') resolved = 'light';",
    "  root.setAttribute('data-theme-preference', preference);",
    "  root.setAttribute('data-theme', resolved);",
    "  root.style.colorScheme = resolved;",
    "})();",
  ].join("\n");
}

export function sanitizeThemePreference(value: string | null | undefined): SynxThemePreference {
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}
