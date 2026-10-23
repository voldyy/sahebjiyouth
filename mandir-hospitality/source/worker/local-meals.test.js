import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { env, exports } from "cloudflare:workers";
import { reset } from "cloudflare:test";
import { TABLES } from "../shared/workspace-engine.js";
import { overlayChanges } from "../shared/workspace-sync.js";

const FORM_ORIGIN = "https://www.anoopam.us";
let sheet;
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");
const stub = () => env.WORKSPACES.getByName(env.WORKSPACE_ID);
const request = data => stub().request({ accessKey: "", requestId: crypto.randomUUID(), ...data });
const etDay = offset => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offset * 86400000));
const post = (body, origin = FORM_ORIGIN) => exports.default.fetch(new Request("https://api.test/api", {
  method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
}));
const form = (extra = {}) => ({ action: "local-meals-submit", requestId: crypto.randomUUID(), names: ["Amit Patel", "Sheetal Patel"], from: etDay(0), to: etDay(2), meals: ["lunch", "dinner"], website: "", ...extra });

beforeEach(async () => {
  await reset();
  const header = Array(32).fill("");
  Object.assign(header, { 0: "Registration ID", 4: "Primary Email", 5: "Primary Phone", 6: "Zip Code", 8: "Attendee Full Name", 29: "Lodging", 30: "Room No.", 31: "Room Code" });
  sheet = { Attendees: [header], ...Object.fromEntries(Object.entries(TABLES).map(([name, columns]) => [name, [columns]])) };
  const adminDigest = await hash("synthetic-admin-key");
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    if (String(url) !== "https://sheet.test/exec") throw Error(`Unexpected fetch: ${url}`);
    const body = JSON.parse(options.body);
    for (const job of body.jobs || []) sheet = overlayChanges(sheet, job.changes, true);
    return Response.json({ ok: true, tables: structuredClone(sheet), ack: 0, adminDigest });
  }));
});
afterEach(async () => { vi.unstubAllGlobals(); await reset(); });

test("the public form registers local diners from the new site without any access key", async () => {
  const response = await post(form());
  expect(response.status).toBe(200);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(FORM_ORIGIN);
  const saved = await response.json();
  expect(saved).toMatchObject({ ok: true, registration: { names: ["Amit Patel", "Sheetal Patel"], meals: ["lunch", "dinner"] } });
  expect(saved.editKey).toMatch(/^[0-9a-f]{64}$/);

  const snapshot = await request({ action: "snapshot" });
  expect(snapshot.meals.localDiners.map(d => [d.name, d.city, d.isLocalDiner])).toEqual([["Amit Patel", "Local", true], ["Sheetal Patel", "Local", true]]);
  // Local people never appear in the registration roster that Main, Transport and Accommodations use.
  expect(snapshot.guests).toHaveLength(0);
  expect(JSON.stringify(snapshot.meals.localDiners)).not.toContain(saved.editKey);
  expect((await request({ action: "meal-counts", day: etDay(0) })).counts).toEqual({ breakfast: 0, lunch: 2, dinner: 2 });
  expect((await request({ action: "meal-counts", day: etDay(2) })).counts).toEqual({ breakfast: 0, lunch: 2, dinner: 2 });
  expect((await request({ action: "meal-counts", day: etDay(3) })).counts).toEqual({ breakfast: 0, lunch: 0, dinner: 0 });
});

test("the Yogi Prasad team can remove a local diner from one meal, and the owner can change or cancel", async () => {
  const { id, editKey } = await (await post(form())).json();
  const diner = (await request({ action: "snapshot" })).meals.localDiners[0];
  const removed = await request({ action: "meal-override", identity: diner.sourceIdentity, day: etDay(1), meal: "lunch", included: false, expectedRevision: "" });
  expect(removed.ok).toBe(true);
  expect((await request({ action: "meal-counts", day: etDay(1) })).counts).toEqual({ breakfast: 0, lunch: 1, dinner: 2 });

  const updated = await (await post(form({ id, editKey, names: ["Amit Patel"], meals: ["breakfast"] }))).json();
  expect(updated.ok).toBe(true);
  expect((await request({ action: "meal-counts", day: etDay(1) })).counts).toEqual({ breakfast: 1, lunch: 0, dinner: 0 });
  expect((await post({ action: "local-meals-lookup", id, editKey })).status).toBe(200);
  expect((await (await post({ action: "local-meals-cancel", id, editKey: "0".repeat(64) })).json()).ok).toBe(false);

  const before = (await request({ action: "snapshot" })).revision;
  expect((await (await post({ action: "local-meals-cancel", id, editKey })).json()).ok).toBe(true);
  const after = await request({ action: "snapshot" });
  expect(after.meals.localDiners).toEqual([]);
  expect(after.revision).not.toBe(before);
});

test("other websites are refused, and a visitor cannot dodge the rate limit by choosing their own visitor key", async () => {
  expect((await post(form(), "https://unrelated.test")).status).toBe(403);
  expect((await post(form(), "https://events.anoopam.us")).status).toBe(200);
  const results = [];
  for (let i = 0; i < 13; i++) results.push(await (await post(form({ client: `fake-${i}`, names: [`Person ${String.fromCharCode(65 + i)}${i}`] }), null)).json());
  expect(results.filter(r => r.ok)).toHaveLength(11);
  expect(results.at(-1)).toEqual({ ok: false, error: "Too many attempts. Please try again later." });
});

test("a filled-in decoy field is ignored and invalid entries get a plain message", async () => {
  expect(await (await post(form({ website: "https://spam.example" }))).json()).toEqual({ ok: true, ignored: true });
  expect((await request({ action: "snapshot" })).meals.localDiners).toEqual([]);
  const invalid = await post(form({ names: ["<script>alert(1)</script>"] }));
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toEqual({ ok: false, error: "Enter each name using letters only." });
});
