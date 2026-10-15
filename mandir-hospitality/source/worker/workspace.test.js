import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { env, exports } from "cloudflare:workers";
import { reset, runInDurableObject, runDurableObjectAlarm, evictDurableObject } from "cloudflare:test";
import { TABLES } from "../shared/workspace-engine.js";
import { overlayChanges } from "../shared/workspace-sync.js";
import { guestsFromRows } from "../src/lib/sheets.js";
import { transportGroups } from "../src/lib/transport.js";
import { dayDisplayId } from "../src/lib/transportDisplay.js";

const admin = "synthetic-admin-key";
let sheet, ack, unavailable, calls, holdSync, syncingStarted;
const header = () => { const r = Array(32).fill(""); Object.assign(r, { 0: "Registration ID", 8: "Attendee Full Name", 29: "Lodging", 30: "Room No.", 31: "Room Code" }); return r; };
const row = (id) => { const r = Array(32).fill(""); Object.assign(r, { 0: id, 8: id, 9: "Self", 11: "Flight", 12: "10/18/2026 2:00 PM", 13: "10/20/2026 3:30 PM", 14: "PHL", 15: "AA123", 18: "YES", 20: "YES", 24: "Confirmed" }); return r; };
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), b => b.toString(16).padStart(2, "0")).join("");
const stub = () => env.WORKSPACES.getByName(env.WORKSPACE_ID);
const request = data => stub().request({ accessKey: admin, requestId: crypto.randomUUID(), ...data });
const assign = (guest, bed = 1) => ({ action: "lodging", identity: guest.sourceIdentity, expected: guest.sourceLodging, stay: { start: "2026-10-18", end: "2026-10-20" }, assignment: { lodging: "Samarpan", roomNo: "204", roomCode: `S204B${bed}` } });

beforeEach(async () => {
  await reset();
  ack = 0; unavailable = false; calls = 0; holdSync = false; syncingStarted = false;
  sheet = { Attendees: [header(), row("Synthetic A"), row("Synthetic B")], ...Object.fromEntries(Object.entries(TABLES).map(([name, columns]) => [name, [columns]])) };
  const adminDigest = await hash(admin);
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    calls++;
    if (unavailable) throw Error("Google outage");
    const req = JSON.parse(options.body);
    if (req.syncKey !== "synthetic-sync-key") throw Error("Unexpected sync key");
    for (const job of req.jobs || []) {
      if (job.seq <= ack) continue;
      sheet = overlayChanges(sheet, job.changes, true); ack = job.seq;
    }
    const response = { ok: true, tables: structuredClone(sheet), ack, adminDigest };
    if (holdSync) { syncingStarted = true; await new Promise(resolve => setTimeout(resolve, 300)); }
    return Response.json(response);
  }));
});
afterEach(async () => { vi.unstubAllGlobals(); await reset(); });

test("reads and room saves stay fast and durable during a Google outage; alarm replays after recovery", async () => {
  const initial = await request({ action: "snapshot" });
  expect(initial.ok).toBe(true);
  const [a, b] = initial.guests;
  unavailable = true;
  const started = Date.now();
  const saved = await request(assign(a));
  expect(saved.ok).toBe(true);
  expect(Date.now() - started).toBeLessThan(1000);
  expect(calls).toBe(1); // neither the write nor its returned snapshot called Google
  expect(saved.sync.pending).toBe(1);
  expect(sheet.Attendees[1][31]).toBe("");
  expect((await request(assign(b))).error).toMatch(/occupied/);
  // Drop the cache and reconstruct from real SQLite rows. Eviction itself is
  // exercised separately because the test pool drains pending alarms first.
  await runInDurableObject(stub(), instance => { instance.tables = null; });
  expect((await request({ action: "snapshot" })).guests[0].roomCode).toBe("S204B1");
  await runDurableObjectAlarm(stub());
  expect((await request({ action: "snapshot" })).sync.pending).toBe(1);
  unavailable = false;
  await runDurableObjectAlarm(stub());
  expect(sheet.Attendees[1][31]).toBe("S204B1");
  expect((await request({ action: "snapshot" })).sync.pending).toBe(0);
});

test("concurrent admins cannot reserve the same bed and viewer writes are rejected", async () => {
  const initial = await request({ action: "snapshot" });
  const results = await Promise.all(initial.guests.map(g => request(assign(g))));
  expect(results.filter(r => r.ok)).toHaveLength(1);
  expect(results.find(r => !r.ok).error).toMatch(/occupied/);
  expect((await request({ ...assign(initial.guests[1], 2), accessKey: "" })).error).toMatch(/Admin access/);
  const viewer = await request({ action: "snapshot", accessKey: "" });
  expect(viewer.rows).toBeUndefined();
  expect(viewer.role).toBe("viewer");
});

test("retries are idempotent, changed request bodies cannot reuse an ID, and transport preserves revisions", async () => {
  await request({ action: "snapshot" });
  const req = { action: "resource", type: "Driver", name: "Synthetic Driver", active: true, requestId: crypto.randomUUID() };
  expect((await request(req)).ok).toBe(true);
  expect((await request(req)).sync.pending).toBe(1);
  expect((await request({ ...req, name: "Another Driver" })).error).toMatch(/identifier/);
  const group = transportGroups(guestsFromRows(sheet.Attendees), "Arrivals")[0];
  const plan = { driver: "Synthetic Driver", vehicle: "", pickup: "", notes: "", status: "Planned" };
  const trip = { action: "transport", id: group.id, direction: group.direction, signature: group.signature, expectedRevision: "", plan };
  expect((await request(trip)).ok).toBe(true);
  expect((await request(trip)).error).toMatch(/Another admin/);
});

test("a save during synchronization survives the incoming snapshot, then mirrors on the next alarm", async () => {
  const initial = await request({ action: "snapshot" });
  await request(assign(initial.guests[0], 1));
  holdSync = true;
  const syncing = runDurableObjectAlarm(stub());
  await vi.waitFor(() => expect(syncingStarted).toBe(true));
  expect((await request(assign(initial.guests[1], 2))).ok).toBe(true);
  await syncing; holdSync = false;
  const result = await request({ action: "snapshot" });
  expect(result.guests.map(g => g.roomCode)).toEqual(["S204B1", "S204B2"]);
  expect(result.sync.pending).toBe(1);
  await runDurableObjectAlarm(stub());
  expect(sheet.Attendees[2][31]).toBe("S204B2");
});

test("registration changes and sheet sorting import without losing assignments", async () => {
  const initial = await request({ action: "snapshot" });
  await request(assign(initial.guests[0]));
  sheet.Attendees[1][7] = "Allentown, PA";
  sheet.Attendees = [sheet.Attendees[0], sheet.Attendees[2], sheet.Attendees[1]];
  await runDurableObjectAlarm(stub());
  const result = await request({ action: "snapshot" });
  expect(result.guests.find(g => g.name === "Synthetic A")).toMatchObject({ city: "Allentown, PA", roomCode: "S204B1" });
});

test("HTTP API uses CORS, never caches guest records and does not expose admin secrets", async () => {
  await request({ action: "snapshot" });
  const res = await exports.default.fetch(new Request("https://api.test/api", { headers: { Origin: "https://www.sahebjiyouth.org" } }));
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://www.sahebjiyouth.org");
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  expect(await res.text()).not.toContain(admin);
  const denied = await exports.default.fetch(new Request("https://api.test/api", { headers: { Origin: "https://unrelated.test" } }));
  expect(denied.status).toBe(403);
  expect(await runInDurableObject(stub(), instance => instance.meta("initialized"))).toBe("yes");
});

test("shared day display timestamps survive SQLite reload and mirror without touching operational fields", async () => {
  await request({action:'snapshot'});
  const original=structuredClone(sheet.Attendees);
  const id=dayDisplayId('2026-10-18');
  const data={action:'trip-display',id,collapsed:false,accessKey:'',requestId:crypto.randomUUID()};
  const saved=await request(data);
  expect(saved.ok).toBe(true);
  expect(saved.tripDisplay[0]).toMatchObject({id,collapsed:false});
  expect(saved.tripDisplay[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect((await request(data)).tripDisplay).toEqual(saved.tripDisplay);
  await runInDurableObject(stub(), instance => { instance.tables=null; });
  expect((await request({action:'trip-display-read',accessKey:''})).tripDisplay).toEqual(saved.tripDisplay);
  await runDurableObjectAlarm(stub());
  expect(sheet['Transport Display'][1][2]).toBe(saved.tripDisplay[0].revision);
  expect(sheet.Attendees).toEqual(original);
  expect(sheet['Transport Assignments']).toHaveLength(1);
  expect((await request({...data,id:dayDisplayId('2030-01-01'),requestId:crypto.randomUUID()})).ok).toBe(false);
  expect((await request({action:'trip-display',id,collapsed:true,requestId:crypto.randomUUID()})).tripDisplay[0].collapsed).toBe(true);
});

test("admin snapshots retain due linen tasks through direct Sheet assignment removal; viewers do not write", async () => {
  sheet.Attendees[1][12] = "2020-10-18";
  sheet.Attendees[1][13] = "2020-10-20";
  sheet.Attendees[1].splice(29, 3, "Samarpan", "204", "S204B1");
  const viewer = await request({ action: "snapshot", accessKey: "" });
  expect(viewer.housekeeping).toHaveLength(1);
  expect(viewer.sync.pending).toBe(0);
  const adminSnapshot = await request({ action: "snapshot" });
  expect(adminSnapshot.housekeeping).toHaveLength(1);
  expect(adminSnapshot.sync.pending).toBe(1);
  expect((await request({ action: "snapshot" })).sync.pending).toBe(1);
  sheet.Attendees[1].splice(29, 3, "", "", "");
  await runDurableObjectAlarm(stub());
  const imported = await request({ action: "snapshot" });
  expect(imported.guests[0].roomCode).toBe("");
  expect(imported.housekeeping).toHaveLength(1);
  expect(imported.housekeeping[0].roomCode).toBe("S204B1");
  expect(sheet.Housekeeping).toHaveLength(2);
  expect(imported.sync.pending).toBe(0);
});

test('Sadhak assignments validate and mirror, with submission times available to viewers', async () => {
  sheet.Attendees[1][1] = '10/15/2026 9:00 AM';
  const initial = await request({action:'snapshot'});
  const [a,b] = initial.guests;
  const assignment = {lodging:'Sadhak',roomNo:'104',roomCode:'SD104B2'};
  expect((await request({...assign(a),assignment})).ok).toBe(true);
  expect((await request({...assign(b),assignment})).error).toMatch(/occupied/);
  expect((await request({...assign(b),assignment:{...assignment,roomCode:'SD104B3'}})).error).toMatch(/valid bed/);
  // Same room and bed in a different building is independent.
  expect((await request({...assign(b),assignment:{lodging:'Samarpan',roomNo:'104',roomCode:'S104B2'}})).ok).toBe(true);
  await runDurableObjectAlarm(stub());
  expect(sheet.Attendees[1].slice(29)).toEqual(['Sadhak','104','SD104B2']);
  const viewer = await request({action:'snapshot',accessKey:''});
  expect(viewer.guests[0].registeredAt).toBe(Date.parse('2026-10-15T13:00:00Z'));
  expect(viewer.guests[0].roomCode).toBe('SD104B2');
  expect(viewer.sync.pending).toBe(0);
});
