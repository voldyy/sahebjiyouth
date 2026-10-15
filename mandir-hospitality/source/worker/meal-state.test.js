import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { env, exports } from "cloudflare:workers";
import { reset, runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { TABLES } from "../shared/workspace-engine.js";
import { overlayChanges } from "../shared/workspace-sync.js";
import { signTwilioRequest, verifyTwilioSignature } from "./twilio-webhook.js";

const admin = "synthetic-admin-key";
const chatwootUrl = "https://app.chatwoot.com/twilio/callback";
let sheet, ack, forwarded;

const header = () => {
  const row = Array(32).fill("");
  Object.assign(row, {
    0: "Registration ID", 4: "Primary Email", 5: "Primary Phone", 6: "Zip Code",
    8: "Attendee Full Name", 29: "Lodging", 30: "Room No.", 31: "Room Code",
  });
  return row;
};
const attendee = (id, phone) => {
  const row = Array(32).fill("");
  Object.assign(row, {
    0: id, 2: "YES", 3: id, 5: phone, 8: id, 9: "Self",
    12: "10/18/2026 2:00 PM", 13: "10/20/2026 3:30 PM", 20: "YES", 24: "Confirmed",
  });
  return row;
};
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");
const stub = () => env.WORKSPACES.getByName(env.WORKSPACE_ID);
const request = data => stub().request({ accessKey: admin, requestId: crypto.randomUUID(), ...data });

beforeEach(async () => {
  await reset();
  ack = 0;
  forwarded = [];
  sheet = {
    Attendees: [header(), attendee("Manual A", "202-555-0101"), attendee("Manual B", "202-555-0102")],
    ...Object.fromEntries(Object.entries(TABLES).map(([name, columns]) => [name, [columns]])),
  };
  const adminDigest = await hash(admin);
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    if (String(url) === chatwootUrl) {
      forwarded.push({ body: String(options.body), headers: new Headers(options.headers) });
      return new Response("<Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
    }
    if (String(url) !== "https://sheet.test/exec") throw Error(`Unexpected fetch: ${url}`);
    const body = JSON.parse(options.body);
    expect(body.syncKey).toBe("synthetic-sync-key");
    for (const job of body.jobs || []) {
      if (job.seq <= ack) continue;
      sheet = overlayChanges(sheet, job.changes, true);
      ack = job.seq;
    }
    return Response.json({ ok: true, tables: structuredClone(sheet), ack, adminDigest });
  }));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await reset();
});

test("team viewers share remove and restore overrides while default editing remains enabled", async () => {
  const initial = await request({ action: "snapshot" });
  expect(initial.meals.settings).toMatchObject({ teamEditingEnabled: true, automaticQuestionsEnabled: false });
  const identity = initial.guests[0].sourceIdentity;
  const remove = {
    action: "meal-override", accessKey: "", requestId: crypto.randomUUID(), identity,
    day: "2026-10-18", meal: "lunch", included: false, expectedRevision: "",
  };
  const removed = await request(remove);
  expect(removed.ok).toBe(true);
  expect(removed.role).toBe("viewer");
  expect(removed.guests[0].mealOverrides).toHaveLength(1);
  expect((await request({ action: "meal-counts", accessKey: "", day: "2026-10-18" })).counts).toEqual({ breakfast: 0, lunch: 1, dinner: 2 });
  const shared = await request({ action: "snapshot", accessKey: "" });
  const revision = shared.guests[0].mealOverrides[0].revision;
  expect(shared.guests[0].mealOverrides[0]).toMatchObject({ day: "2026-10-18", meal: "lunch", included: false });

  const restored = await request({
    action: "meal-override", accessKey: "", identity, day: "2026-10-18", meal: "lunch",
    included: null, expectedRevision: revision,
  });
  expect(restored.ok).toBe(true);
  expect((await request({ action: "meal-counts", accessKey: "", day: "2026-10-18" })).counts.lunch).toBe(2);
});

test("shared plans are idempotent, revision guarded, and clamp negative totals at zero", async () => {
  await request({ action: "snapshot" });
  const plan = {
    action: "meal-plan", accessKey: "", requestId: crypto.randomUUID(), day: "2026-10-18",
    meal: "lunch", adjustment: 5, buffer: 50, expectedRevision: "",
  };
  const first = await request(plan);
  const saved = first.meals.plans.find(value => value.day === plan.day && value.meal === plan.meal);
  expect(saved).toMatchObject({ adjustment: 5, buffer: 50 });
  expect((await request({ action: "meal-counts", accessKey: "", day: plan.day })).counts.lunch).toBe(7);

  const replay = await request(plan);
  expect(replay.meals.plans.find(value => value.day === plan.day && value.meal === plan.meal).revision).toBe(saved.revision);
  expect((await request({ ...plan, adjustment: 6 })).error).toMatch(/identifier/);
  expect((await request({ ...plan, requestId: crypto.randomUUID(), expectedRevision: "" })).error).toMatch(/changed/);

  const reduced = await request({ ...plan, requestId: crypto.randomUUID(), adjustment: -10, expectedRevision: saved.revision });
  expect(reduced.ok).toBe(true);
  expect((await request({ action: "meal-counts", accessKey: "", day: plan.day })).counts.lunch).toBe(0);
});

test("received arrival and fasting answers persist and drive the public aggregate endpoint", async () => {
  const initial = await request({ action: "snapshot" });
  const identity = initial.guests[0].sourceIdentity;
  await runInDurableObject(stub(), instance => instance.ctx.storage.transactionSync(() => {
    instance.meals.saveAnswer(identity, "arrival", "morning", "2026-10-18", "SM" + "1".repeat(32));
    instance.meals.saveAnswer(identity, "fasting", "lunch", "2026-10-18", "SM" + "2".repeat(32));
  }));
  await runInDurableObject(stub(), instance => { instance.tables = null; });
  const snapshot = await request({ action: "snapshot", accessKey: "" });
  expect(snapshot.guests[0].mealPreference).toEqual({ arrival: "morning", arrivalDate: "2026-10-18", fasting: "lunch" });

  const response = await exports.default.fetch(new Request("https://api.test/api", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "meal-counts", day: "2026-10-18" }),
  }));
  const result = await response.json();
  expect(result).toEqual({ ok: true, day: "2026-10-18", counts: { breakfast: 0, lunch: 2, dinner: 1 }, rosterSize: 2, excludedUndated: 0 });
  expect(JSON.stringify(result)).not.toContain("Manual A");
});

test("Sheet refreshes cannot overwrite SQLite meal answers, plans, or overrides", async () => {
  const initial = await request({ action: "snapshot" });
  const identity = initial.guests[0].sourceIdentity;
  await runInDurableObject(stub(), instance => instance.ctx.storage.transactionSync(() => {
    instance.meals.saveAnswer(identity, "fasting", "dinner", "2026-10-18", "SM" + "3".repeat(32));
  }));
  const override = await request({ action: "meal-override", identity, day: "2026-10-19", meal: "dinner", included: false, expectedRevision: "" });
  expect(override.ok).toBe(true);
  expect((await request({ action: "meal-plan", day: "2026-10-19", meal: "dinner", adjustment: 3, buffer: 10, expectedRevision: "" })).ok).toBe(true);
  sheet.Attendees[1][7] = "Changed in Sheets";
  await runDurableObjectAlarm(stub());
  const refreshed = await request({ action: "snapshot" });
  expect(refreshed.guests[0].city).toBe("Changed in Sheets");
  expect(refreshed.guests[0].mealPreference.fasting).toBe("dinner");
  expect(refreshed.guests[0].mealOverrides[0]).toMatchObject({ day: "2026-10-19", meal: "dinner", included: false });
  expect(refreshed.meals.plans[0]).toMatchObject({ day: "2026-10-19", meal: "dinner", adjustment: 3 });
  expect(Object.keys(sheet)).not.toContain("Meal Preferences");
});

test("meal overrides reject unknown, duplicate, invalid-date, and out-of-stay attendees", async () => {
  sheet.Attendees.push(structuredClone(sheet.Attendees[1]));
  const initial = await request({ action: "snapshot" });
  const duplicate = initial.guests.find(value => value.name === "Manual A");
  const unique = initial.guests.find(value => value.name === "Manual B");
  const change = values => request({
    action: "meal-override", identity: unique.sourceIdentity, day: "2026-10-18", meal: "lunch",
    included: true, expectedRevision: "", ...values,
  });
  expect((await change({ identity: "missing" })).error).toMatch(/attendee|stay/i);
  expect((await change({ identity: duplicate.sourceIdentity })).error).toMatch(/attendee|stay/i);
  expect((await change({ day: "2026-10-17" })).error).toMatch(/attendee|stay/i);
  expect((await change({ day: "2026-10-21" })).error).toMatch(/attendee|stay/i);
  expect((await change({ day: "2026-10-32" })).error).toMatch(/valid meal and date/i);
  expect((await change({ meal: "snack" })).error).toMatch(/valid meal and date/i);
});

test("meal settings are admin-only and disabling team editing blocks viewer changes and replays", async () => {
  const initial = await request({ action: "snapshot" });
  expect(initial.meals.settings.teamEditingEnabled).toBe(true);
  const viewerPlan = {
    action: "meal-plan", accessKey: "", requestId: crypto.randomUUID(), day: "2026-10-18",
    meal: "dinner", adjustment: 1, buffer: 10, expectedRevision: "",
  };
  expect((await request(viewerPlan)).ok).toBe(true);
  expect((await request({ action: "meal-settings", accessKey: "", teamEditingEnabled: false, automaticQuestionsEnabled: false, expectedRevision: "" })).error).toMatch(/Admin access/);
  const disabled = await request({ action: "meal-settings", teamEditingEnabled: false, automaticQuestionsEnabled: false, expectedRevision: "" });
  expect(disabled.meals.settings.teamEditingEnabled).toBe(false);
  expect((await request(viewerPlan)).error).toMatch(/Admin access/);
  expect((await request({ ...viewerPlan, requestId: crypto.randomUUID(), expectedRevision: disabled.meals.plans[0].revision })).error).toMatch(/Admin access/);
  expect((await request({ action: "meal-settings", teamEditingEnabled: true, automaticQuestionsEnabled: false, expectedRevision: "" })).error).toMatch(/changed/);
  expect((await request({ ...viewerPlan, accessKey: admin, requestId: crypto.randomUUID(), expectedRevision: disabled.meals.plans[0].revision })).ok).toBe(true);
});

test("Twilio signature helpers match an independent HMAC fixture and forwarding preserves validation", async () => {
  const fixtureUrl = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const fixture = new URLSearchParams({
    CallSid: "CA1234567890ABCDE", Caller: "+14158675310", Digits: "1234",
    From: "+14158675310", To: "+18055551212",
  });
  // Independently calculated with Node's createHmac('sha1', '12345'),
  // using Twilio's sorted form-parameter signing specification.
  expect(await signTwilioRequest(fixtureUrl, fixture, "12345")).toBe("7re3Tucrlj8Md1c+C1f5gQH22tw=");
  expect(await verifyTwilioSignature(fixtureUrl, fixture, "7re3Tucrlj8Md1c+C1f5gQH22tw=", "12345")).toBe(true);

  await request({ action: "snapshot" });
  const webhookUrl = "https://api.test/twilio/whatsapp";
  const form = new URLSearchParams({
    MessageSid: "SM" + "a".repeat(32), AccountSid: env.TWILIO_ACCOUNT_SID,
    From: "whatsapp:+12025550101", To: env.TWILIO_WHATSAPP_FROM,
    ButtonPayload: `yp:${"0".repeat(32)}:morning`, ButtonText: "Morning",
  });
  const signature = await signTwilioRequest(webhookUrl, form, env.TWILIO_AUTH_TOKEN);
  const valid = await exports.default.fetch(new Request(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": signature },
    body: form,
  }));
  expect(valid.status).toBe(200);
  expect(forwarded).toHaveLength(1);
  const forwardedParams = new URLSearchParams(forwarded[0].body);
  expect(forwardedParams.get("ButtonText")).toBe("Morning");
  expect(await verifyTwilioSignature(chatwootUrl, forwardedParams, forwarded[0].headers.get("X-Twilio-Signature"), env.TWILIO_AUTH_TOKEN)).toBe(true);

  const invalid = await exports.default.fetch(new Request(webhookUrl, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": "invalid" }, body: form,
  }));
  expect(invalid.status).toBe(403);
  expect(forwarded).toHaveLength(1);
  const wrongType = await exports.default.fetch(new Request(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
  expect(wrongType.status).toBe(415);

  await runInDurableObject(stub(), instance => { instance.survey.receive = async () => { throw Error("Synthetic storage failure"); }; });
  const mealFailure = await exports.default.fetch(new Request(webhookUrl, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": signature }, body: form,
  }));
  expect(mealFailure.status).toBe(503);
  expect(forwarded).toHaveLength(2); // Existing Chatwoot inbox still receives it.
});
