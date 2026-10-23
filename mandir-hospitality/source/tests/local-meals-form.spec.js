import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const PAGE = "https://form.test/diwali";
const API = "https://mandir-hospitality-api.usayouth.workers.dev/api";
const html = readFileSync(new URL("../local-meals-form/index.html", import.meta.url), "utf8");
const cors = { "Access-Control-Allow-Origin": "https://form.test", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

// A tiny stand-in for the Worker: it keeps one registration per id and checks the edit key.
async function open(page, { fail = null, stored = null, seed = [], now = "2026-10-23T16:00:00Z" } = {}) {
  const state = { calls: [], regs: new Map(seed.map(reg => [reg.id, reg])) };
  if (stored) await page.addInitScript(([key, value]) => localStorage.setItem(key, value), stored);
  await page.clock.install({ time: new Date(now) });
  await page.route(PAGE, route => route.fulfill({ contentType: "text/html", body: html }));
  await page.route("https://form.test/diwali/logo.png", route => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==", "base64") }));
  await page.route(API, async route => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const body = request.postDataJSON(); state.calls.push(body);
    let reply;
    if (fail && fail(body, state.calls.length)) reply = fail(body, state.calls.length);
    else if (body.action === "local-meals-submit") {
      const id = body.id || `${state.regs.size + 1}`.padStart(24, "a"), editKey = "k".repeat(64);
      state.regs.set(id, { id, names: body.names, mealDays: body.mealDays });
      reply = { ok: true, id, editKey, registration: state.regs.get(id) };
    } else {
      const reg = state.regs.get(body.id);
      if (!reg || body.editKey !== "k".repeat(64)) reply = { ok: false, error: "This registration could not be found." };
      else if (body.action === "local-meals-cancel") { state.regs.delete(body.id); reply = { ok: true }; }
      else reply = { ok: true, registration: reg };
    }
    await route.fulfill({ json: reply, headers: cors });
  });
  await page.goto(PAGE);
  return state;
}
const meal = (page, name) => page.locator(`[data-meal="${name}"]`);
const day = (page, name, iso) => meal(page, name).locator(`button[data-day="${iso}"]`);
const summary = (page, name) => meal(page, name).locator(".msum");
const expand = async (page, name) => { if ((await meal(page, name).locator(".mealhead").getAttribute("aria-expanded")) !== "true") await meal(page, name).locator(".mealhead").click(); };
const pick = async (page, name, ...days) => { await expand(page, name); for (const iso of days) await day(page, name, iso).click(); };
const KEY = "k".repeat(64);
const NOV_6_8 = ["2026-11-06", "2026-11-07", "2026-11-08"];

test("meals start as three compact cards and a card opens into its own calendar", async ({ page }) => {
  await open(page);
  await expect(page.locator(".mealcard")).toHaveCount(3);
  await expect(page.locator(".mealcard .mname strong")).toHaveText(["Breakfast", "Lunch", "Dinner"]);
  await expect(page.locator(".mealcard .msum")).toHaveText(["Tap to choose days", "Tap to choose days", "Tap to choose days"]);
  await expect(page.locator(".mealbody:visible")).toHaveCount(0);
  const compact = await page.locator(".mealcard").evaluateAll(cards => cards.map(card => card.getBoundingClientRect().height));
  expect(Math.max(...compact)).toBeLessThan(90);
  await meal(page, "lunch").locator(".mealhead").click();
  await expect(meal(page, "lunch").locator(".mealhead")).toHaveAttribute("aria-expanded", "true");
  await expect(meal(page, "lunch").locator(".mealbody")).toBeVisible();
  await expect(meal(page, "breakfast").locator(".mealbody")).toBeHidden();
  // Only one calendar is open at a time; choices stay when a card is closed.
  await pick(page, "lunch", "2026-10-25", "2026-10-26");
  await expect(summary(page, "lunch")).toHaveText("Oct 25–26 · 2 days");
  await meal(page, "dinner").locator(".mealhead").click();
  await expect(meal(page, "lunch").locator(".mealbody")).toBeHidden();
  await expect(meal(page, "dinner").locator(".mealbody")).toBeVisible();
  await expect(summary(page, "lunch")).toHaveText("Oct 25–26 · 2 days");
  await expect(meal(page, "lunch")).toHaveClass(/has-days/);
  await meal(page, "dinner").locator(".mealhead").click();
  await expect(meal(page, "dinner").locator(".mealbody")).toBeHidden();
  await meal(page, "lunch").locator(".mealhead").click();
  await expect(day(page, "lunch", "2026-10-25")).toHaveAttribute("aria-pressed", "true");
});

test("one person registers for meals and sees a short confirmation", async ({ page }) => {
  const state = await open(page);
  await expect(page.getByRole("heading", { name: "Yogi Prasad" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/diwali|allentown|mandal/i);
  await page.getByLabel("Your name").fill("  Amit   Patel ");
  await pick(page, "lunch", ...NOV_6_8);
  await pick(page, "dinner", ...NOV_6_8);
  await expect(summary(page, "dinner")).toHaveText("Nov 6–8 · 3 days");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();
  await expect(page.locator(".reg .summary")).toHaveText("Amit PatelLunch · Dinner — Nov 6–8");
  const [call] = state.calls;
  expect(call).toMatchObject({ action: "local-meals-submit", names: ["Amit   Patel"], mealDays: { lunch: NOV_6_8, dinner: NOV_6_8 }, website: "" });
  expect(Object.keys(call.mealDays)).toEqual(["lunch", "dinner"]);   // breakfast was never chosen
  expect(call.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(call.id).toBeUndefined();
});

test("lunch can be for one stretch of days and dinner for another", async ({ page }) => {
  const state = await open(page);
  await page.getByLabel("Your name").fill("Amit Patel");
  await pick(page, "lunch", "2026-10-25", "2026-10-26", "2026-10-27");
  await pick(page, "dinner", "2026-11-07", "2026-11-08");
  await expect(summary(page, "dinner")).toHaveText("Nov 7–8 · 2 days");
  await expect(summary(page, "breakfast")).toHaveText("Tap to choose days");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".reg .summary span")).toHaveText(["Lunch — Oct 25–27", "Dinner — Nov 7–8"]);
  expect(state.calls[0].mealDays).toEqual({ lunch: ["2026-10-25", "2026-10-26", "2026-10-27"], dinner: ["2026-11-07", "2026-11-08"] });
});

test("days that are not next to each other can be chosen, and each tap toggles one day", async ({ page }) => {
  await open(page);
  await pick(page, "lunch", "2026-10-25", "2026-10-27", "2026-11-01", "2026-10-27");
  await expect(summary(page, "lunch")).toHaveText("Oct 25, Nov 1 · 2 days");
  await expect(day(page, "lunch", "2026-10-25")).toHaveAttribute("aria-pressed", "true");
  await expect(day(page, "lunch", "2026-10-27")).toHaveAttribute("aria-pressed", "false");
  await pick(page, "lunch", "2026-10-30", "2026-10-31");
  await expect(summary(page, "lunch")).toHaveText("Oct 25, Oct 30 – Nov 1 · 4 days");
  await expect(day(page, "dinner", "2026-10-25")).toHaveAttribute("aria-pressed", "false");   // each meal keeps its own days
});

test("sliding a finger across days selects the whole stretch, and sliding from a chosen day clears it", async ({ page }) => {
  await open(page);
  await expand(page, "lunch");
  const centre = async iso => { await day(page, "lunch", iso).scrollIntoViewIfNeeded(); const box = await day(page, "lunch", iso).boundingBox(); return [box.x + box.width / 2, box.y + box.height / 2]; };
  const slide = async (from, to) => { await centre(to); const [x1, y1] = await centre(from), [x2, y2] = await centre(to); await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 }); await page.mouse.move(x2, y2, { steps: 4 }); await page.mouse.up(); };
  await slide("2026-11-03", "2026-11-06");
  await expect(summary(page, "lunch")).toHaveText("Nov 3–6 · 4 days");
  await slide("2026-11-05", "2026-11-06");   // starts on a chosen day, so it clears
  await expect(summary(page, "lunch")).toHaveText("Nov 3–4 · 2 days");
  await slide("2026-11-08", "2026-11-04");   // backwards works too
  await expect(summary(page, "lunch")).toHaveText("Nov 3–8 · 6 days");
  await slide("2026-11-10", "2026-11-12");
  await expect(summary(page, "lunch")).toHaveText("Nov 3–8, Nov 10–12 · 9 days");
  await expect(day(page, "lunch", "2026-11-12")).toHaveAttribute("aria-pressed", "true");   // a drag is not also a tap
  await expect(summary(page, "dinner")).toHaveText("Tap to choose days");
});

test("on a touch screen a tap picks a day, a sideways swipe selects a stretch, and an up-down swipe only scrolls", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "raw touch events need the Chromium protocol");
  await open(page);
  await expand(page, "lunch");
  await day(page, "lunch", "2026-11-10").tap();
  await expect(summary(page, "lunch")).toHaveText("Nov 10 · 1 day");
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  const centre = async iso => { await day(page, "lunch", iso).scrollIntoViewIfNeeded(); const box = await day(page, "lunch", iso).boundingBox(); return [box.x + box.width / 2, box.y + box.height / 2]; };
  const [x2] = await centre("2026-11-06"), [x1, y1] = await centre("2026-11-03");
  await touch("touchStart", x1, y1);
  for (let i = 1; i <= 8; i++) await touch("touchMove", x1 + ((x2 - x1) * i) / 8, y1);
  await touch("touchEnd");
  await expect(summary(page, "lunch")).toHaveText("Nov 3–6, Nov 10 · 5 days");
  // Swiping up and down moves the page and leaves the choice alone.
  await page.evaluate(() => scrollTo(0, 0));
  const box = await day(page, "lunch", "2026-10-28").boundingBox(), [x3, y3] = [box.x + box.width / 2, box.y + box.height / 2];
  await touch("touchStart", x3, y3);
  for (let i = 1; i <= 8; i++) await touch("touchMove", x3, y3 - i * 25);
  await touch("touchEnd");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await expect(summary(page, "lunch")).toHaveText("Nov 3–6, Nov 10 · 5 days");
});

test("Clear is the only shortcut, it is small, and it empties just that meal; past days cannot be chosen", async ({ page }) => {
  await open(page);
  await expand(page, "lunch");
  await expect(meal(page, "lunch").locator(".chip")).toHaveText(["Clear"]);
  await expect(page.getByRole("button", { name: /Next 7 days|Weekends|Same for all meals/ })).toHaveCount(0);
  const size = await meal(page, "lunch").locator(".chip").evaluate(el => el.getBoundingClientRect().height);
  expect(size).toBeLessThanOrEqual(34);
  await expect(day(page, "lunch", "2026-10-22")).toBeDisabled();
  await expect(day(page, "lunch", "2026-10-23")).toBeEnabled();
  await expect(day(page, "lunch", "2026-10-23")).toHaveClass(/today/);
  await pick(page, "lunch", "2026-10-25", "2026-10-26");
  await pick(page, "dinner", "2026-10-25");
  await expand(page, "lunch");
  await meal(page, "lunch").getByRole("button", { name: "Clear" }).click();
  await expect(summary(page, "lunch")).toHaveText("Tap to choose days");
  await expect(summary(page, "dinner")).toHaveText("Oct 25 · 1 day");
});

test("the calendars end on Nov 14 and start in the week of the current day", async ({ page }) => {
  await open(page);
  for (const name of ["breakfast", "lunch", "dinner"]) {
    await expand(page, name);
    await expect(meal(page, name).locator(".month h3")).toHaveText(["October 2026", "November 2026"]);
    await expect(day(page, name, "2026-11-14")).toBeEnabled();
    await expect(day(page, name, "2026-11-15")).toHaveCount(0);
    await expect(day(page, name, "2026-12-01")).toHaveCount(0);
    // Friday Oct 23: the first row is the week of Sunday Oct 18, and nothing earlier is drawn.
    await expect(meal(page, name).locator("button[data-day]").first()).toHaveAttribute("data-day", "2026-10-18");
    await expect(day(page, name, "2026-10-18")).toBeDisabled();
    await expect(day(page, name, "2026-10-17")).toHaveCount(0);
  }
});

test("the first week follows the day, including a page left open past midnight", async ({ page }) => {
  await open(page, { now: "2026-11-11T16:00:00Z" });     // Wednesday Nov 11
  await expand(page, "dinner");
  await expect(meal(page, "dinner").locator(".month h3")).toHaveText(["November 2026"]);
  await expect(meal(page, "dinner").locator("button[data-day]").first()).toHaveAttribute("data-day", "2026-11-08");
  await expect(meal(page, "dinner").locator("button[data-day]")).toHaveCount(7);
  await expect(meal(page, "dinner").locator("button[data-day]").last()).toHaveAttribute("data-day", "2026-11-14");
  await expect(day(page, "dinner", "2026-11-10")).toBeDisabled();
  await pick(page, "dinner", "2026-11-12");
  await page.clock.fastForward(24 * 3600 * 1000);       // Thursday Nov 12 becomes the first day available
  await page.evaluate(() => dispatchEvent(new Event("focus")));
  await expect(day(page, "dinner", "2026-11-11")).toBeDisabled();
  await expect(day(page, "dinner", "2026-11-12")).toHaveClass(/today/);
  await page.clock.fastForward(3 * 24 * 3600 * 1000);   // Sunday Nov 15: the form is over
  await page.evaluate(() => dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Registration has closed" })).toBeVisible();
});

test("family members can be added and removed, and the summary counts them", async ({ page }) => {
  const state = await open(page);
  await page.getByLabel("Your name").fill("Amit Patel");
  await page.getByRole("button", { name: "+ Family member" }).click();
  await page.getByLabel("Family member name").nth(0).fill("Sheetal Patel");
  await page.getByRole("button", { name: "+ Family member" }).click();
  await page.getByLabel("Family member name").nth(1).fill("Temporary Name");
  await page.getByRole("button", { name: "Remove family member" }).nth(1).click();
  await page.getByRole("button", { name: "+ Family member" }).click();
  await page.getByLabel("Family member name").nth(1).fill("");
  await pick(page, "breakfast", "2026-11-07");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".reg .summary")).toHaveText("Amit Patel + 1Breakfast — Nov 7");
  expect(state.calls[0].names).toEqual(["Amit Patel", "Sheetal Patel"]);
});

test("missing details are explained in a few words and nothing is sent", async ({ page }) => {
  const state = await open(page);
  const error = page.getByRole("alert");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(error).toHaveText("Add your name.");
  await page.getByLabel("Your name").fill("Amit Patel");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(error).toHaveText("Choose days for a meal.");
  expect(state.calls).toHaveLength(0);
});

test("a returning visitor sees their registrations, edits one meal's days, adds another, and can cancel", async ({ page }) => {
  const state = await open(page);
  await page.getByLabel("Your name").fill("Amit Patel");
  await pick(page, "lunch", ...NOV_6_8);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();

  await page.reload();
  await expect(page.locator(".reg .summary")).toHaveText("Amit PatelLunch — Nov 6–8");
  expect(state.calls.at(-1)).toMatchObject({ action: "local-meals-lookup", editKey: KEY });

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Your name")).toHaveValue("Amit Patel");
  await expect(summary(page, "lunch")).toHaveText("Nov 6–8 · 3 days");
  await expect(summary(page, "dinner")).toHaveText("Tap to choose days");
  await pick(page, "lunch", "2026-11-07");                  // not coming for lunch that day after all
  await pick(page, "dinner", "2026-11-13", "2026-11-14");  // and dinner on two other days
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".reg .summary span")).toHaveText(["Lunch — Nov 6, Nov 8", "Dinner — Nov 13–14"]);
  expect(state.calls.at(-1)).toMatchObject({ action: "local-meals-submit", id: "a".repeat(23) + "1", editKey: KEY, mealDays: { lunch: ["2026-11-06", "2026-11-08"], dinner: ["2026-11-13", "2026-11-14"] } });
  expect(state.regs.size).toBe(1);

  // Someone coming on other days is a second registration; the first stays editable.
  await page.getByRole("button", { name: "+ Add another person or days" }).click();
  await expect(page.getByLabel("Your name")).toHaveValue("");
  await expect(page.locator(".mealcard .msum")).toHaveText(["Tap to choose days", "Tap to choose days", "Tap to choose days"]);
  await page.getByLabel("Your name").fill("Sheetal Patel");
  await pick(page, "breakfast", "2026-11-14");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".reg")).toHaveCount(2);
  expect(state.calls.at(-1).id).toBeUndefined();
  expect(state.regs.size).toBe(2);

  page.once("dialog", dialog => dialog.accept());
  await page.locator(".reg").first().getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".reg")).toHaveCount(1);
  expect(state.regs.size).toBe(1);
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".reg").first().getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Your name")).toBeVisible();
  expect(state.regs.size).toBe(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Thank you" })).toBeHidden();
});

test("a registration made before the day picker existed still opens, and moves to the new storage", async ({ page }) => {
  const id = "b".repeat(24);
  const state = await open(page, { stored: ["yp-diwali-meals", JSON.stringify({ id, editKey: KEY })], seed: [{ id, names: ["Old Entry"], mealDays: { dinner: ["2026-11-02", "2026-11-03"] } }] });
  await expect(page.locator(".reg .summary")).toHaveText("Old EntryDinner — Nov 2–3");
  expect(await page.evaluate(() => [localStorage.getItem("yp-diwali-meals"), JSON.parse(localStorage.getItem("yp-meals")).length])).toEqual([null, 1]);
  expect(state.calls).toHaveLength(1);
});

test("a registration that no longer exists is forgotten, and errors and retries are handled calmly", async ({ page }) => {
  const state = await open(page, { fail: (body, n) => (n === 1 ? { ok: false, error: "Not sent. Check your connection and try again." } : null) });
  await page.getByLabel("Your name").fill("Amit Patel");
  await pick(page, "lunch", "2026-11-06");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("alert")).toHaveText("Not sent. Check your connection and try again.");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();
  expect(state.calls[1].requestId).toBe(state.calls[0].requestId);   // the retry is recognised as the same entry

  state.regs.clear();                                                // the team removed it
  await page.reload();
  await expect(page.getByLabel("Your name")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thank you" })).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("yp-meals")))).toEqual([]);
});

test("a lookup that fails for network reasons keeps the saved registration instead of forgetting it", async ({ page }) => {
  const id = "c".repeat(24);
  await open(page, { stored: ["yp-meals", JSON.stringify([{ id, editKey: KEY }])], seed: [], fail: body => body.action === "local-meals-lookup" ? { ok: false, error: "Not sent. Check your connection and try again." } : null });
  await expect(page.getByLabel("Your name")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("yp-meals")))).toEqual([{ id, editKey: KEY }]);
});

test("names are shown as text, the decoy field is hidden from people, and the page fits a phone", async ({ page }) => {
  await open(page);
  await page.getByLabel("Your name").fill("<img src=x onerror=alert(1)>");
  await pick(page, "lunch", "2026-11-06");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".reg img")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#ref-code")).not.toBeInViewport();
  await expand(page, "lunch");
  expect(await page.evaluate(() => [document.documentElement.scrollWidth <= document.documentElement.clientWidth, getComputedStyle(document.getElementById("me")).fontSize])).toEqual([true, "16px"]);
  // Every field and the calendar stay inside the card, and each target is easy to hit with a thumb.
  const edges = await page.evaluate(() => { const right = selector => document.querySelector(selector).getBoundingClientRect().right; return { limit: right("#submit"), fields: ["#me", "[data-meal=lunch] .grid", "#add", ".mealhead"].map(right) }; });
  for (const edge of edges.fields) expect(edge).toBeLessThanOrEqual(edges.limit + 0.5);
  const heights = await page.evaluate(() => ["#add", "#submit", "#me", ".mealhead", "[data-meal=lunch] button[data-day='2026-11-06']"].map(selector => document.querySelector(selector).getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(40);
  const widths = await page.evaluate(() => [...document.querySelectorAll("[data-meal=lunch] button.day:not(:disabled)")].map(b => b.getBoundingClientRect().width));
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(36);
});
