import { DurableObject } from "cloudflare:workers";
import { TABLES, createWorkspaceEngine } from "../shared/workspace-engine.js";
import { tabularWorkspace } from "../shared/tabular-workspace.js";
import { changesBetween, overlayChanges, same } from "../shared/workspace-sync.js";
import { createMealState } from "./meal-state.js";
import { createMealSurvey } from "./meal-survey.js";
import { createLocalMeals } from "./local-meals.js";
import { verifyTwilioSignature, signTwilioRequest } from "./twilio-webhook.js";
import { withLodgingNotices } from "../src/lib/lodgingNotifications.js";

const engine = createWorkspaceEngine({ uuid: () => crypto.randomUUID(), today: () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), flush: () => {} });
const encoder = new TextEncoder();
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))), b => b.toString(16).padStart(2, "0")).join("");
async function matchesDigest(value, expected) {
  const actual = await digest(value || "");
  return crypto.subtle.timingSafeEqual(encoder.encode(actual), encoder.encode(expected || "0".repeat(64)));
}
const mutating = new Set(["lodging", "transport", "resource", "linen", "offsite", "guest", "trip-display"]);
const allowedOrigins = new Set(["https://www.sahebjiyouth.org", "https://sahebjiyouth.org", "http://localhost:5174", "http://127.0.0.1:5174", "http://localhost:5175", "http://127.0.0.1:5175",
  // Local mandal meals form (anoopam.us) and its Azure Front Door address.
  "https://www.anoopam.us", "https://anoopam.us", "https://events.anoopam.us", "https://anoopam-events-adgphqgpcjgmcubv.z01.azurefd.net"]);
const noHistory = tables => Object.fromEntries(Object.entries(tables).filter(([name]) => name !== "Assignment History"));
const fail = message => ({ ok: false, error: message });
const mealActions = new Set(["meal-override", "meal-plan", "meal-settings"]);
const surveyConfigured = env => /^HX[0-9a-f]{32}$/i.test(env.MEAL_ARRIVAL_CONTENT_SID || "") && /^HX[0-9a-f]{32}$/i.test(env.MEAL_FASTING_CONTENT_SID || "") && !!env.TWILIO_AUTH_TOKEN && !!env.TWILIO_API_KEY && !!env.TWILIO_API_SECRET && env.TWILIO_WHATSAPP_FROM === "whatsapp:+16105021100";

async function boundedText(request, max) {
  const reader = request.body?.getReader();
  if (!reader) return "";
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
  return new TextDecoder().decode(bytes);
}
async function boundedJson(request, max) { return JSON.parse(await boundedText(request, max) || "{}"); }

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const headers = { "Cache-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff" };
    if (origin && !allowedOrigins.has(origin)) return Response.json(fail("Origin not allowed."), { status: 403, headers });
    if (origin) Object.assign(headers, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Max-Age": "86400" });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname;
    if (path === "/health") return Response.json({ ok: true, service: "Mandir Hospitality SQLite", version: 2, release: "hotel-room-slots" }, { headers });
    if (path === "/twilio/whatsapp" && request.method === "POST") {
      try {
        if (!request.headers.get("Content-Type")?.startsWith("application/x-www-form-urlencoded")) return new Response("Form data required", { status: 415, headers });
        const body = await boundedText(request, 16000), params = new URLSearchParams(body);
        if (!await verifyTwilioSignature(request.url, params, request.headers.get("X-Twilio-Signature"), env.TWILIO_AUTH_TOKEN)) return new Response("Invalid signature", { status: 403, headers });
        let mealFailed = false;
        try { await env.WORKSPACES.getByName(env.WORKSPACE_ID).mealReply(Object.fromEntries(params)); }
        catch (_) { mealFailed = true; console.error(JSON.stringify({ event: "meal_reply_storage_failed" })); }
        // Keep the existing Chatwoot inbox, including the visible button reply.
        // Its signature is recalculated for its own exact webhook URL.
        const forwardUrl = "https://app.chatwoot.com/twilio/callback";
        const response = await fetch(forwardUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": await signTwilioRequest(forwardUrl, params, env.TWILIO_AUTH_TOKEN) }, body, signal: AbortSignal.timeout(10000), redirect: "manual" });
        if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); return new Response("Inbox redirect rejected", { status: 502, headers }); }
        // A meal failure must not prevent delivery to the existing inbox.
        // Signal the error after forwarding so Twilio can retry the same SID.
        if (mealFailed) { await response.body?.cancel(); return new Response("Meal reply recording unavailable", { status: 503, headers }); }
        return new Response(response.body, { status: response.status, headers: { ...headers, "Content-Type": response.headers.get("Content-Type") || "text/xml" } });
      } catch (_) {
        console.error(JSON.stringify({ event: "meal_reply_failed" }));
        return new Response("Reply processing unavailable", { status: 503, headers });
      }
    }
    if (path !== "/api" || !["GET", "POST"].includes(request.method)) return Response.json(fail("Not found."), { status: 404, headers });
    try {
      const req = request.method === "GET" ? { action: "snapshot" } : await boundedJson(request, 16000);
      // Public form actions are rate limited per visitor; the visitor key is always set here, never taken from the body.
      if (String(req?.action).startsWith("local-meals-")) req.client = await digest(`client:${request.headers.get("CF-Connecting-IP") || ""}`);
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
        CREATE TABLE IF NOT EXISTS meal_records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));
      `);
      if (!this.meta("stream")) this.putMeta("stream", crypto.randomUUID());
    });
    this.meals = createMealState({ sql: ctx.storage.sql, bumpRevision: () => this.putMeta("revision", Number(this.meta("revision", "0")) + 1), configured: () => surveyConfigured(this.env), automaticDefault: this.env.MEAL_AUTOMATIC_QUESTIONS === "true", extraGuests: () => this.localMeals.diners() });
    this.localMeals = createLocalMeals({ get: this.meals.get, put: this.meals.put, remove: this.meals.remove, records: this.meals.records,
      bumpRevision: () => this.putMeta("revision", Number(this.meta("revision", "0")) + 1), secret: () => this.env.SYNC_KEY,
      today: () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) });
    this.survey = createMealSurvey({ env, getGuests: () => engine.roster(tabularWorkspace(this.load())).guests,
      getSettings: () => ({ ...this.meals.settings(), automaticQuestionsEnabled: this.meals.settings().automaticQuestionsEnabled && surveyConfigured(this.env) && Date.now() - Date.parse(this.meta("lastSyncedAt")) < 10 * 60000 }),
      records: this.meals.records, get: this.meals.get, put: this.meals.put,
      transaction: callback => this.ctx.storage.transactionSync(callback), saveAnswer: this.meals.saveAnswer, schedule: () => this.schedule(), now: () => new Date() });
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
    const notices = JSON.parse(this.meta("lodgingNotices", "[]"));
    return { ok: true, ...snapshot, capabilities: { childBedSharing: true, multipleDrivers: true }, guests: withLodgingNotices(this.meals.augment(snapshot.guests), notices), meals: this.meals.snapshot(role, snapshot.guests, role === "admin" ? this.survey.summary() : undefined), role, ...(role === "admin" ? { rows: book.data.Attendees } : {}), revision: this.meta("revision", "0"), sync: this.syncState() };
  }
  async refreshLodgingNotices() {
    if (!this.env.LODGING_STATUS_KEY) return;
    try {
      const response = await fetch("https://sahebjiyouth-reg-api.azurewebsites.net/api/lodging-notification-status", { headers: { "x-functions-key": this.env.LODGING_STATUS_KEY }, signal: AbortSignal.timeout(25000), redirect: "manual" });
      const result = await boundedJson(response, 1024 * 1024);
      if (!response.ok || !result.ok || !Array.isArray(result.notifications) || result.notifications.length > 5000 || result.notifications.some(n => typeof n.identity !== "string" || typeof n.signature !== "string" || typeof n.sent !== "boolean" || typeof n.status !== "string")) throw Error("Invalid notification status response.");
      this.putMeta("lodgingNotices", JSON.stringify(result.notifications));
    } catch (_) { console.warn(JSON.stringify({ event: "lodging_notification_status_deferred" })); }
  }
  async mealReply(params) {
    if (!String(params.ButtonPayload || "").startsWith("yp:") && !/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/i.test(String(params.Body || "").trim())) return { status: "ignored" };
    if (!this.meta("initialized")) throw Error("Workspace is not initialized.");
    return this.survey.receive(params);
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
      // Public form actions only touch local registrations, so they need neither the roster nor a role.
      if (String(req.action).startsWith("local-meals-")) return await this.localMeals.handle(req, typeof req.client === "string" ? req.client : "");
      if (!this.meta("initialized")) {
        await this.synchronize();
        if (!this.meta("initialized")) throw new Error("The database is being connected to the roster. Please retry shortly.");
      }
      const role = await matchesDigest(req.accessKey, this.meta("adminDigest")) ? "admin" : "viewer";
      if (req.action === "meal-health") {
        if (role !== "admin" && !await matchesDigest(req.syncKey, await digest(this.env.SYNC_KEY || crypto.randomUUID()))) throw Error("Meal service authorization required.");
        return { ok: true, configured: surveyConfigured(this.env), settings: this.meals.settings(), survey: this.survey.summary(), lastRun: this.meals.get("survey-config", "last-run"), lastSyncedAt: this.meta("lastSyncedAt") };
      }
      if (req.action === "snapshot") {
        // Preserve the original admin-snapshot behavior: due linen tasks become
        // durable before a subsequent assignment clear or direct source edit.
        // Viewer snapshots continue to derive them without writing anything.
        if (role === "admin") await this.persistHousekeeping();
        return this.result(role);
      }
      if (req.action === "trip-display-read") return { ok: true, tripDisplay: this.result(role).tripDisplay };
      if (req.action === "notification-authorize") return { ok: true, authorized: role === "admin" };
      if (req.action === "meal-counts") return { ok: true, ...this.meals.counts(engine.roster(tabularWorkspace(this.load())).guests, req.day) };
      if (mealActions.has(req.action)) {
        if (!/^[a-zA-Z0-9-]{20,80}$/.test(req.requestId || "")) throw Error("Missing request identifier.");
        const { accessKey, ...safeRequest } = req;
        const fingerprint = await digest(JSON.stringify(safeRequest));
        await this.schedule();
        const prior = this.ctx.storage.sql.exec("SELECT fingerprint FROM receipts WHERE id=?", req.requestId).toArray()[0];
        if (prior && prior.fingerprint !== fingerprint) throw Error("This request identifier was already used for another change.");
        // Check current permission even for a replay after team access changes.
        if (role !== "admin" && (req.action === "meal-settings" || !this.meals.settings().teamEditingEnabled)) throw Error("Admin access is required to change dining counts.");
        if (!prior) this.ctx.storage.transactionSync(() => {
          this.meals.mutate(req, engine.roster(tabularWorkspace(this.load())).guests, role);
          this.ctx.storage.sql.exec("INSERT INTO receipts(id,fingerprint,changes,created_at) VALUES (?,?,?,?)", req.requestId, fingerprint, "[]", new Date().toISOString());
          this.putMeta("revision", Number(this.meta("revision", "0")) + 1);
        });
        return this.result(role);
      }
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
  async alarm() {
    await this.synchronize();
    await this.refreshLodgingNotices();
    try { this.meals.put("survey-config", "last-run", { ...await this.survey.process(), at: new Date().toISOString() }); }
    catch (_) { this.meals.put("survey-config", "last-run", { status: "attention", at: new Date().toISOString() }); console.error(JSON.stringify({ event: "meal_survey_attention" })); }
  }
}
