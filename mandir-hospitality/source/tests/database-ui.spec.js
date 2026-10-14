import { test, expect } from "@playwright/test";
import { createHarness, TEST_ADMIN_KEY } from "./helpers/apps-script-harness.js";
import { transportGroups } from "../src/lib/transport.js";
import { guestsFromRows } from "../src/lib/sheets.js";
const API = "https://database.test/api";
async function setup(page, admin = true) {
  const headers = Array(32).fill(""); Object.assign(headers, { 0: "Registration ID", 8: "Attendee Full Name", 29: "Lodging", 30: "Room No.", 31: "Room Code" });
  const row = Array(32).fill(""); Object.assign(row, { 0: "SYNTHETIC-DB", 8: "Database Guest", 9: "Self", 11: "Flight", 12: "10/18/2026 2:00 PM", 13: "10/20/2026", 14: "PHL", 15: "AA123", 18: "YES", 20: "YES", 24: "Confirmed" });
  const h = createHarness([headers, row]);
  if (admin) await page.addInitScript(key => sessionStorage.setItem("mandir.admin-access.v1", key), TEST_ADMIN_KEY);
  const requests = [];
  await page.route(API, async route => {
    const req = route.request().postDataJSON(); requests.push(req);
    const result = h.request(req);
    result.sync = { source: "sqlite", pending: ["lodging", "transport", "resource"].includes(req.action) ? 1 : 0, lastSyncedAt: new Date().toISOString(), error: "" };
    await route.fulfill({ json: result });
  });
  await page.route('https://script.google.com/**', route => route.abort());
  await page.goto("/");
  await expect(page.locator(".mobile-guest-name").first()).toBeVisible();
  return { h, requests };
}
test("opens without a Google frame and confirms room saves with background Sheet status", async ({ page }) => {
  const { requests } = await setup(page);
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Accommodations', exact: true }).click();
  await page.getByRole('button', { name: 'Guest list', exact: true }).click();
  await page.getByRole('button', { name: 'Assign lodging', exact: true }).click();
  await page.getByLabel('Room number (AE)').selectOption('204');
  await page.getByLabel('Bed number').selectOption('1');
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status', {name:'Saved; syncing to Google Sheets',exact:true})).toBeVisible();
  await expect(page.locator('.sheet-connection')).toHaveCount(0);
  await expect(page.getByRole('button', {name:'Refresh',exact:true})).toHaveCount(0);
  expect(requests.filter(r => r.action === 'lodging')).toHaveLength(1);
});
test("viewer links stay view-only through the database client", async ({ page }) => {
  await setup(page, false);
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Accommodations', exact: true }).click();
  await page.getByRole('button', { name: 'Guest list', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Assign lodging', exact: true })).toHaveCount(0);
  await expect(page.getByRole('status', {name:'Connected · View-only access',exact:true})).toBeVisible();
});
test("lost save responses retry the same request once", async ({ page }) => {
  const { h } = await setup(page);
  const attempts = [];
  await page.route(API, async route => {
    const req = route.request().postDataJSON();
    if (req.action !== 'lodging') return route.fallback();
    attempts.push(req);
    const result = h.request(req);
    if (attempts.length === 1) return route.abort();
    await route.fulfill({ json: result });
  });
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Accommodations', exact: true }).click();
  await page.getByRole('button', { name: 'Guest list', exact: true }).click();
  await page.getByRole('button', { name: 'Assign lodging', exact: true }).click();
  await page.getByLabel('Room number (AE)').selectOption('204');
  await page.getByLabel('Bed number').selectOption('1');
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(attempts).toHaveLength(2);
  expect(attempts[0].requestId).toBe(attempts[1].requestId);
  expect(h.sheets.get('Assignment History').rows).toHaveLength(2);
});

test('transport padding and six-hour collapse update while the page remains open', async ({page}) => {
  await page.clock.install({time:new Date('2026-10-14T20:29:00Z')});
  const {h,requests}=await setup(page);
  h.rows[1][12]='10/14/2026 10:30 AM';
  const trip=transportGroups(guestsFromRows(h.rows),'Arrivals')[0];
  h.request({action:'trip-display',id:trip.id,collapsed:false,requestId:crypto.randomUUID()});
  h.sheets.get('Transport Display').rows[1][2]='2026-10-14T15:00:00Z|before-cutoff';
  await page.goto('/#transport');
  await page.reload();
  await expect(page.getByRole('heading',{name:'Airport Trips',exact:true})).toBeVisible();
  await page.clock.pauseAt(new Date('2026-10-14T20:29:59Z'));
  const toggle=()=>page.getByRole('button',{name:/^(Expand|Collapse) AA123 Arrivals 2026-10-14$/});
  await expect(toggle()).toHaveAttribute('aria-expanded','true');
  const spacing=await toggle().evaluate(el=>({left:parseFloat(getComputedStyle(el).paddingLeft),right:parseFloat(getComputedStyle(el).paddingRight)}));
  expect(spacing.left).toBeGreaterThanOrEqual(12);expect(spacing.right).toBeGreaterThanOrEqual(12);
  await page.clock.runFor(1100);
  await expect(toggle()).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('.transport-journey-body').first()).toBeVisible(); // Future departure remains expanded.
  expect(requests.filter(r=>r.action==='flight')).toHaveLength(0);
  await page.screenshot({path:test.info().outputPath('transport-collapsed-mobile.png'),fullPage:true});
});

test('at 8 AM whole previous days minimize with smaller gray dates and remain reopenable', async ({page}) => {
  await page.clock.install({time:new Date('2026-10-15T11:59:00Z')});
  const {h}=await setup(page,false);
  h.rows[1][12]='10/14/2026 11:30 PM';h.rows[1][13]='10/15/2026 6:00 PM';
  await page.goto('/#transport');
  await page.reload();
  await expect(page.getByRole('heading',{name:'Airport Trips',exact:true})).toBeVisible();
  await page.clock.pauseAt(new Date('2026-10-15T11:59:59Z'));
  const yesterday=page.getByRole('button',{name:/^(Expand|Collapse) trips for 2026-10-14$/});
  await expect(yesterday).toHaveAttribute('aria-expanded','true');
  await expect(page.getByRole('button',{name:'Expand AA123 Arrivals 2026-10-14',exact:true})).toBeVisible();
  await page.clock.runFor(1100);
  await expect(yesterday).toHaveAttribute('aria-expanded','false');
  await expect(page.getByRole('button',{name:'Expand AA123 Arrivals 2026-10-14',exact:true})).toHaveCount(0);
  const today=page.getByRole('button',{name:'Collapse trips for 2026-10-15',exact:true});
  await expect(today).toHaveAttribute('aria-expanded','true');
  const oldStyle=await yesterday.evaluate(el=>({size:parseFloat(getComputedStyle(el).fontSize),color:getComputedStyle(el).color}));
  const todaySize=await today.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(oldStyle.size).toBeLessThan(todaySize);expect(oldStyle.color).toBe('rgb(107, 116, 126)');
  // Use a post-cutoff server revision so this test's simulated future date is
  // independent of the host running the mocked backend.
  await page.route(API,async route=>{
    const req=route.request().postDataJSON();if(req.action!=='trip-display')return route.fallback();
    const result=h.request(req);
    h.sheets.get('Transport Display').rows.find(r=>r[0]===req.id)[2]='2026-10-15T12:00:01Z|reopened';
    await route.fulfill({json:h.request({action:'trip-display-read',accessKey:''})});
  });
  await yesterday.click();
  await expect(yesterday).toHaveAttribute('aria-expanded','true');
  await expect(page.getByRole('button',{name:'Expand AA123 Arrivals 2026-10-14',exact:true})).toBeVisible();
  await page.clock.resume();
  await page.reload();await expect(yesterday).toHaveAttribute('aria-expanded','true');
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:test.info().outputPath('transport-expanded-desktop.png'),fullPage:true});
  await yesterday.click();await expect(yesterday).toHaveAttribute('aria-expanded','false');
  await page.screenshot({path:test.info().outputPath('transport-minimized-day-desktop.png'),fullPage:true});
});
