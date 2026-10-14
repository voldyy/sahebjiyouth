import { test, expect } from "@playwright/test";
import { createHarness, TEST_ADMIN_KEY } from "./helpers/apps-script-harness.js";
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
