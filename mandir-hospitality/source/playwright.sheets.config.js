import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "sheets.spec.js", fullyParallel: true,
  reporter: "list",
  use: { ...devices["iPhone 13"], baseURL: "http://localhost:5175", screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "chromium-sheet", use: { browserName: "chromium" } },
    { name: "webkit-sheet", use: { browserName: "webkit" } },
  ],
  webServer: { command: "VITE_WORKSPACE_API_URL= VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/synthetic-hospitality/exec VITE_DEMO_MODE=false npm run dev -- --host 127.0.0.1 --port 5175 --strictPort", url: "http://localhost:5175", reuseExistingServer: false },
});
