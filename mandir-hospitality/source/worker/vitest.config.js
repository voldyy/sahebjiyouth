import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./worker/wrangler.jsonc" }, miniflare: { bindings: {
    SYNC_KEY: "synthetic-sync-key",
    APPS_SCRIPT_URL: "https://sheet.test/exec",
    TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
    TWILIO_AUTH_TOKEN: "12345",
    TWILIO_API_KEY: "SK00000000000000000000000000000000",
    TWILIO_API_SECRET: "synthetic-secret",
    TWILIO_WHATSAPP_FROM: "whatsapp:+16105021100",
    MEAL_ARRIVAL_CONTENT_SID: "HX11111111111111111111111111111111",
    MEAL_FASTING_CONTENT_SID: "HX22222222222222222222222222222222",
  } } })],
  test: { include: ["worker/*.test.js"] },
});
