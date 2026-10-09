import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "sheets.spec.js", fullyParallel: true,
  reporter: "list",
  use: { ...devices["iPhone 13"], baseURL: "http://localhost:5174", screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "chromium-sheet", use: { browserName: "chromium" } },
    { name: "webkit-sheet", use: { browserName: "webkit" } },
  ],
  webServer: { command: "VITE_DEMO_MODE=false npm run dev -- --host 127.0.0.1 --port 5174 --strictPort", url: "http://localhost:5174", reuseExistingServer: false },
});
