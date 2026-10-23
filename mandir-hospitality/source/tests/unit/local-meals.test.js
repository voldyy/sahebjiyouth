import test from "node:test";
import assert from "node:assert/strict";
import { createLocalMeals, normalize, cleanName, MAX_REGISTRATIONS } from "../../worker/local-meals.js";
import { getForecast } from "../../src/lib/mealForecast.js";

const TODAY = "2026-10-23";
function harness({ secret = "synthetic-key", now = () => Date.parse("2026-10-23T15:00:00Z") } = {}) {
  const rows = new Map(), key = (k, i) => `${k}/${i}`, revisions = [];
  const local = createLocalMeals({
    get: (k, i) => rows.get(key(k, i)) || null,
    put: (k, i, d) => rows.set(key(k, i), structuredClone(d)),
    remove: (k, i) => rows.delete(key(k, i)),
    records: k => [...rows].filter(([name]) => name.startsWith(`${k}/`)).map(([, d]) => d),
    bumpRevision: () => revisions.push(1), secret: () => secret, today: () => TODAY, now,
  });
  return { local, rows, revisions };
}
const form = (extra = {}) => ({ action: "local-meals-submit", requestId: crypto.randomUUID(), names: ["Amit Patel", "Sheetal Patel"], from: "2026-11-06", to: "2026-11-08", meals: ["lunch", "dinner"], website: "", ...extra });

test("names allow letters, accents and common punctuation but reject markup, links and digits-only noise", () => {
  assert.equal(cleanName("  Jyoti   O'Brien-Patel  "), "Jyoti O'Brien-Patel");
  assert.equal(cleanName("Śreyā Pāṭel"), "Śreyā Pāṭel");
  for (const bad of ["", "A", "<b>Amit</b>", "http://spam.example", "Amit@example.com", "123", "Amit\u0000", "x".repeat(61)]) assert.throws(() => cleanName(bad), /letters/);
});

test("registrations are validated for people, dates and meals", () => {
  const ok = normalize({ names: ["Amit Patel", "Sheetal Patel"], from: "2026-11-06", to: "2026-11-08", meals: ["dinner", "breakfast"] }, TODAY);
  assert.deepEqual(ok, { names: ["Amit Patel", "Sheetal Patel"], from: "2026-11-06", to: "2026-11-08", meals: ["breakfast", "dinner"] });
  const bad = (change, pattern) => assert.throws(() => normalize({ names: ["Amit Patel"], from: "2026-11-06", to: "2026-11-08", meals: ["lunch"], ...change }, TODAY), pattern);
  bad({ names: [] }, /1 to 12/);
  bad({ names: Array.from({ length: 13 }, (_, i) => `Person ${String.fromCharCode(65 + i)}`) }, /1 to 12/);
  bad({ names: ["Amit Patel", "amit  patel"] }, /once/);
  bad({ from: "2026-02-30" }, /dates/);
  bad({ from: "2026-10-01" }, /Oct 14 to Nov 21/);
  bad({ to: "2026-11-22" }, /Oct 14 to Nov 21/);
  bad({ from: "2026-11-09" }, /before/);
  bad({ from: "2026-10-15", to: "2026-10-22" }, /passed/);
  bad({ meals: [] }, /meal/);
  bad({ meals: ["snack"] }, /meal/);
  assert.equal(normalize({ names: ["Amit Patel"], from: "2026-10-20", to: "2026-10-23", meals: ["lunch"] }, TODAY).to, "2026-10-23");
});

test("a submission stores one registration, returns an edit key, and a repeated request does not duplicate it", async () => {
  const { local, rows, revisions } = harness();
  const request = form(), first = await local.handle(request, "visitor-1");
  assert.equal(first.ok, true);
  assert.match(first.id, /^[0-9a-f]{24}$/);
  assert.match(first.editKey, /^[0-9a-f]{64}$/);
  assert.deepEqual(first.registration.meals, ["lunch", "dinner"]);
  const again = await local.handle(request, "visitor-1");
  assert.equal(again.id, first.id);
  assert.equal(again.editKey, first.editKey);
  assert.equal(rows.size, 1);
  assert.equal(revisions.length, 1);
  assert.match((await local.handle({ ...request, names: ["Someone Else"] }, "visitor-1")).error, /try again/);
  assert.equal(JSON.stringify([...rows.values()]).includes(first.editKey), false, "the edit key is never stored");
});

test("the hidden field marks a bot: success is reported but nothing is stored", async () => {
  const { local, rows } = harness();
  assert.deepEqual(await local.handle(form({ website: "https://spam.example" }), "bot"), { ok: true, ignored: true });
  assert.equal(rows.size, 0);
});

test("only the holder of the edit key can look up, change or cancel a registration", async () => {
  const { local, rows } = harness();
  const { id, editKey } = await local.handle(form(), "visitor-1");
  const wrong = { id, editKey: "0".repeat(64) };
  for (const action of ["local-meals-lookup", "local-meals-cancel", "local-meals-submit"]) {
    const reply = await local.handle(action === "local-meals-submit" ? form({ ...wrong }) : { action, ...wrong }, "visitor-2");
    assert.deepEqual(reply, { ok: false, error: "This registration could not be found." });
  }
  assert.equal(rows.size, 1);
  assert.deepEqual((await local.handle({ action: "local-meals-lookup", id, editKey }, "visitor-1")).registration.names, ["Amit Patel", "Sheetal Patel"]);
  const updated = await local.handle(form({ id, editKey, names: ["Amit Patel"], meals: ["breakfast"], to: "2026-11-09" }), "visitor-1");
  assert.equal(updated.id, id);
  assert.deepEqual([rows.size, updated.registration.names, updated.registration.meals, updated.registration.to], [1, ["Amit Patel"], ["breakfast"], "2026-11-09"]);
  assert.equal((await local.handle({ action: "local-meals-cancel", id, editKey }, "visitor-1")).ok, true);
  assert.equal(rows.size, 0);
});

test("people are limited per visitor and in total, and a missing secret is reported generically", async () => {
  const { local } = harness();
  for (let i = 0; i < 12; i++) assert.equal((await local.handle(form(), "busy")).ok, true);
  assert.match((await local.handle(form(), "busy")).error, /Too many attempts/);
  assert.equal((await local.handle(form(), "someone-else")).ok, true);
  const unconfigured = harness({ secret: "" });
  assert.deepEqual(await unconfigured.local.handle(form(), "v"), { ok: false, error: "Please try again." });
  const full = harness();
  for (let i = 0; i < MAX_REGISTRATIONS; i++) full.rows.set(`local/${String(i).padStart(24, "0")}`, { id: String(i), names: ["Full Test"], from: "2026-11-06", to: "2026-11-06", meals: ["lunch"] });
  assert.match((await full.local.handle(form(), "v")).error, /full/);
});

test("each person becomes a Local diner for only the chosen meals and days, with a stable identity", async () => {
  const { local } = harness();
  const { id, editKey } = await local.handle(form(), "v");
  const diners = local.diners();
  assert.equal(diners.length, 2);
  assert.deepEqual(diners.map(d => [d.name, d.city, d.isLocalDiner, d.sourceWritable]), [["Amit Patel", "Local", true, true], ["Sheetal Patel", "Local", true, true]]);
  const lunch = { id: "lunch", cutoff: 15 * 60 }, breakfast = { id: "breakfast", cutoff: 11 * 60 }, dinner = { id: "dinner", cutoff: 24 * 60 };
  assert.equal(getForecast(diners, lunch, {}, "2026-11-07").expected, 2);
  assert.equal(getForecast(diners, dinner, {}, "2026-11-06").expected, 2, "first day, every selected meal");
  assert.equal(getForecast(diners, dinner, {}, "2026-11-08").expected, 2, "last day is inclusive");
  assert.equal(getForecast(diners, breakfast, {}, "2026-11-07").expected, 0, "breakfast was not chosen");
  assert.equal(getForecast(diners, lunch, {}, "2026-11-05").expected, 0);
  assert.equal(getForecast(diners, lunch, {}, "2026-11-09").expected, 0);
  const before = Object.fromEntries(diners.map(d => [d.name, d.sourceIdentity]));
  assert.ok(Object.values(before).every(identity => identity.startsWith(`local:${id}:`)));
  assert.notEqual(before["Amit Patel"], before["Sheetal Patel"]);
  await local.handle(form({ id, editKey, names: ["Sheetal Patel", "New Person", "Amit Patel"] }), "v");
  const after = Object.fromEntries(local.diners().map(d => [d.name, d.sourceIdentity]));
  assert.deepEqual([after["Amit Patel"], after["Sheetal Patel"]], [before["Amit Patel"], before["Sheetal Patel"]]);
  assert.equal(Object.keys(after).length, 3);
});

test("a manual removal still works for a local diner and a manual add can include an unchosen meal", () => {
  const diner = { sourceIdentity: "local:abc:11111111", name: "Amit Patel", status: "Registered", stay: "Local", arrivalDate: "2026-11-06", departureDate: "2026-11-08", localMeals: ["lunch"], count: 1 };
  const meal = { id: "lunch", cutoff: 15 * 60 }, dinner = { id: "dinner", cutoff: 24 * 60 };
  const removed = { ...diner, mealOverrides: [{ day: "2026-11-07", meal: "lunch", included: false }] };
  const result = getForecast([removed], meal, {}, "2026-11-07");
  assert.deepEqual([result.expected, result.excluded[0].reason], [0, "manual"]);
  const added = { ...diner, mealOverrides: [{ day: "2026-11-07", meal: "dinner", included: true }] };
  assert.equal(getForecast([added], dinner, {}, "2026-11-07").expected, 1);
  assert.equal(getForecast([diner], dinner, {}, "2026-11-07").excluded[0].reason, "not_selected");
});
