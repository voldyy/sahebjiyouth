import { defineConfig, devices } from "@playwright/test";
// The local-meals form is a static page; its tests serve it from a fake origin and mock the Worker API.
export default defineConfig({
  testDir: "./tests", testMatch: "local-meals-form.spec.js", reporter: "list",
  use: { ...devices["iPhone 13"], screenshot: "only-on-failure" },
  projects: [{ name: "chromium-form", use: { browserName: "chromium" } }, { name: "webkit-form", use: { browserName: "webkit" } }],
});
