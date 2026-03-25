import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      all: true,
      include: ["src/**/*.ts"],
      exclude: [
        "dist/**",
        "src/index.ts",
        "src/**/*.d.ts",
        "src/lib/types.ts",
        "src/lib/constants.ts",
        "**/*.test.ts",
        // Pure barrel re-exports — no executable code of their own
        "src/lib/logging.ts",
        "src/lib/qa-context.ts",
        "src/lib/runtime.ts",
        "src/lib/workspace-tools.ts",
        "src/lib/setup-providers.ts",
        // Pure TypeScript type definitions — no executable statements
        "src/lib/observability/dto.ts",
        "src/providers/provider.ts",
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
});
