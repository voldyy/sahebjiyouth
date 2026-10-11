import test from "node:test";
import assert from "node:assert/strict";
import { rosterMealCounts } from "../../src/lib/mealForecast.js";
import { isSendWindow, tomorrowEastern, createYogiPrasadHandler, createTwilioClient, SENDER, CONTENT_SID, parseRoster } from "../../notifications/yogi-prasad.js";
const RECIPIENT = "whatsapp:+12025550123";

test("9 PM Eastern works in EDT, EST, and both daylight-saving transitions", () => {
  for (const date of ["2026-10-12T01:00:00Z", "2026-12-12T02:00:00Z", "2026-03-09T01:00:00Z", "2026-11-02T02:00:00Z"]) {
    assert.equal(isSendWindow(new Date(date)), true);
  }
  for (const date of ["2026-10-12T02:00:00Z", "2026-12-12T01:00:00Z", "2026-10-12T01:20:00Z", "2026-10-12T00:59:00Z"]) {
    assert.equal(isSendWindow(new Date(date)), false);
  }
  assert.equal(tomorrowEastern(new Date("2026-10-12T01:00:00Z")), "2026-10-12");
  assert.equal(tomorrowEastern(new Date("2027-01-01T02:00:00Z")), "2027-01-01");
});

test("meal counts follow arrival cutoffs, inclusive departure, and roster exclusions", () => {
  const guest = { sourceIdentity: "guest", arrivalDate: "2026-10-12", departureDate: "2026-10-14", arrivalTime: "00:00", count: 1, status: "Registered" };
  const guests = [
    { ...guest, arrivalTime: "10:59" }, { ...guest, arrivalTime: "11:00" },
    { ...guest, arrivalTime: "14:59" }, { ...guest, arrivalTime: "15:00" },
    { ...guest, arrivalTime: "23:59" },
    { ...guest, arrivalDate: "2026-10-11", arrivalTime: "23:59", departureDate: "2026-10-12" },
    { ...guest, status: "Cancelled" }, { ...guest, status: "Departed" },
    { ...guest, arrivalDate: "" }, { ...guest, departureDate: "" },
    { ...guest, arrivalDate: "2026-10-13" },
    { ...guest, arrivalDate: "2026-10-10", departureDate: "2026-10-11" },
    { ...guest, stay: "Day visitor", arrivalDate: "2026-10-11" },
  ];
  assert.deepEqual(rosterMealCounts(guests, "2026-10-12"), { breakfast: 2, lunch: 4, dinner: 6 });
});

function fixture() {
  const entries = new Map();
  const table = {
    async getEntity(p, r) { if (!entries.has(r)) throw { statusCode: 404 }; return entries.get(r); },
    async createEntity(e) { if (entries.has(e.rowKey)) throw { statusCode: 409 }; entries.set(e.rowKey, { ...e }); },
    async updateEntity(e) { entries.set(e.rowKey, { ...entries.get(e.rowKey), ...e }); },
  };
  let sends = 0;
  const options = {
    table, env: { YOGI_PRASAD_WHATSAPP_ENABLED: "true", YOGI_PRASAD_WHATSAPP_TO: RECIPIENT },
    now: () => new Date("2026-10-12T01:00:00Z"),
    getCounts: async day => ({ day, counts: { breakfast: 3, lunch: 4, dinner: 5 }, excludedUndated: 1 }),
    twilio: { send: async () => { sends++; return { sid: "MM" + "1".repeat(32), status: "queued" }; } },
  };
  return { options, entries, sends: () => sends };
}

test("concurrent executions and later retries send only once", async () => {
  const f = fixture();
  const handler = createYogiPrasadHandler(f.options);
  await Promise.all([handler(), handler()]);
  assert.equal(f.sends(), 1);
  assert.equal((await handler()).status, "already_claimed");
  assert.equal(f.sends(), 1);
  assert.equal([...f.entries.values()][0].status, "accepted");
});

test("unknown Twilio outcome is durably blocked from automatic resend", async () => {
  const f = fixture();
  f.options.twilio.send = async () => { throw Error("network timeout"); };
  const handler = createYogiPrasadHandler(f.options);
  await assert.rejects(handler(), /automatic resend blocked/);
  assert.equal([...f.entries.values()][0].status, "review");
  await assert.rejects(handler(), /uncertain send/);
});

test("failure to record acceptance leaves a durable no-resend claim", async () => {
  const f = fixture();
  f.options.table.updateEntity = async () => { throw Error("storage down"); };
  const handler = createYogiPrasadHandler(f.options);
  await assert.rejects(handler(), /automatic resend blocked/);
  await assert.rejects(handler(), /uncertain send/);
  assert.equal(f.sends(), 1);
  assert.equal([...f.entries.values()][0].status, "sending");
});

test("read failures do not claim the day or send guessed counts", async () => {
  const f = fixture();
  f.options.getCounts = async () => { throw Error("roster unavailable"); };
  await assert.rejects(createYogiPrasadHandler(f.options)(), /roster unavailable/);
  assert.equal(f.entries.size, 0);
  assert.equal(f.sends(), 0);

});

test("disabled, out-of-window and delayed executions never send", async () => {
  const f = fixture();
  f.options.env.YOGI_PRASAD_WHATSAPP_ENABLED = "false";
  assert.equal((await createYogiPrasadHandler(f.options)()).status, "disabled");
  f.options.env.YOGI_PRASAD_WHATSAPP_ENABLED = "true";
  f.options.now = () => new Date("2026-10-12T02:00:00Z");
  assert.equal((await createYogiPrasadHandler(f.options)()).status, "outside_send_window");
  let calls = 0;
  f.options.now = () => new Date(calls++ === 0 ? "2026-10-12T01:00:00Z" : "2026-10-12T01:30:00Z");
  assert.equal((await createYogiPrasadHandler(f.options)()).status, "window_expired");
  assert.equal(f.sends(), 0);
});

const env = { TWILIO_ACCOUNT_SID: "AC" + "0".repeat(32), TWILIO_WHATSAPP_FROM: SENDER, TWILIO_API_KEY: "SK" + "0".repeat(32), TWILIO_API_SECRET: "test-only", YOGI_PRASAD_WHATSAPP_TO: RECIPIENT };
test("Twilio sends exactly three values to the specified recipient and accepts MM and SM", async () => {
  for (const prefix of ["MM", "SM"]) {
    const client = createTwilioClient(env, async (url, request) => {
      assert.equal(request.body.get("To"), RECIPIENT);
      assert.equal(request.body.get("From"), SENDER);
      assert.equal(request.body.get("ContentSid"), CONTENT_SID);
      assert.deepEqual(JSON.parse(request.body.get("ContentVariables")), { 1: "0", 2: "4", 3: "9" });
      assert.equal(request.body.has("Body"), false);
      return { ok: true, json: async () => ({ sid: prefix + "a".repeat(32), status: "queued" }) };
    });
    assert.equal((await client.send({ breakfast: 0, lunch: 4, dinner: 9 })).status, "queued");
  }
});


test("malformed or changed sheet response fails closed", () => {
  assert.throws(() => parseRoster("<html>sign in</html>"), /invalid roster/);
  assert.throws(() => parseRoster('google.visualization.Query.setResponse({"status":"error"});'), /unavailable/);
  assert.throws(() => parseRoster('google.visualization.Query.setResponse({"status":"ok","table":{"cols":[],"rows":[]}});'), /column layout/);
});
