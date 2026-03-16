import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "http://localhost:5173",
    specPattern: ["cypress/e2e/**/*.cy.{js,jsx,ts,tsx}", "e2e/**/*.cy.{js,jsx,ts,tsx}"],
    supportFile: "cypress/support/e2e.ts",
    setupNodeEvents() {},
  },
  video: false,
  screenshotOnRunFailure: false,
});
