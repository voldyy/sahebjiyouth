import { DurableObject } from "cloudflare:workers";
import { TABLES, createWorkspaceEngine } from "../shared/workspace-engine.js";
import { tabularWorkspace } from "../shared/tabular-workspace.js";
import { changesBetween, overlayChanges, same } from "../shared/workspace-sync.js";

const engine = createWorkspaceEngine({ uuid: () => crypto.randomUUID(), today: () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), flush: () => {} });
const encoder = new TextEncoder();
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))), b => b.toString(16).padStart(2, "0")).join("");
async function matchesDigest(value, expected) {
  const actual = await digest(value || "");
  return crypto.subtle.timingSafeEqual(encoder.encode(actual), encoder.encode(expected || "0".repeat(64)));
}
const mutating = new Set(["lodging", "transport", "resource", "linen", "offsite", "guest", "trip-display"]);
const allowedOrigins = new Set(["https://www.sahebjiyouth.org", "https://sahebjiyouth.org", "http://localhost:5174", "http://127.0.0.1:5174", "http://localhost:5175", "http://127.0.0.1:5175"]);
const noHistory = tables => Object.fromEntries(Object.entries(tables).filter(([name]) => name !== "Assignment History"));
const fail = message => ({ ok: false, error: message });

async function boundedJson(request, max) {
  const reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new Error("Request is too large."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const headers = { "Cache-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff" };
    if (origin && !allowedOrigins.has(origin)) return Response.json(fail("Origin not allowed."), { status: 403, headers });
    if (origin) Object.assign(headers, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Max-Age": "86400" });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname;
    if (path === "/health") return Response.json({ ok: true, service: "Mandir Hospitality SQLite", version: 1 }, { headers });
    if (path !== "/api" || !["GET", "POST"].includes(request.method)) return Response.json(fail("Not found."), { status: 404, headers });
    try {
      const req = request.method === "GET" ? { action: "snapshot" } : await boundedJson(request, 16000);
      // The event is the coordination boundary: all room reservations must see
      // one consistent inventory, including moves between rooms and hotels.
      const stub = env.WORKSPACES.getByName(env.WORKSPACE_ID);
      const result = await stub.request(req);
      return Response.json(result, { status: result.ok ? 200 : 400, headers });
    } catch (_) {
      console.error(JSON.stringify({ event: "workspace_request_failed" }));
      return Response.json(fail("The dashboard service is unavailable. Please retry; saved changes are retained."), { status: 503, headers });
    }
  },
};

export class HospitalityWorkspace extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.tables = null;
    this.syncing = null;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS records (table_name TEXT NOT NULL, position INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(table_name, position));
        CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, changes TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, changes TEXT NOT NULL, created_at TEXT NOT NULL);
      `);
      if (!this.meta("stream")) this.putMeta("stream", crypto.randomUUID());
    });
  }
  meta(key, fallback = "") { return this.ctx.storage.sql.exec("SELECT value FROM metadata WHERE key = ?", key).toArray()[0]?.value ?? fallback; }
  putMeta(key, value) { this.ctx.storage.sql.exec("INSERT INTO metadata(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, String(value)); }
  load() {
    if (!this.tables) {
      this.tables = {};
      for (const row of this.ctx.storage.sql.exec("SELECT table_name, position, data FROM records ORDER BY table_name,position")) (this.tables[row.table_name] ||= [])[row.position] = JSON.parse(row.data);
    }
    return this.tables;
  }
  persist(tables) {
    const before = this.load();
    for (const [name, rows] of Object.entries(noHistory(tables))) {
      rows.forEach((row, position) => {
        if (!same(row, before[name]?.[position])) this.ctx.storage.sql.exec("INSERT INTO records(table_name,position,data) VALUES (?,?,?) ON CONFLICT(table_name,position) DO UPDATE SET data=excluded.data", name, position, JSON.stringify(row));
      });
      if ((before[name]?.length || 0) > rows.length) this.ctx.storage.sql.exec("DELETE FROM records WHERE table_name=? AND position>=?", name, rows.length);
    }
  }
  pending() { return this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM outbox").one().count; }
  syncState() {
    return { pending: this.pending(), lastSyncedAt: this.meta("lastSyncedAt") || null, error: this.meta("syncError"), source: "sqlite" };
  }
  result(role) {
    const book = tabularWorkspace({ ...this.load(), "Assignment History": [TABLES["Assignment History"]] });
    const snapshot = engine.snapshot(book, "viewer");
    return { ok: true, ...snapshot, role, ...(role === "admin" ? { rows: book.data.Attendees } : {}), revision: this.meta("revision", "0"), sync: this.syncState() };
  }
  async persistHousekeeping() {
    const prepare = () => {
      const before = this.load();
      const book = tabularWorkspace(before);
      engine.housekeeping(book, engine.roster(book).guests);
      return { book, changes: changesBetween(before, book.data) };
    };
    if (!prepare().changes.length) return;
    await this.schedule();
    // Scheduling yields: re-read the current state before the atomic commit.
    const { book, changes } = prepare();
    if (!changes.length) return;
    this.ctx.storage.transactionSync(() => {
      this.persist(book.data);
      this.ctx.storage.sql.exec("INSERT INTO outbox(changes,created_at) VALUES (?,?)", JSON.stringify(changes), new Date().toISOString());
      this.putMeta("revision", Number(this.meta("revision", "0")) + 1);
    });
    this.tables = noHistory(book.data);
  }
  async schedule(delay = 1000) {
    const due = Date.now() + delay;
    const existing = await this.ctx.storage.getAlarm();
    if (!existing || due < existing) await this.ctx.storage.setAlarm(due);
  }
  async remote(payload) {
    if (!this.env.SYNC_KEY) throw new Error("Sheet synchronization is not configured.");
    const response = await fetch(this.env.APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, syncKey: this.env.SYNC_KEY }), signal: AbortSignal.timeout(25000) });
    const result = await boundedJson(response, 4 * 1024 * 1024);
    if (!response.ok || !result.ok) throw new Error(result.error || "Google Sheets did not confirm synchronization.");
    return result;
  }
  async request(req) {
    try {
      if (!req || JSON.stringify(req).length > 16000) throw new Error("Invalid request.");
      if (req.action === "sync-wake") {
        if (!await matchesDigest(req.syncKey, await digest(this.env.SYNC_KEY || crypto.randomUUID()))) throw new Error("Synchronization authorization required.");
        await this.schedule(100);
        return { ok: true };
      }
      if (!this.meta("initialized")) {
        await this.synchronize();
        if (!this.meta("initialized")) throw new Error("The database is being connected to the roster. Please retry shortly.");
      }
      const role = await matchesDigest(req.accessKey, this.meta("adminDigest")) ? "admin" : "viewer";
      if (req.action === "snapshot") {
        // Preserve the original admin-snapshot behavior: due linen tasks become
        // durable before a subsequent assignment clear or direct source edit.
        // Viewer snapshots continue to derive them without writing anything.
        if (role === "admin") await this.persistHousekeeping();
        return this.result(role);
      }
      if (req.action === "trip-display-read") return { ok: true, tripDisplay: this.result(role).tripDisplay };
      if (req.action === "notification-authorize") return { ok: true, authorized: role === "admin" };
      if (["flight", "accommodation-notifications"].includes(req.action)) {
        if (req.action === "accommodation-notifications") {
          if (role !== "admin") throw new Error("Admin access is required.");
          await this.synchronize();
          if (this.pending()) throw new Error("Wait for Sheet synchronization before sending accommodation messages.");
        }
        return await this.remote({ action: "database-service", request: req });
      }
      if (!mutating.has(req.action)) throw new Error("Unknown action.");
      if (role !== "admin" && req.action !== "trip-display") throw new Error("Admin access is required to change this view-only dashboard. Open your private admin link.");
      if (!/^[a-zA-Z0-9-]{20,80}$/.test(req.requestId || "")) throw new Error("Missing request identifier.");
      const { accessKey, ...safeRequest } = req;
      const fingerprint = await digest(JSON.stringify(safeRequest));
      // Schedule first. A crash cannot leave a committed outbox without a wake-up.
      await this.schedule();
      const previous = this.ctx.storage.sql.exec("SELECT fingerprint FROM receipts WHERE id=?", req.requestId).toArray()[0];
      if (previous && previous.fingerprint !== fingerprint) throw new Error("This request identifier was already used for another change.");
      if (!previous) {
        const before = { ...this.load(), "Assignment History": [TABLES["Assignment History"]] };
        const book = tabularWorkspace(before);
        engine.mutate(book, req);
        const changes = changesBetween(before, book.data);
        const now = new Date().toISOString();
        this.ctx.storage.transactionSync(() => {
          this.persist(book.data);
          if (changes.length) this.ctx.storage.sql.exec("INSERT INTO outbox(changes,created_at) VALUES (?,?)", JSON.stringify(changes), now);
          this.ctx.storage.sql.exec("INSERT INTO receipts(id,fingerprint,changes,created_at) VALUES (?,?,?,?)", req.requestId, fingerprint, JSON.stringify(changes), now);
          this.putMeta("revision", Number(this.meta("revision", "0")) + 1);
        });
        this.tables = noHistory(book.data);
      }
      return req.action === "trip-display" ? { ok: true, tripDisplay: this.result(role).tripDisplay } : this.result(role);
    } catch (error) { return fail(error.message); }
  }
  async synchronize() {
    if (this.syncing) return this.syncing;
    this.syncing = this.exchange();
    try { await this.syncing; } finally { this.syncing = null; }
  }
  async exchange() {
    // Never hold a concurrency gate across Google I/O. Dashboard saves continue
    // while this snapshot is being mirrored, and are overlaid after its reply.
    const jobs = this.ctx.storage.sql.exec("SELECT seq,changes FROM outbox ORDER BY seq LIMIT 20").toArray().map(row => ({ seq: row.seq, changes: JSON.parse(row.changes) }));
    try {
      const response = await this.remote({ action: "database-sync", stream: this.meta("stream"), jobs });
      if (!response.tables?.Attendees?.[0] || !/^[a-f0-9]{64}$/.test(response.adminDigest || "")) throw new Error("Invalid synchronization response.");
      const ack = Number(response.ack || 0);
      if (jobs.length && ack < jobs.at(-1).seq) throw new Error("The sheet has not acknowledged all saved changes.");
      const remaining = this.ctx.storage.sql.exec("SELECT changes FROM outbox WHERE seq>? ORDER BY seq", ack).toArray().flatMap(row => JSON.parse(row.changes));
      const next = noHistory(overlayChanges(response.tables, remaining));
      this.ctx.storage.transactionSync(() => {
        const changed = !same(this.load(), next);
        this.persist(next);
        this.ctx.storage.sql.exec("DELETE FROM outbox WHERE seq<=?", ack);
        this.putMeta("initialized", "yes");
        this.putMeta("adminDigest", response.adminDigest);
        this.putMeta("lastSyncedAt", new Date().toISOString());
        this.putMeta("syncError", "");
        if (changed) this.putMeta("revision", Number(this.meta("revision", "0")) + 1);
      });
      this.tables = next;
    } catch (error) {
      // Outbox entries and the last valid database state survive Google failures.
      this.putMeta("syncError", error.message.includes("conflict") || error.message.includes("removed") ? error.message : "Google Sheets is temporarily unavailable. Database changes are saved and will retry.");
      console.warn(JSON.stringify({ event: "sheet_sync_deferred", pending: this.pending() }));
    } finally {
      await this.schedule(this.pending() && !this.meta("syncError") ? 1000 : 60000);
    }
  }
  async alarm() { await this.synchronize(); }
}
