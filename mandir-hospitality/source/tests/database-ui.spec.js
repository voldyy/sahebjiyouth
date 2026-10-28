import { test, expect } from "@playwright/test";
import { createHarness, TEST_ADMIN_KEY } from "./helpers/apps-script-harness.js";
import { transportGroups } from "../src/lib/transport.js";
import { guestsFromRows } from "../src/lib/sheets.js";
const API = "https://database.test/api";
const TODAY = new Date("2026-10-25T16:00:00Z"); // first room-planning day, so tests do not depend on the real date
async function setup(page, admin = true, today = TODAY) {
  if (today) await page.clock.install({ time: today });
  const headers = Array(32).fill(""); Object.assign(headers, { 0: "Registration ID", 8: "Attendee Full Name", 29: "Lodging", 30: "Room No.", 31: "Room Code" });
  const row = Array(32).fill(""); Object.assign(row, { 0: "SYNTHETIC-DB", 8: "Database Guest", 9: "Self", 11: "Flight", 12: "11/1/2026 2:00 PM", 13: "11/3/2026", 14: "PHL", 15: "AA123", 18: "YES", 20: "YES", 24: "Confirmed" });
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

test("WhatsApp receipt appears for a sent current room notice and not a queued message", async ({ page }) => {
  const { h } = await setup(page, false);
  h.rows[1].splice(29, 3, 'Samarpan', '202', 'S202B1');
  let status = 'delivered';
  await page.route(API, async route => {
    const result = h.request(route.request().postDataJSON());
    result.guests = guestsFromRows(h.rows).map(g => ({ ...g, lodgingNotification: { sent: status === 'delivered', status } }));
    await route.fulfill({json:result});
  });
  await page.goto('/#rooms');
  await page.reload();
  await page.getByRole('button', {name:'Guest list',exact:true}).click();
  await expect(page.getByRole('img',{name:'Current room details sent via WhatsApp'})).toBeVisible();
  await expect(page.locator('.sheet-attendee')).toContainText('Room 202');
  status = 'queued';
  await page.reload();
  await page.getByRole('button', {name:'Guest list',exact:true}).click();
  await expect(page.getByRole('img',{name:'Current room details sent via WhatsApp'})).toHaveCount(0);
});

test("compact flight fallback keeps tracking available and removes Pickup journey", async ({ page }) => {
  const { h } = await setup(page, false);
  await page.goto('/#transport');
  const fallback = page.locator('.transport-flight-status--compact').first();
  await expect(fallback).toBeVisible();
  await expect(fallback.getByRole('link',{name:'Flight tracker'})).toBeVisible();
  await expect(fallback.locator('.flight-glance')).toHaveCount(0);
  expect((await fallback.boundingBox()).height).toBeLessThan(65);
  h.rows[1][11] = ''; h.rows[1][15] = ''; h.rows[1][17] = '';
  await page.reload();
  await expect(page.locator('.transport-journey').first()).toBeVisible();
  await expect(page.getByText('Pickup journey',{exact:true})).toHaveCount(0);
});
test('bed selection shares a compact guest picker and checks the full stay', async ({ page }) => {
  const { h, requests } = await setup(page);
  const occupied = [...h.rows[1]];
  Object.assign(occupied, {0:'FUTURE-OCCUPANT',8:'Future Occupant',12:'11/2/2026',13:'11/4/2026',29:'Samarpan',30:'203',31:'S203B2'});
  h.rows.push(occupied);
  await page.goto('/#rooms');
  await page.reload();
  await page.getByRole('button',{name:'Daily view',exact:true}).click();
  await page.getByLabel('Choose occupancy date').fill('2026-11-01');
  await page.locator('.stay-slot[data-room="203"][data-bed="2"]').getByRole('button').click();
  await expect(page.locator('.stay-chosen-bed')).toContainText('Room 203 · Bed 2');
  await expect(page.getByLabel('Guest to assign')).toBeVisible();
  await expect(page.getByLabel('Room number (AE)')).toHaveCount(0);
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Day at a glance',exact:true}).click();
  await page.getByLabel('Choose occupancy date').fill('2026-11-01');
  await page.getByRole('button',{name:'Assign guest to room 203 bed 2',exact:true}).click();
  await expect(page.locator('.stay-chosen-bed')).toContainText('Room 203 · Bed 2');
  await page.getByLabel('Guest to assign').selectOption({label:'Database Guest · Nov 1 – Nov 3'});
  await expect(page.getByRole('alert')).toContainText('occupied during this guest’s stay');
  await expect(page.getByRole('button',{name:'Save assignment',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Change room or bed'}).click();
  await expect(page.getByLabel('Bed number').locator('option[value="2"]')).toHaveJSProperty('disabled', true);
  await page.getByLabel('Bed number').selectOption('3');
  await page.getByRole('button',{name:'Save assignment',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(h.rows[1].slice(29)).toEqual(['Samarpan','203','S203B3']);
  expect(requests.filter(r=>r.action==='lodging')).toHaveLength(1);
  await page.getByRole('button',{name:'Assign guest to room 204 bed 1',exact:true}).click();
  await expect(page.getByLabel('Guest to assign')).toBeVisible();
  await expect(page.getByRole('button',{name:'Save assignment',exact:true})).toBeDisabled();
  await page.screenshot({path:test.info().outputPath('compact-bed-picker-mobile.png'),animations:'disabled'});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:test.info().outputPath('compact-bed-picker-desktop.png'),animations:'disabled'});
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
  await page.clock.install({time:new Date('2026-10-28T20:29:00Z')});
  const {h,requests}=await setup(page, true, null);
  h.rows[1][12]='10/28/2026 10:30 AM';
  const trip=transportGroups(guestsFromRows(h.rows),'Arrivals')[0];
  h.request({action:'trip-display',id:trip.id,collapsed:false,requestId:crypto.randomUUID()});
  h.sheets.get('Transport Display').rows[1][2]='2026-10-28T15:00:00Z|before-cutoff';
  await page.goto('/#transport');
  await page.reload();
  await expect(page.getByRole('heading',{name:'Airport Trips',exact:true})).toBeVisible();
  await page.clock.pauseAt(new Date('2026-10-28T20:29:59Z'));
  const toggle=()=>page.getByRole('button',{name:/^(Expand|Collapse) AA123 Arrivals 2026-10-28$/});
  await expect(toggle()).toHaveAttribute('aria-expanded','true');
  const spacing=await toggle().evaluate(el=>({left:parseFloat(getComputedStyle(el).paddingLeft),right:parseFloat(getComputedStyle(el).paddingRight)}));
  expect(spacing.left).toBeGreaterThanOrEqual(12);expect(spacing.right).toBeGreaterThanOrEqual(12);
  await page.clock.runFor(1100);
  await expect(toggle()).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('.transport-journey-body').first()).toBeVisible(); // Future departure remains expanded.
  expect(requests.filter(r=>r.action==='flight')).toHaveLength(0);
  await page.screenshot({path:test.info().outputPath('transport-collapsed-mobile.png'),fullPage:true});
});

test('at 8 AM whole previous days leave the page, and come back minimized and reopenable with the past-trips toggle', async ({page}) => {
  await page.clock.install({time:new Date('2026-10-29T11:59:00Z')});
  const {h}=await setup(page,false, null);
  h.rows[1][12]='10/28/2026 11:30 PM';h.rows[1][13]='10/29/2026 6:00 PM';
  await page.goto('/#transport');
  await page.reload();
  await expect(page.getByRole('heading',{name:'Airport Trips',exact:true})).toBeVisible();
  await page.clock.pauseAt(new Date('2026-10-29T11:59:59Z'));
  const yesterday=page.getByRole('button',{name:/^(Expand|Collapse) trips for 2026-10-28$/});
  await expect(yesterday).toHaveAttribute('aria-expanded','true');
  await expect(page.getByRole('button',{name:'Expand AA123 Arrivals 2026-10-28',exact:true})).toBeVisible();
  await page.clock.runFor(1100);
  // Once the day is over its trips leave the page; the toggle brings them back minimized.
  await expect(yesterday).toHaveCount(0);
  await expect(page.getByLabel(/Show past trips \(1\)/)).not.toBeChecked();
  await page.getByLabel(/Show past trips/).check();
  await expect(yesterday).toHaveAttribute('aria-expanded','false');
  await expect(page.getByRole('button',{name:'Expand AA123 Arrivals 2026-10-28',exact:true})).toHaveCount(0);
  const today=page.getByRole('button',{name:'Collapse trips for 2026-10-29',exact:true});
  await expect(today).toHaveAttribute('aria-expanded','true');
  const oldStyle=await yesterday.evaluate(el=>({size:parseFloat(getComputedStyle(el).fontSize),color:getComputedStyle(el).color}));
  const todaySize=await today.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(oldStyle.size).toBeLessThan(todaySize);expect(oldStyle.color).toBe('rgb(107, 116, 126)');
  // Use a post-cutoff server revision so this test's simulated future date is
  // independent of the host running the mocked backend.
  await page.route(API,async route=>{
    const req=route.request().postDataJSON();if(req.action!=='trip-display')return route.fallback();
    const result=h.request(req);
    h.sheets.get('Transport Display').rows.find(r=>r[0]===req.id)[2]='2026-10-29T12:00:01Z|reopened';
    await route.fulfill({json:h.request({action:'trip-display-read',accessKey:''})});
  });
  await yesterday.click();
  await expect(yesterday).toHaveAttribute('aria-expanded','true');
  await expect(page.getByRole('button',{name:'Expand AA123 Arrivals 2026-10-28',exact:true})).toBeVisible();
  await page.clock.resume();
  await page.reload();await expect(yesterday).toHaveCount(0);await page.getByLabel(/Show past trips/).check();await expect(yesterday).toHaveAttribute('aria-expanded','true');
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:test.info().outputPath('transport-expanded-desktop.png'),fullPage:true});
  await yesterday.click();await expect(yesterday).toHaveAttribute('aria-expanded','false');
  await page.screenshot({path:test.info().outputPath('transport-minimized-day-desktop.png'),fullPage:true});
});

test('compact lodging cards prioritize unassigned guests and Main prioritizes submission time', async ({page}) => {
  const {h}=await setup(page);
  Object.assign(h.rows[1], {1:'10/28/2026 9:00 AM',29:'Samarpan',30:'101',31:'S101B1'});
  const add=(id,name,stamp,fields={})=>{const row=[...h.rows[1]];Object.assign(row,{0:id,1:stamp,8:name,29:'',30:'',31:'',...fields});h.rows.push(row);};
  add('NEWEST-REG','Newest Registration','2026-10-29T15:00:00Z');
  add('MIDDLE-REG','Middle Registration','10/29/2026 10:00 AM');
  add('ASSIGNED-REG','Assigned Guest','10/27/2026 8:00 AM',{29:'Samarpan',30:'102',31:'S102B1'});
  await page.reload();
  await expect(page.locator('.mobile-guest-name').first()).toContainText('Newest Registration');
  await page.goto('/#rooms');
  await page.getByRole('button',{name:'Guest list',exact:true}).click();
  await expect(page.locator('.sheet-attendee h3')).toHaveText(['Newest Registration','Middle Registration','Database Guest','Assigned Guest']);
  await expect(page.locator('.sheet-attendee-list')).not.toContainText('NEWEST-REG');
  await expect(page.locator('.sheet-attendee-list')).toContainText('Room 101 · Bed 1');
  await page.setViewportSize({width:1440,height:1000});
  const columns=await page.locator('.sheet-attendee-list').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBeGreaterThanOrEqual(3);
  await page.screenshot({path:test.info().outputPath('guest-grid-desktop.png'),animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('guest-grid-mobile.png'),animations:'disabled'});
});

test('daily and weekly views start at the current Allentown day and week', async ({page}) => {
  // November 3 in Allentown, November 4 UTC; also covers the second DST offset.
  await page.clock.install({time:new Date('2026-11-04T04:30:00Z')});
  await setup(page, true, null);
  await page.goto('/#rooms');
  await expect(page.getByLabel('Choose occupancy week')).toHaveValue('1');
  await expect(page.getByRole('heading',{name:'Nov 1 – Nov 7, 2026'})).toBeVisible();
  await page.getByRole('button',{name:'Daily view',exact:true}).click();
  await expect(page.getByLabel('Choose occupancy date')).toHaveValue('2026-11-03');
  await page.getByRole('button',{name:'Previous occupancy day'}).click();
  await expect(page.getByLabel('Choose occupancy date')).toHaveValue('2026-11-02');
  await page.getByRole('button',{name:'Weekly view',exact:true}).click();
  await expect(page.getByLabel('Choose occupancy week')).toHaveValue('1');
  await page.getByRole('button',{name:'Open daily view for Thursday, November 5, 2026'}).click();
  await expect(page.getByLabel('Choose occupancy date')).toHaveValue('2026-11-05');
});

test('Sadhak assigns the chosen building in daily, overview and walk-in flows', async ({page}) => {
  await page.clock.install({time:new Date('2026-11-01T14:00:00Z')});
  const {h,requests}=await setup(page, true, null);
  const occupied=[...h.rows[1]];
  Object.assign(occupied,{0:'SAMARPAN-OCCUPANT',8:'Samarpan Occupant',29:'Samarpan',30:'101',31:'S101B1'});
  h.rows.push(occupied);
  await page.goto('/#rooms'); await page.reload();
  await page.getByRole('button',{name:'Sadhak',exact:true}).click();
  await expect(page.getByRole('region',{name:'Choose a Sadhak room'}).locator('.stay-room-chip')).toHaveCount(7);
  await page.getByRole('button',{name:'Daily view',exact:true}).click();
  await expect(page.locator('.stay-slot[data-lodging="Sadhak"][data-room="101"]')).toHaveCount(3);
  await expect(page.locator('.stay-slot[data-lodging="Sadhak"][data-room="201"]')).toHaveCount(1);
  await expect(page.locator('.stay-slot[data-lodging="Sadhak"][data-room="104"]')).toHaveCount(2);
  await expect(page.locator('.stay-slot[data-lodging="Sadhak"][data-room="204"]')).toHaveCount(2);
  await page.getByRole('button',{name:'Assign Sadhak room 101 bed 1 on Sunday, November 1, 2026',exact:true}).click();
  await expect(page.locator('.stay-chosen-bed')).toContainText('Sadhak');
  await page.getByLabel('Guest to assign').selectOption({label:'Database Guest · Nov 1 – Nov 3'});
  await page.getByRole('button',{name:'Save assignment',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(h.rows[1].slice(29)).toEqual(['Sadhak','101','SD101B1']);
  await expect(page.locator('.stay-slot[data-lodging="Sadhak"][data-room="101"][data-bed="1"]')).toContainText('Database Guest');
  await page.getByRole('button',{name:'Day at a glance',exact:true}).click();
  await expect(page.locator('.stay-overview-room').filter({hasText:'Samarpan Occupant'})).toHaveCount(1);
  await expect(page.locator('.stay-overview-room').filter({hasText:'Database Guest'})).toHaveCount(1);
  await page.getByRole('button',{name:'Assign guest to Sadhak room 203 bed 2',exact:true}).click();
  await page.getByRole('button',{name:'New walk-in guest',exact:true}).click();
  await expect(page.locator('.stay-chosen-bed')).toContainText('Sadhak');
  await expect(page.locator('.stay-chosen-bed')).toContainText('Room 203 · Bed 2');
  await page.getByLabel('Guest name',{exact:true}).fill('Sadhak New Walk In');
  await page.getByLabel('Checkout',{exact:true}).fill('2026-11-03');
  await page.getByRole('button',{name:'Add guest & assign bed',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(h.rows.at(-1).slice(29)).toEqual(['Sadhak','203','SD203B2']);
  expect(requests.filter(r=>r.action==='lodging')).toHaveLength(1);
  expect(requests.filter(r=>r.action==='guest')).toHaveLength(1);
});

const addGuest = (h, id, name, fields = {}) => { const row = [...h.rows[1]]; Object.assign(row, { 0: id, 1: '10/20/2026 9:00 AM', 8: name, 29: '', 30: '', 31: '', ...fields }); h.rows.push(row); };

test('Main can sort by arrival date and has a day-by-day arrivals and departures view', async ({page}) => {
  const {h}=await setup(page, true);                      // today is Sunday Oct 25
  Object.assign(h.rows[1],{12:'11/1/2026 2:00 PM',13:'11/3/2026 4:00 PM'});
  addGuest(h,'EARLY','Early Bird',{12:'10/20/2026 9:00 AM',13:'10/22/2026 9:00 AM'});
  addGuest(h,'LATER','Zed Later',{12:'11/2/2026 1:00 PM',13:'11/6/2026 1:00 PM'});
  addGuest(h,'TODAY','Today Guest',{12:'10/25/2026 8:30 AM',13:'10/27/2026 6:15 PM',14:'ABE',15:'UA100',16:'ABE',17:'UA200',20:'YES'});
  addGuest(h,'SOON','Soon Guest',{1:'10/21/2026 9:00 AM',12:'10/26/2026 3:00 PM',13:'10/27/2026 6:15 PM',16:'ABE',17:'UA201'});
  await page.reload();
  await page.setViewportSize({width:1440,height:1000});
  await expect(page.locator('.guest-name-cell').first()).toBeVisible();
  await expect(page.getByLabel('Sort guests')).toHaveValue('Newest registration');   // the default is unchanged
  await page.getByLabel('Sort guests').selectOption('Arrival date');
  // Arriving today or later come first, soonest first; earlier arrivals follow.
  const order=async()=>page.locator('.guest-table .guest-name-cell strong').allInnerTexts();
  await expect.poll(order).toEqual(['Today Guest','Soon Guest','Database Guest','Zed Later','Early Bird']);

  await page.getByRole('button',{name:'Daily arrivals & departures'}).click();
  await expect(page.getByRole('heading',{name:'Sunday, October 25, 2026'})).toBeVisible();
  await expect(page.locator('.daily-arrivals .daily-trip strong')).toHaveText(['Today Guest']);
  await expect(page.locator('.daily-arrivals .daily-trip')).toContainText('8:30 AM');
  await expect(page.locator('.daily-arrivals .daily-trip')).toContainText('UA100');
  await expect(page.locator('.daily-arrivals .daily-trip')).toContainText('Pickup');
  await expect(page.locator('.daily-departures .daily-empty')).toBeVisible();
  await page.getByRole('button',{name:'Next day'}).click();
  await expect(page.locator('.daily-arrivals .daily-trip strong')).toHaveText(['Soon Guest']);
  await page.getByRole('button',{name:/Tuesday, October 27, 2026: 0 arriving, 2 departing/}).click();
  await expect(page.locator('.daily-departures .daily-trip strong')).toHaveText(['Soon Guest','Today Guest']);   // same time, so by name
  await expect(page.locator('.daily-departures h3')).toContainText('2');
  await page.getByRole('button',{name:'Today',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Sunday, October 25, 2026'})).toBeVisible();
  await page.getByRole('button',{name:'Guest list'}).click();
  await expect(page.locator('.guest-table')).toBeVisible();
  // It is also usable on a phone.
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Daily arrivals & departures'}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const chip=await page.locator('.daily-chip').first().boundingBox();expect(chip.height).toBeGreaterThanOrEqual(44);
});

test('Accommodations shows how much of Samarpan is filled for the day or the busiest day of the week', async ({page}) => {
  const {h}=await setup(page, true);
  Object.assign(h.rows[1],{12:'10/26/2026 2:00 PM',13:'10/29/2026 4:00 PM',29:'Samarpan',30:'101',31:'S101B1'});
  addGuest(h,'B2','Bed Two',{12:'10/26/2026 2:00 PM',13:'10/29/2026 4:00 PM',29:'Samarpan',30:'101',31:'S101B2'});
  addGuest(h,'B3','Bed Three',{12:'10/27/2026 2:00 PM',13:'10/29/2026 4:00 PM',29:'Samarpan',30:'101',31:'S101B3'});
  addGuest(h,'B4','Bed Four',{12:'10/28/2026 2:00 PM',13:'10/29/2026 4:00 PM',29:'Samarpan',30:'101',31:'S101B4'});
  addGuest(h,'NOBED','Needs Bed',{12:'10/27/2026 2:00 PM',13:'10/29/2026 4:00 PM'});
  await page.reload();
  await page.goto('/#rooms');
  const meter=page.getByLabel('Samarpan capacity',{exact:true});
  await expect(meter).toContainText('5% reached');                       // 4 of 85 beds on the busiest day
  await expect(meter).toContainText('4 of 85 beds');
  await expect(meter).toContainText('busiest Oct 28');
  await expect(meter).toContainText('1 without a bed');
  await expect(meter.getByRole('progressbar')).toHaveAttribute('aria-valuenow','5');
  await page.getByRole('button',{name:'Daily view',exact:true}).click();
  await page.getByLabel('Choose occupancy date').fill('2026-10-26');
  await expect(meter).toContainText('3% reached');                       // two beds that day
  await expect(meter).toContainText('2 of 85 beds · Oct 26');
  await page.getByRole('button',{name:'Sadhak',exact:true}).click();
  await expect(page.getByLabel('Sadhak capacity',{exact:true})).toContainText('0% reached');
});
