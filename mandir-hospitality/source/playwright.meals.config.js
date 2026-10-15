import { defineConfig } from "@playwright/test";
import databaseConfig from "./playwright.database.config.js";

export default defineConfig(databaseConfig, {
  testMatch: "meal-ui.spec.js",
  outputDir: "test-results/meal-ui",
  use: { baseURL: "http://localhost:5178" },
  webServer: {
    command: "VITE_WORKSPACE_API_URL=https://database.test/api VITE_DEMO_MODE=false npm run dev -- --host 127.0.0.1 --port 5178 --strictPort",
    url: "http://localhost:5178",
    reuseExistingServer: false,
  },
});
