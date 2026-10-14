// Real workerd processes, SQLite on disk, and synthetic source data only.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { TABLES } from "../shared/workspace-engine.js";
import { overlayChanges } from "../shared/workspace-sync.js";

const dir = await mkdtemp(join(tmpdir(), "hospitality-sqlite-restart-"));
const admin = "synthetic-restart-admin", syncKey = "synthetic-restart-sync";
const header = Array(32).fill(""); Object.assign(header, { 0: "Registration ID", 8: "Attendee Full Name", 29: "Lodging", 30: "Room No.", 31: "Room Code" });
const row = Array(32).fill(""); Object.assign(row, { 0: "SYNTHETIC-RESTART", 8: "Synthetic Restart", 9: "Self", 12: "2026-10-18", 13: "2026-10-20", 20: "YES" });
let tables = { Attendees: [header, row], ...Object.fromEntries(Object.entries(TABLES).map(([name, columns]) => [name, [columns]])) };
let ack = 0, offline = false, worker, output = "";
const server = createServer(async (request, response) => {
  if (offline) { response.writeHead(503); response.end('{"ok":false}'); return; }
  let body = ""; for await (const chunk of request) body += chunk;
  const req = JSON.parse(body); assert.equal(req.syncKey, syncKey);
  for (const job of req.jobs) { if (job.seq <= ack) continue; tables = overlayChanges(tables, job.changes, true); ack = job.seq; }
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ ok: true, tables, ack, adminDigest: createHash("sha256").update(admin).digest("hex") }));
});
server.listen(0, "127.0.0.1"); await once(server, "listening");
const api = "http://127.0.0.1:8788/api";
const request = async body => (await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessKey: admin, ...body }) })).json();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function start() {
  worker = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "worker/wrangler.jsonc", "--port", "8788", "--persist-to", dir, "--var", `APPS_SCRIPT_URL:http://127.0.0.1:${server.address().port}/exec`, "--var", `SYNC_KEY:${syncKey}`, "--var", "WORKSPACE_ID:synthetic-restart"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  worker.stdout.on("data", chunk => output += chunk); worker.stderr.on("data", chunk => output += chunk);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch("http://127.0.0.1:8788/health")).ok) return; } catch {}
    if (worker.exitCode !== null) throw Error(output);
    await delay(100);
  }
  throw Error("Local Worker did not start: " + output);
}
async function stop() { if (worker && worker.exitCode === null) { worker.kill("SIGINT"); await once(worker, "exit"); } worker = null; }
try {
  await start();
  const initial = await request({ action: "snapshot" }); assert.equal(initial.ok, true, initial.error);
  offline = true;
  const g = initial.guests[0], started = performance.now();
  const saved = await request({ action: "lodging", identity: g.sourceIdentity, expected: g.sourceLodging, stay: { start: "2026-10-18", end: "2026-10-20" }, assignment: { lodging: "Samarpan", roomNo: "204", roomCode: "S204B1" }, requestId: randomUUID() });
  const saveMs = Math.round(performance.now() - started);
  assert.equal(saved.ok, true, saved.error); assert.equal(saved.sync.pending, 1);
  await stop(); await start();
  const restored = await request({ action: "snapshot" });
  assert.equal(restored.guests[0].roomCode, "S204B1"); assert.equal(restored.sync.pending, 1);
  offline = false;
  await request({ action: "sync-wake", syncKey });
  for (let i = 0; i < 100 && tables.Attendees[1][31] !== "S204B1"; i++) await delay(100);
  assert.equal(tables.Attendees[1][31], "S204B1");
  assert.equal((await request({ action: "snapshot" })).sync.pending, 0);
  console.log(JSON.stringify({ passed: true, saveWhileGoogleOfflineMs: saveMs, survivedProcessRestart: true, mirroredAfterRecovery: true }));
} finally {
  await stop(); server.close(); await rm(dir, { recursive: true, force: true });
}
