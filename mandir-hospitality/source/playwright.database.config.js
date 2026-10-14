import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "database-ui.spec.js", fullyParallel: true, outputDir: "test-results/database-ui",
  reporter: "list",
  use: { ...devices["iPhone 13"], baseURL: "http://localhost:5176", screenshot: "only-on-failure" },
  projects: [{ name: "chromium-database", use: { browserName: "chromium" } }, { name: "webkit-database", use: { browserName: "webkit" } }],
  webServer: { command: "VITE_WORKSPACE_API_URL=https://database.test/api VITE_DEMO_MODE=false npm run dev -- --host 127.0.0.1 --port 5176 --strictPort", url: "http://localhost:5176", reuseExistingServer: false },
});
