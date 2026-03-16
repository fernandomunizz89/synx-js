import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "dist/**",
        "src/index.ts",
        "src/**/*.d.ts",
        "src/lib/types.ts",
        "src/lib/constants.ts",
        "**/*.test.ts",
      ],
    },
  },
});
