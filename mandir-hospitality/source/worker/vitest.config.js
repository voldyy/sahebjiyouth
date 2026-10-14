import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./worker/wrangler.jsonc" }, miniflare: { bindings: { SYNC_KEY: "synthetic-sync-key", APPS_SCRIPT_URL: "https://sheet.test/exec" } } })],
  test: { include: ["worker/*.test.js"] },
});
