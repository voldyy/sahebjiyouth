import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const PAGE = "https://form.test/diwali";
const API = "https://mandir-hospitality-api.usayouth.workers.dev/api";
const html = readFileSync(new URL("../local-meals-form/index.html", import.meta.url), "utf8");
const cors = { "Access-Control-Allow-Origin": "https://form.test", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

// A tiny stand-in for the Worker: it keeps one registration per id and checks the edit key.
async function open(page, { fail = null } = {}) {
  const state = { calls: [], regs: new Map() };
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
      state.regs.set(id, { id, names: body.names, from: body.from, to: body.to, meals: body.meals });
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
const fillDates = async (page, from = "2026-11-06", to = "2026-11-08") => { await page.getByLabel("From").fill(from); await page.getByLabel("To").fill(to); };

test("one person registers for dates and meals and sees a short confirmation", async ({ page }) => {
  const state = await open(page);
  await expect(page.getByRole("heading", { name: "Yogi Prasad" })).toBeVisible();
  await page.getByLabel("Your name").fill("  Amit   Patel ");
  await fillDates(page);
  await page.getByRole("checkbox", { name: /Lunch/ }).check();
  await page.getByRole("checkbox", { name: /Dinner/ }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();
  await expect(page.locator("#summary")).toHaveText("Amit PatelNov 6 – Nov 8 · Lunch · Dinner");
  const [call] = state.calls;
  expect(call).toMatchObject({ action: "local-meals-submit", names: ["Amit   Patel"], from: "2026-11-06", to: "2026-11-08", meals: ["lunch", "dinner"], website: "" });
  expect(call.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(call.id).toBeUndefined();
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
  await fillDates(page, "2026-11-07", "2026-11-07");
  await page.getByRole("checkbox", { name: /Breakfast/ }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator("#summary")).toHaveText("Amit Patel + 1Nov 7 · Breakfast");
  expect(state.calls[0].names).toEqual(["Amit Patel", "Sheetal Patel"]);
});

test("missing details are explained in a few words and nothing is sent", async ({ page }) => {
  const state = await open(page);
  const error = page.getByRole("alert");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(error).toHaveText("Add your name.");
  await page.getByLabel("Your name").fill("Amit Patel");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(error).toHaveText("Choose your dates.");
  await fillDates(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(error).toHaveText("Choose a meal.");
  await page.getByLabel("To").fill("2026-11-05");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(error).toHaveText("The last day is before the first day.");
  expect(state.calls).toHaveLength(0);
});

test("choosing a first day fills the last day so a single day takes two taps", async ({ page }) => {
  await open(page);
  await page.getByLabel("From").fill("2026-11-06");
  await expect(page.getByLabel("To")).toHaveValue("2026-11-06");
  await page.getByLabel("To").fill("2026-11-08");
  await page.getByLabel("From").fill("2026-11-07");
  await expect(page.getByLabel("To")).toHaveValue("2026-11-08");
});

test("a returning visitor sees their registration, edits it with the saved key, and can cancel it", async ({ page }) => {
  const state = await open(page);
  await page.getByLabel("Your name").fill("Amit Patel");
  await fillDates(page);
  await page.getByRole("checkbox", { name: /Lunch/ }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("heading", { name: "Thank you" })).toBeVisible();

  await page.reload();
  await expect(page.locator("#summary")).toHaveText("Amit PatelNov 6 – Nov 8 · Lunch");
  expect(state.calls.at(-1)).toMatchObject({ action: "local-meals-lookup", editKey: "k".repeat(64) });

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Your name")).toHaveValue("Amit Patel");
  await expect(page.getByLabel("From")).toHaveValue("2026-11-06");
  await expect(page.getByRole("checkbox", { name: /Lunch/ })).toBeChecked();
  await page.getByRole("checkbox", { name: /Dinner/ }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#summary")).toHaveText("Amit PatelNov 6 – Nov 8 · Lunch · Dinner");
  expect(state.calls.at(-1)).toMatchObject({ action: "local-meals-submit", id: "a".repeat(23) + "1", editKey: "k".repeat(64), meals: ["lunch", "dinner"] });
  expect(state.regs.size).toBe(1);

  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Cancel registration" }).click();
  await expect(page.getByLabel("Your name")).toHaveValue("");
  expect(state.regs.size).toBe(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Thank you" })).toBeHidden();
});

test("a registration that no longer exists is forgotten, and errors and retries are handled calmly", async ({ page }) => {
  const state = await open(page, { fail: (body, n) => (n === 1 ? { ok: false, error: "Not sent. Check your connection and try again." } : null) });
  await page.getByLabel("Your name").fill("Amit Patel");
  await fillDates(page);
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
  expect(await page.evaluate(() => localStorage.getItem("yp-diwali-meals"))).toBeNull();
});

test("names are shown as text, the decoy field is hidden from people, and the page fits a phone", async ({ page }) => {
  await open(page);
  await page.getByLabel("Your name").fill("<img src=x onerror=alert(1)>");
  await fillDates(page);
  await page.getByRole("checkbox", { name: /Lunch/ }).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator("#summary img")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#ref-code")).not.toBeInViewport();
  expect(await page.evaluate(() => [document.documentElement.scrollWidth <= document.documentElement.clientWidth, getComputedStyle(document.getElementById("me")).fontSize])).toEqual([true, "16px"]);
  // Every field stays inside the card, including the date pickers that phones size generously.
  const edges = await page.evaluate(() => { const right = selector => document.querySelector(selector).getBoundingClientRect().right; return { limit: right("#submit"), fields: ["#me", "#from", "#to", "#add"].map(right) }; });
  for (const edge of edges.fields) expect(edge).toBeLessThanOrEqual(edges.limit + 0.5);
  const heights = await page.evaluate(() => ["#add", "#submit", "#from", "#to", "#me"].map(selector => document.querySelector(selector).getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
});
