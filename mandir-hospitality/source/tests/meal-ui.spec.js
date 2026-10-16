import { test, expect } from "@playwright/test";
import { guestsFromRows } from "../src/lib/sheets.js";

const API = "https://database.test/api";
const ADMIN = "synthetic-meal-admin";
const DAY = "2026-10-18";
const TEAM_LINK = "/#kitchen?team=yogi-prasad";

// Model the database's canonical meal snapshot and revision-bearing mutations.
// All names and records are synthetic; no request reaches production services.
function createFixture() {
  const headers = Array(32).fill("");
  Object.assign(headers, { 0: "Registration ID", 8: "Attendee Full Name", 29: "Lodging", 30: "Room No.", 31: "Room Code" });
  const rows = ["Amber Diner", "Bharat Diner", "Chandra Late Arrival"].map((name, index) => {
    const row = Array(32).fill("");
    Object.assign(row, { 0: `SYNTHETIC-MEAL-${index}`, 8: name, 9: "Self", 11: "Car", 12: `10/18/2026 ${index === 2 ? "4:00 PM" : "9:00 AM"}`, 13: "10/20/2026", 18: "YES", 20: "YES", 24: "Confirmed" });
    return row;
  });
  const guests = guestsFromRows([headers, ...rows]);
  const fixture = {
    requests: [], guests, plans: [], overrides: [],
    settings: { teamEditingEnabled: true, automaticQuestionsEnabled: false, revision: "" },
  };
  let revision = 0;
  fixture.request = (request) => {
    fixture.requests.push(request);
    const role = request.accessKey === ADMIN ? "admin" : "viewer";
    if (request.action === "meal-settings") {
      if (role !== "admin") throw Error("Admin access is required to change meal settings.");
      expect(request.expectedRevision).toBe(fixture.settings.revision);
      fixture.settings = { teamEditingEnabled: request.teamEditingEnabled, automaticQuestionsEnabled: request.automaticQuestionsEnabled, revision: `settings-${++revision}` };
    } else if (["meal-override", "meal-plan"].includes(request.action)) {
      if (role !== "admin" && !fixture.settings.teamEditingEnabled) throw Error("Team editing is disabled.");
      expect(request.requestId).toBeTruthy();
      const records = request.action === "meal-plan" ? fixture.plans : fixture.overrides;
      const previous = records.find(record => record.day === request.day && record.meal === request.meal && (request.action === "meal-plan" || record.identity === request.identity));
      expect(request.expectedRevision).toBe(previous?.revision || "");
      const record = request.action === "meal-plan"
        ? { day: request.day, meal: request.meal, adjustment: request.adjustment, buffer: request.buffer }
        : { identity: request.identity, day: request.day, meal: request.meal, included: request.included };
      record.revision = `meal-${++revision}`;
      if (previous) records.splice(records.indexOf(previous), 1, record);
      else records.push(record);
    } else {
      expect(["snapshot", "trip-display-read"]).toContain(request.action);
    }
    return {
      ok: true, role, refreshedAt: "2026-10-18T14:00:00Z", tripDisplay: [],
      guests: guests.map(guest => ({ ...guest, mealOverrides: fixture.overrides.filter(record => record.identity === guest.sourceIdentity) })),
      meals: {
        settings: fixture.settings, plans: fixture.plans,
        ...(role === "admin" ? { survey: { configured: false, families: 1, invitations: {}, responses: [
          { identity: "synthetic-response", name: "Synthetic Family Attendee", arrivalDate: DAY, arrival: "morning", fasting: "no" },
        ] } } : {}),
      },
      sync: { source: "sqlite", pending: 0, lastSyncedAt: "2026-10-18T14:00:00Z", error: "" },
    };
  };
  return fixture;
}

async function setup({ page, context }, { admin = false, team = true } = {}) {
  const fixture = createFixture();
  if (admin) await context.addInitScript(key => sessionStorage.setItem("mandir.admin-access.v1", key), ADMIN);
  await context.route("https://script.google.com/**", route => route.abort());
  await context.route("https://*.workers.dev/**", route => route.abort());
  await context.route(API, async route => route.fulfill({ json: fixture.request(route.request().postDataJSON()) }));
  await page.clock.setFixedTime(new Date("2026-10-18T14:00:00Z"));
  await page.goto(team ? TEAM_LINK : "/#kitchen");
  await expect(page.getByRole("heading", { name: "Lunch service" })).toBeVisible();
  await expect(page.locator(".kit-big-number")).toHaveText("2guests");
  return fixture;
}

test("team removes a diner with the red minus, restores them, and adds an excluded diner", async ({ page, context }) => {
  const fixture = await setup({ page, context });
  const remove = page.getByRole("button", { name: /^Remove Amber Diner from lunch/ });
  await expect(remove).toHaveClass(/danger/);
  await expect(remove.locator("svg.lucide-minus")).toHaveCount(1);
  await remove.click();
  await expect(page.locator(".kit-big-number")).toHaveText("1guests");
  await expect(page.getByRole("list", { name: "Lunch diners", exact: true })).not.toContainText("Amber Diner");
  await expect(page.getByRole("list", { name: "Guests not counted for lunch" })).toContainText("Removed manually");
  await page.reload();
  await expect(page.locator(".kit-big-number")).toHaveText("1guests");
  await page.getByRole("button", { name: /^Restore automatic planning for Amber Diner/ }).click();
  await expect(page.locator(".kit-big-number")).toHaveText("2guests");
  await page.getByRole("button", { name: /^Add Chandra Late Arrival to lunch/ }).click();
  await expect(page.locator(".kit-big-number")).toHaveText("3guests");
  expect(fixture.requests.filter(request => request.action === "meal-override").map(request => request.included)).toEqual([false, null, true]);
  expect(fixture.requests.every(request => request.accessKey === "")).toBe(true);
});

test("ordinary dashboard visitors can remove, restore and add diners without a team link", async ({ page, context }) => {
  const fixture = await setup({ page, context }, { team: false });
  await page.getByRole('button', {name:/^Remove Amber Diner from lunch/}).click();
  await expect(page.locator('.kit-big-number')).toHaveText('1guests');
  await page.getByRole('button', {name:/^Restore automatic planning for Amber Diner/}).click();
  await expect(page.locator('.kit-big-number')).toHaveText('2guests');
  await page.getByRole('button', {name:/^Add Chandra Late Arrival to lunch/}).click();
  await expect(page.locator('.kit-big-number')).toHaveText('3guests');
  expect(fixture.requests.filter(r=>r.action==='meal-override').map(r=>r.included)).toEqual([false,null,true]);
  expect(fixture.requests.every(r=>r.accessKey==='')).toBe(true);
  await expect(page.getByRole('button',{name:'Meal settings',exact:true})).toHaveCount(0);
  await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Accommodations',exact:true}).click();
  await expect(page.getByRole('button',{name:'Assign guest',exact:true})).toHaveCount(0);
});

test("dining count and buffer persist in shared records and appear in another tab", async ({ page, context }) => {
  const fixture = await setup({ page, context });
  await page.getByRole("button", { name: "Adjust dining count", exact: true }).click();
  await page.getByRole("spinbutton", { name: /^Dining count/ }).fill("12");
  await page.getByRole("spinbutton", { name: /^Extra preparation buffer/ }).fill("25");
  await page.getByRole("button", { name: "Save dining count", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".kit-big-number")).toHaveText("12guests");
  await expect(page.locator(".kit-prepare-target")).toContainText("15 plates");
  expect(fixture.plans).toMatchObject([{ day: DAY, meal: "lunch", adjustment: 10, buffer: 25 }]);
  const other = await context.newPage();
  await other.goto(TEAM_LINK);
  await other.getByLabel("Choose planning date", { exact: true }).fill(DAY);
  await expect(other.locator(".kit-big-number")).toHaveText("12guests");
  await expect(other.locator(".kit-prepare-target")).toContainText("15 plates");
  await expect(other.locator(".kit-manual-adjustment")).toContainText("+10");
});

test("team link suppresses stored admin authority and cannot edit rooms or meal settings", async ({ page, context }) => {
  const fixture = await setup({ page, context }, { admin: true, team: true });
  await expect(page.getByRole("button", { name: "Adjust dining count", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Meal settings", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Connected · Meal editing access", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Accommodations", exact: true }).click();
  await page.getByRole("button", { name: "Guest list", exact: true }).click();
  await expect(page.locator(".sheet-attendee-list")).toContainText("Amber Diner");
  await expect(page.getByRole("button", { name: "Assign lodging", exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/#rooms\?team=yogi-prasad$/);
  expect(fixture.requests.every(request => request.accessKey === "")).toBe(true);
  expect(fixture.requests.filter(request => ["lodging", "guest", "meal-settings"].includes(request.action))).toHaveLength(0);
});

test("admin can disable team editing while retaining admin dining controls", async ({ page, context }) => {
  const fixture = await setup({ page, context }, { admin: true, team: false });
  await page.getByRole("button", { name: "Meal settings", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Attendee", exact: true })).toBeVisible();
  await expect(page.getByLabel("Send automatic WhatsApp meal questions", { exact: true })).toBeDisabled();
  // Controlled checkbox waits for the shared save response before changing.
  await page.getByLabel("Allow everyone to edit dining lists", { exact: true }).click();
  await expect(page.getByLabel("Allow everyone to edit dining lists", { exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByRole("button", { name: "Adjust dining count", exact: true })).toBeVisible();
  expect(fixture.settings.teamEditingEnabled).toBe(false);
  const team = await context.newPage();
  await team.goto(TEAM_LINK);
  await team.getByLabel("Choose planning date", { exact: true }).fill(DAY);
  await expect(team.locator(".kit-big-number")).toHaveText("2guests");
  await expect(team.getByRole("button", { name: "Adjust dining count", exact: true })).toHaveCount(0);
  await expect(team.locator(".kit-person-action")).toHaveCount(0);
  await expect(team.getByRole("button", { name: "Meal settings", exact: true })).toHaveCount(0);
  await expect(team.getByRole("status", { name: "Connected · View-only access", exact: true })).toBeVisible();
});

test("meal controls and count dialog fit a narrow mobile viewport", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await setup({ page, context });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Adjust dining count", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: /^Dining count/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(321);
  await page.screenshot({ path: test.info().outputPath("meal-count-mobile.png"), animations: "disabled" });
});
