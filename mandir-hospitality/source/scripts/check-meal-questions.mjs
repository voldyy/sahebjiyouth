import { readFileSync } from "node:fs";

let syncKey = process.env.SYNC_KEY || "";
if (!syncKey) {
  const file = readFileSync(new URL("../worker/.dev.vars.production", import.meta.url), "utf8");
  const value = file.match(/^SYNC_KEY\s*=\s*(.+)$/m)?.[1]?.trim() || "";
  syncKey = value.startsWith('"') ? JSON.parse(value) : value.replace(/^'|'$/g, "");
}
if (!syncKey) throw Error("Configure the private synchronization key before checking meal health.");
const response = await fetch("https://mandir-hospitality-api.usayouth.workers.dev/api", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "meal-health", syncKey }), signal: AbortSignal.timeout(15000),
});
const result = await response.json();
if (!response.ok || !result.ok) throw Error(result.error || "Meal health is unavailable.");
console.log(JSON.stringify(result, null, 2));
