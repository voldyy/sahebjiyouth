import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const PAGE = "https://form.test/diwali";
const API = "https://mandir-hospitality-api.usayouth.workers.dev/api";
const html = readFileSync(new URL("../local-meals-form/index.html", import.meta.url), "utf8");
const cors = { "Access-Control-Allow-Origin": "https://form.test", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

// A tiny stand-in for the Worker: it keeps one registration per id and checks the edit key.
async function open(page, { fail = null, stored = null, seed = [] } = {}) {
  const state = { calls: [], regs: new Map(seed.map(reg => [reg.id, reg])) };
  if (stored) await page.addInitScript(([key, value]) => localStorage.setItem(key, value), stored);
  await page.clock.install({ time: new Date("2026-10-23T16:00:00Z") });
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
      state.regs.set(id, { id, names: body.names, days: body.days, meals: body.meals });
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
const day = (page, iso) => page.locator(`button[data-day="${iso}"]`);
const pick = async (page, ...days) => { for (const iso of days) await day(page, iso).click(); };
const KEY = "k".repeat(64);

test("one person registers for days and meals and sees a short confirmation", async ({ page }) => {
  const state = await open(page);
  await expect(page.getByRole("heading", { name: "Yogi Prasad" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/diwali|allentown|mandal/i);
  await page.getByLabel("Your name").fill("  Amit   Patel ");
  await pick(page, "2026-11-06", "2026-11-07", "2026-11-08");
  await expect(page.locator("#picked")).toHaveText("Nov 6–8 · 3 days");
  await page.getByRole("checkbox", { name: /Lunch/ }).check();
  await page.getByRole("checkbox", { name: /Dinner/ }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();
  await expect(page.locator(".reg .summary")).toHaveText("Amit PatelNov 6–8 · Lunch · Dinner");
  const [call] = state.calls;
  expect(call).toMatchObject({ action: "local-meals-submit", names: ["Amit   Patel"], days: ["2026-11-06", "2026-11-07", "2026-11-08"], meals: ["lunch", "dinner"], website: "" });
  expect(call.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(call.id).toBeUndefined();
});

test("days that are not next to each other can be chosen, and each tap toggles one day", async ({ page }) => {
  const state = await open(page);
  await page.getByLabel("Your name").fill("Amit Patel");
  await pick(page, "2026-10-25", "2026-10-27", "2026-11-01", "2026-10-27");
  await expect(page.locator("#picked")).toHaveText("Oct 25, Nov 1 · 2 days");
  await expect(day(page, "2026-10-25")).toHaveAttribute("aria-pressed", "true");
  await expect(day(page, "2026-10-27")).toHaveAttribute("aria-pressed", "false");
  await pick(page, "2026-10-30", "2026-10-31");
  await expect(page.locator("#picked")).toHaveText("Oct 25, Oct 30 – Nov 1 · 4 days");
  await page.getByRole("checkbox", { name: /Lunch/ }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".reg .summary")).toHaveText("Amit PatelOct 25, Oct 30 – Nov 1 · Lunch");
  expect(state.calls[0].days).toEqual(["2026-10-25", "2026-10-30", "2026-10-31", "2026-11-01"]);
});

test("sliding a finger across days selects the whole stretch, and sliding from a chosen day clears it", async ({ page }) => {
  await open(page);
  const centre = async iso => { await day(page, iso).scrollIntoViewIfNeeded(); const box = await day(page, iso).boundingBox(); return [box.x + box.width / 2, box.y + box.height / 2]; };
  const slide = async (from, to) => { await centre(to); const [x1, y1] = await centre(from), [x2, y2] = await centre(to); await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 }); await page.mouse.move(x2, y2, { steps: 4 }); await page.mouse.up(); };
  await slide("2026-11-03", "2026-11-06");
  await expect(page.locator("#picked")).toHaveText("Nov 3–6 · 4 days");
  await slide("2026-11-05", "2026-11-06");   // starts on a chosen day, so it clears
  await expect(page.locator("#picked")).toHaveText("Nov 3–4 · 2 days");
  await slide("2026-11-08", "2026-11-04");   // backwards works too
  await expect(page.locator("#picked")).toHaveText("Nov 3–8 · 6 days");
  await slide("2026-11-10", "2026-11-12");
  await expect(page.locator("#picked")).toHaveText("Nov 3–8, Nov 10–12 · 9 days");
  // A drag is not also counted as a tap on the last day.
  await expect(day(page, "2026-11-12")).toHaveAttribute("aria-pressed", "true");
});

test("on a touch screen a tap picks a day, a sideways swipe selects a stretch, and an up-down swipe only scrolls", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "raw touch events need the Chromium protocol");
  await open(page);
  await day(page, "2026-11-10").tap();
  await expect(page.locator("#picked")).toHaveText("Nov 10 · 1 day");
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  const centre = async iso => { await day(page, iso).scrollIntoViewIfNeeded(); const box = await day(page, iso).boundingBox(); return [box.x + box.width / 2, box.y + box.height / 2]; };
  const [x2, y2] = await centre("2026-11-06"), [x1, y1] = await centre("2026-11-03");
  await touch("touchStart", x1, y1);
  for (let i = 1; i <= 8; i++) await touch("touchMove", x1 + ((x2 - x1) * i) / 8, y1);
  await touch("touchEnd");
  await expect(page.locator("#picked")).toHaveText("Nov 3–6, Nov 10 · 5 days");
  // Swiping up and down moves the page and leaves the choice alone.
  const [x3, y3] = await centre("2026-10-28"), before = await page.evaluate(() => scrollY);
  await touch("touchStart", x3, y3 + 120);
  for (let i = 1; i <= 8; i++) await touch("touchMove", x3, y3 + 120 - i * 25);
  await touch("touchEnd");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
  await expect(page.locator("#picked")).toHaveText("Nov 3–6, Nov 10 · 5 days");
});

test("quick choices, past days and further months", async ({ page }) => {
  await open(page);
  await expect(day(page, "2026-10-22")).toBeDisabled();
  await expect(day(page, "2026-10-23")).toBeEnabled();
  await expect(day(page, "2026-10-23")).toHaveClass(/today/);
  await page.getByRole("button", { name: "Next 7 days" }).click();
  await expect(page.locator("#picked")).toHaveText("Oct 23–29 · 7 days");
  await page.getByRole("button", { name: "Weekends" }).click();
  await expect(page.locator("#picked")).toHaveText("Oct 24–25, Oct 31 – Nov 1, Nov 7–8, Nov 14–15, Nov 21–22 · 10 days");
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.locator("#picked")).toHaveText("");
  await expect(day(page, "2026-12-05")).toHaveCount(0);
  const more = page.getByRole("button", { name: "Show next month" });
  await more.click();
  await expect(day(page, "2026-12-05")).toBeVisible();
  await more.click(); await more.click();
  await expect(more).toBeHidden();
  await expect(day(page, "2027-02-20")).toBeEnabled();
  await expect(day(page, "2027-02-21")).toBeDisabled();   // four months ahead is the limit
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
  await pick(page, "2026-11-07");
  await page.getByRole("checkbox", { name: /Breakfast/ }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".reg .summary")).toHaveText("Amit Patel + 1Nov 7 · Breakfast");
  expect(state.calls[0].names).toEqual(["Amit Patel", "Sheetal Patel"]);
});

test("missing details are explained in a few words and nothing is sent", async ({ page }) => {
  const state = await open(page);
  const error = page.getByRole("alert");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(error).toHaveText("Add your name.");
  await page.getByLabel("Your name").fill("Amit Patel");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(error).toHaveText("Choose your days.");
  await pick(page, "2026-11-06");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(error).toHaveText("Choose a meal.");
  expect(state.calls).toHaveLength(0);
});

test("a returning visitor sees their registrations, edits one with the saved key, adds another, and can cancel", async ({ page }) => {
  const state = await open(page);
  await page.getByLabel("Your name").fill("Amit Patel");
  await pick(page, "2026-11-06", "2026-11-07", "2026-11-08");
  await page.getByRole("checkbox", { name: /Lunch/ }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();

  await page.reload();
  await expect(page.locator(".reg .summary")).toHaveText("Amit PatelNov 6–8 · Lunch");
  expect(state.calls.at(-1)).toMatchObject({ action: "local-meals-lookup", editKey: KEY });

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Your name")).toHaveValue("Amit Patel");
  await expect(day(page, "2026-11-07")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("checkbox", { name: /Lunch/ })).toBeChecked();
  await pick(page, "2026-11-07");   // not coming that day after all
  await page.getByRole("checkbox", { name: /Dinner/ }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".reg .summary")).toHaveText("Amit PatelNov 6, Nov 8 · Lunch · Dinner");
  expect(state.calls.at(-1)).toMatchObject({ action: "local-meals-submit", id: "a".repeat(23) + "1", editKey: KEY, days: ["2026-11-06", "2026-11-08"], meals: ["lunch", "dinner"] });
  expect(state.regs.size).toBe(1);

  // Someone coming on other days is a second registration; the first stays editable.
  await page.getByRole("button", { name: "+ Add another person or days" }).click();
  await expect(page.getByLabel("Your name")).toHaveValue("");
  await expect(page.locator("#picked")).toHaveText("");
  await page.getByLabel("Your name").fill("Sheetal Patel");
  await pick(page, "2026-11-14");
  await page.getByRole("checkbox", { name: /Breakfast/ }).check();
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
  const state = await open(page, { stored: ["yp-diwali-meals", JSON.stringify({ id, editKey: KEY })], seed: [{ id, names: ["Old Entry"], days: ["2026-11-02", "2026-11-03"], meals: ["dinner"] }] });
  await expect(page.locator(".reg .summary")).toHaveText("Old EntryNov 2–3 · Dinner");
  expect(await page.evaluate(() => [localStorage.getItem("yp-diwali-meals"), JSON.parse(localStorage.getItem("yp-meals")).length])).toEqual([null, 1]);
  expect(state.calls).toHaveLength(1);
});

test("a registration that no longer exists is forgotten, and errors and retries are handled calmly", async ({ page }) => {
  const state = await open(page, { fail: (body, n) => (n === 1 ? { ok: false, error: "Not sent. Check your connection and try again." } : null) });
  await page.getByLabel("Your name").fill("Amit Patel");
  await pick(page, "2026-11-06");
  await page.getByRole("checkbox", { name: /Lunch/ }).check();
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
  await pick(page, "2026-11-06");
  await page.getByRole("checkbox", { name: /Lunch/ }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".reg img")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#ref-code")).not.toBeInViewport();
  expect(await page.evaluate(() => [document.documentElement.scrollWidth <= document.documentElement.clientWidth, getComputedStyle(document.getElementById("me")).fontSize])).toEqual([true, "16px"]);
  // Every field and the whole calendar stay inside the card, and each target is easy to hit with a thumb.
  const edges = await page.evaluate(() => { const right = selector => document.querySelector(selector).getBoundingClientRect().right; return { limit: right("#submit"), fields: ["#me", "#cal .grid", "#add"].map(right) }; });
  for (const edge of edges.fields) expect(edge).toBeLessThanOrEqual(edges.limit + 0.5);
  const heights = await page.evaluate(() => ["#add", "#submit", "#me", "button[data-day='2026-11-06']", ".chip"].map(selector => document.querySelector(selector).getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(40);
  const widths = await page.evaluate(() => [...document.querySelectorAll("button.day:not(:disabled)")].map(b => b.getBoundingClientRect().width));
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(36);
});
