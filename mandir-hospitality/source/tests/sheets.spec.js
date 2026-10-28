import { test, expect } from "@playwright/test";

import { createHarness, TEST_ADMIN_KEY } from './helpers/apps-script-harness.js';

test('accommodation WhatsApp preview and send use one message per attendee', async ({ page }) => {
  await setup(page);
  const notifications=[];
  await page.context().route('https://script.google.com/test-rpc',route=>{
    const req=route.request().postDataJSON();
    if(req.action!=='accommodation-notifications')return route.fallback();
    notifications.push(req);
    return route.fulfill({json:req.mode==='queue'?{ok:true,queued:2}:{ok:true,eligible:2,previewHash:'synthetic-preview',skippedMissingContact:0,attendees:[{name:'Test Parent',lodging:'Samarpan',roomNo:'203',phoneEnding:'0123',status:'ready'},{name:'Test Child',lodging:'Samarpan',roomNo:'203',phoneEnding:'0123',status:'ready'}]}});
  });
  await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Accommodations',exact:true}).click();
  await page.getByRole('button',{name:'Send room details',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Test Parent');
  await expect(page.getByRole('dialog')).toContainText('Test Child');
  await expect(page.getByRole('dialog')).toContainText('2 ready to send');
  await page.getByRole('button',{name:'Send 2 messages',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(notifications.map(r=>r.mode)).toEqual(['preview','queue']);
  expect(notifications[1].previewHash).toBe('synthetic-preview');
  expect(notifications[1].accessKey).toBe(TEST_ADMIN_KEY);
});

test('view-only accommodation page does not offer WhatsApp sending', async ({page})=>{
  await setup(page);
  await page.goto('/#rooms?team=yogi-prasad');
  await expect(page.getByRole('heading',{name:'Accommodations',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Send room details',exact:true})).toHaveCount(0);
});

const TODAY = new Date("2026-10-25T16:00:00Z"); // first planning day, so tests do not depend on the real date
test('transport follows pickup and dropoff Sheet choices independently after refresh', async ({page}) => {
  const rows=[['Both Legs','YES','YES'],['Pickup Only','YES','NO'],['Dropoff Only','NO','YES'],['Neither Leg','NO','NO']].map(([name,pickup,dropoff],i)=>{
    const r=plannerGuest(`LEG-${i}`,name,'2026-10-28 14:30','2026-10-30 16:00');
    Object.assign(r,{11:'FLIGHT',14:'ABE',15:'AA123',16:'EWR',17:'UA456',18:pickup,32:dropoff});return r;
  });
  const h=await setup(page,'ok',rows);h.rows[0][18]='Airport Pickup Needed?';h.rows[0][32]='Departure Dropoff Needed?';
  await page.goto('/#transport');await page.reload();
  const arrival=page.locator('.transport-journey').filter({hasText:'AA123'}),departure=page.locator('.transport-journey').filter({hasText:'UA456'});
  await expect(arrival).toContainText('Both Legs');await expect(arrival).toContainText('Pickup Only');await expect(arrival).not.toContainText('Dropoff Only');
  await expect(departure).toContainText('Both Legs');await expect(departure).toContainText('Dropoff Only');await expect(departure).not.toContainText('Pickup Only');
  await expect(page.locator('.shared-transport')).not.toContainText('Neither Leg');
  h.rows[1][32]='NO';await page.reload();
  await expect(arrival).toContainText('Both Legs');await expect(departure).not.toContainText('Both Legs');
});
async function setup(page, mode = "ok", attendeeRows = null, today = TODAY) {
  if (today) await page.clock.install({ time: today });
  const headers = Array(32).fill("");
  Object.assign(headers, { 0: "Registration ID", 8: "Attendee Full Name", 29: "Lodging", 30: "Room No.", 31: "Room Code" });
  const row = Array(32).fill("");
  Object.assign(row, { 0: "SYNTHETIC-001", 3: "Synthetic Primary", 8: "Synthetic Guest", 9: "Self", 12: "11/1/2026", 13: "11/3/2026", 20: "YES", 24: "Confirmed" });
  const harness = createHarness([headers, ...(attendeeRows || [row])], mode === 'denied');
  await mockBridge(page.context(),harness);
  await page.goto("/");
  await expect(page.locator(".mobile-guest-name").first()).toBeVisible();
  return harness;
}
async function mockBridge(context,harness, admin = true) {
  if (admin) await context.addInitScript(key => sessionStorage.setItem("mandir.admin-access.v1", key), TEST_ADMIN_KEY);
  await context.route('https://script.google.com/macros/s/synthetic-hospitality/exec?**', route => {
    const params=new URL(route.request().url()).searchParams;
    const config={channel:params.get('channel'),origin:params.get('origin')};
    return route.fulfill({contentType:'text/html',body:`<script>
      const config=${JSON.stringify(config)};
      window.addEventListener('message', async e=>{
        if(e.origin!==config.origin||e.data.channel!==config.channel)return;
        const result=await fetch('https://script.google.com/test-rpc',{method:'POST',body:JSON.stringify(e.data.request)}).then(r=>r.json());
        window.top.postMessage({service:'mandir-hospitality',channel:config.channel,id:e.data.id,result},config.origin);
      });
      window.top.postMessage({service:'mandir-hospitality',channel:config.channel,ready:true},config.origin);
    </script>`});
  });
  await context.route('https://script.google.com/test-rpc',route=>route.fulfill({json:harness.request(route.request().postDataJSON())}));
  await context.route('https://sheets.googleapis.com/**',route=>route.abort());
  await context.route('https://accounts.google.com/**',route=>route.abort());
}
async function openAssignment(page) {
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Accommodations", exact: true }).click();
  await page.getByRole("button", { name: "Guest list", exact: true }).click();
  await page.getByRole("button", { name: "Assign lodging", exact: true }).click();
  await page.getByLabel("Room number (AE)").selectOption("204");
  await page.getByLabel("Bed number").selectOption("1");
}
test("admin shared assignment persists AD–AF only", async ({ page }) => {
  const { rows, writes } = await setup(page);
  await expect(page.getByText("Girishbhai & Taraben Patel", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add guest", exact: true })).toBeEnabled();
  await openAssignment(page);
  await page.getByRole("button", { name: "Save assignment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes).toEqual([{ range: "'Attendees'!AD2:AF2", majorDimension: "ROWS", values: [["Samarpan", "204", "S204B1"]] }]);
  expect(rows[1][8]).toBe("Synthetic Guest");
  await expect(page.locator(".sheet-room-details", { hasText: "Room 204" })).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain("Synthetic Guest");
  expect(stored).not.toContain("synthetic-token");
  await page.reload();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Accommodations", exact: true }).click();
  await page.getByRole("button", { name: "Guest list", exact: true }).click();
  await expect(page.locator(".sheet-room-details", { hasText: "Room 204" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google", exact: true })).toHaveCount(0);
  const dimensions = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(dimensions[0]).toBeLessThanOrEqual(dimensions[1]);
});
test("private admin access enables edits without Google sign-in", async ({ page }) => {
  const { writes } = await setup(page);
  await openAssignment(page);
  await expect(page.getByRole("button", { name: "Save assignment" })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath("lodging-assignment.png"), fullPage: true });
  expect(writes).toHaveLength(0);
});
test("Backend write failure leaves the form open and does not report success", async ({ page }) => {
  const { rows, writes } = await setup(page, "denied");
  await openAssignment(page);
  await page.getByRole("button", { name: "Save assignment" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("cannot edit");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(rows[1].slice(29)).toEqual(["", "", ""]);
  await expect(page.getByText("Lodging saved to Google Sheets (AD–AF).", { exact: true })).toHaveCount(0);
});
test("Samarpan offers only confirmed rooms with bed capacities", async ({ page }) => {
  await setup(page);
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Accommodations", exact: true }).click();
  await page.getByRole("button", { name: "Guest list", exact: true }).click();
  await page.getByRole("button", { name: "Assign lodging", exact: true }).click();
  const room = page.getByLabel("Room number (AE)");
  await expect(room).toHaveJSProperty("tagName", "SELECT");
  await expect(room.locator("option")).toHaveText(["Choose a Samarpan room", "201 · 2 beds", "202 · 2 beds", "203 · 4 beds", "204 · 4 beds", "205 · 4 beds", "206 · 4 beds", "207 · 4 beds", "100 · 7 beds", "101 · 12 beds", "102 · 14 beds", "103 · 13 beds", "104 · 15 beds"]);
  await room.selectOption("204");
  await expect(page.getByLabel("Bed number").locator("option")).toHaveCount(5);
  await page.getByLabel("Bed number").selectOption("1");
  await expect(page.getByLabel("Custom room code (AF)")).toHaveValue("S204B1");
  await expect(page.getByLabel("Custom room code (AF)")).toHaveAttribute("readonly", "");
  await room.selectOption("101");
  await expect(page.getByLabel("Custom room code (AF)")).toHaveValue("");
  await expect(page.getByLabel("Bed number").locator("option")).toHaveCount(13);
  await page.getByLabel("Bed number").selectOption("12");
  await expect(page.getByLabel("Custom room code (AF)")).toHaveValue("S101B12");
  await page.getByLabel("Lodging location (AD)").selectOption("Hawthorn");
  await expect(page.getByLabel("Hotel planning room")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Save assignment" })).toBeDisabled();
});

function plannerGuest(id, name, start, end, room = "", bed = "") {
  const row = Array(32).fill("");
  Object.assign(row, { 0: id, 3: name, 8: name, 9: "Self", 12: start, 13: end, 20: "YES", 24: "Confirmed", 29: room ? "Samarpan" : "", 30: room, 31: room ? `S${room}B${bed}` : "" });
  return row;
}
const plannerRows = () => [
  plannerGuest("A", "Amal Patel", "2026-10-25", "2026-10-28", "204", "1"),
  plannerGuest("B", "Bela Shah", "2026-10-28", "2026-10-31", "204", "1"),
  plannerGuest("C", "Chirag Mehta", "2026-10-25", "2026-10-31"),
  plannerGuest("D", "Dev Shah", "2026-11-01", "2026-11-03"),
  plannerGuest("E", "Erin Patel", "2026-10-26", "2026-10-27", "101", "12"),
  plannerGuest("F", "Guest Missing Dates", "", ""),
];
async function openPlanner(page) {
  const result = await setup(page, "ok", plannerRows());
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Accommodations", exact: true }).click();
  return result;
}
const slot = (page, room, bed, day) => page.locator(`.stay-slot[data-room="${room}"][data-bed="${bed}"][data-day="${day}"]`);

test("weekly calendar has four bounded planning weeks, correct room beds, and checkout-day handoffs", async ({ page }) => {
  await openPlanner(page);
  await expect(page.getByRole("button", { name: "Weekly view" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Oct 25 – Oct 31, 2026" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous week", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Room 204 3 beds", exact: true }).click();
  await expect(page.locator(".stay-week-grid tbody tr")).toHaveCount(3);
  await expect(slot(page, "204", "1", "2026-10-27")).toContainText("Amal Patel");
  await expect(slot(page, "204", "1", "2026-10-28")).toContainText("Bela Shah");
  await expect(slot(page, "204", "1", "2026-10-28")).not.toContainText("Amal Patel");
  await expect(slot(page, "204", "1", "2026-10-31")).toContainText("Empty bed");
  for (const label of ["Nov 1 – Nov 7, 2026", "Nov 8 – Nov 14, 2026", "Nov 15 – Nov 21, 2026"]) {
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Next week", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Room 204 3 beds", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Previous week", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nov 8 – Nov 14, 2026" })).toBeVisible();
});

test("room planning hides stays before the week of Oct 25 and limits dates to the planning window", async ({ page }) => {
  await setup(page, "ok", [
    plannerGuest("H1", "Hidden Early", "2026-10-20", "2026-10-24"),
    plannerGuest("H2", "Hidden Boundary", "2026-10-23", "2026-10-25"),
    plannerGuest("S1", "Shown Overlap", "2026-10-23", "2026-10-26"),
    plannerGuest("S2", "Shown Current", "2026-10-27", "2026-10-29"),
    plannerGuest("S3", "Shown Undated", "", ""),
  ]);
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Accommodations", exact: true }).click();
  await expect(page.getByLabel("Choose occupancy week").locator("option")).toHaveText(["Oct 25 – Oct 31", "Nov 1 – Nov 7", "Nov 8 – Nov 14", "Nov 15 – Nov 21"]);
  await expect(page.getByRole("button", { name: "Assign Shown Current", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign Shown Overlap", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Assign Hidden/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Guest list", exact: true }).click();
  await expect(page.locator("body")).toContainText("Shown Overlap");
  await expect(page.locator("body")).toContainText("Shown Current");
  await expect(page.locator("body")).toContainText("Shown Undated");
  await expect(page.locator("body")).not.toContainText("Hidden Early");
  await expect(page.locator("body")).not.toContainText("Hidden Boundary");
  await page.getByRole("button", { name: "Daily view", exact: true }).click();
  await expect(page.getByLabel("Choose occupancy date")).toHaveAttribute("min", "2026-10-25");
  await expect(page.getByRole("button", { name: "Previous occupancy day", exact: true })).toBeDisabled();
});

test("a hidden early guest still blocks their bed for a visible overlapping stay", async ({ page, browser }) => {
  const h = await setup(page, "ok", [
    plannerGuest("O", "Hidden Occupant", "2026-10-22", "2026-10-25", "204", "1"),
    plannerGuest("N", "Needs Bed", "2026-10-24", "2026-10-27"),
  ]);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.clock.install({ time: TODAY });
  await mockBridge(context, h);
  const desktop = await context.newPage();
  await desktop.goto("http://localhost:5175/#rooms");
  await expect(desktop.getByRole("button", { name: /Hidden Occupant/ })).toHaveCount(0);
  await desktop.getByRole("button", { name: "Room 204 3 beds", exact: true }).click();
  await desktop.getByRole("button", { name: "Assign Needs Bed", exact: true }).dragTo(slot(desktop, "204", "1", "2026-10-26"));
  await expect(desktop.locator(".stay-drop-error")).toContainText("occupied");
  expect(h.writes).toHaveLength(0);
  await context.close();
});

test("daily view shows all 85 beds, date-filtered unassigned guests, and saves from an empty bed", async ({ page }) => {
  const { writes } = await openPlanner(page);
  await page.getByRole("button", { name: "Daily view", exact: true }).click();
  await expect(page.locator(".stay-day-room")).toHaveCount(12);
  await expect(page.locator(".stay-day-beds .stay-slot")).toHaveCount(85);
  await expect(page.getByRole("button", { name: "Assign Chirag Mehta", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign Dev Shah", exact: true })).toHaveCount(0);
  await expect(page.getByText("1 unassigned guests need stay dates")).toBeVisible();
  await slot(page, "204", "2", "2026-10-25").getByRole("button").click();
  await page.getByLabel("Guest to assign").selectOption({ label: "Chirag Mehta · Oct 25 – Oct 31" });
  await expect(page.locator('.stay-chosen-bed')).toContainText('Room 204 · Bed 2');
  await expect(page.getByLabel("Room number (AE)")).toHaveCount(0);
  await page.getByRole('button', { name: 'Change room or bed' }).click();
  await expect(page.getByLabel("Room number (AE)")).toHaveValue("204");
  await expect(page.getByLabel("Custom room code (AF)")).toHaveValue("S204B2");
  await expect(page.getByLabel("Bed number").locator('option[value="1"]')).toHaveJSProperty("disabled", true);
  await page.getByRole("button", { name: "Save assignment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes[0].values).toEqual([["Samarpan", "204", "S204B2"]]);
  await expect(slot(page, "204", "2", "2026-10-25")).toContainText("Chirag Mehta");
  await expect(page.getByRole("button", { name: "Assign Chirag Mehta", exact: true })).toHaveCount(0);
  await page.getByLabel("Choose occupancy date").fill("2026-11-01");
  await expect(page.getByRole("button", { name: "Assign Dev Shah", exact: true })).toBeVisible();
  await expect(slot(page, "204", "2", "2026-11-01")).toContainText("Empty bed");
});

test("calendar layouts fit mobile and desktop and the weekly day header opens daily view", async ({ page }) => {
  await openPlanner(page);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const mode of ["Weekly view", "Daily view"]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      if (mode === "Weekly view") await page.getByRole("button", { name: "Room 204 3 beds", exact: true }).click();
      const size = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(size[0]).toBeLessThanOrEqual(size[1]);
      if (width === 1440) await page.screenshot({ path: test.info().outputPath(`${mode}.png`), fullPage: true });
    }
  }
  await page.getByRole("button", { name: "Weekly view", exact: true }).click();
  await page.getByRole("button", { name: "Open daily view for Wednesday, October 28, 2026", exact: true }).click();
  await expect(page.getByLabel("Choose occupancy date")).toHaveValue("2026-10-28");
  await expect(slot(page, "204", "1", "2026-10-28")).toContainText("Bela Shah");
});

test('transport drivers, vehicles and assignments persist across independent browsers with stale save protection',async({page,browser})=>{
  const rows=[plannerGuest('T1','Test Traveller One','2026-11-01','2026-11-03'),plannerGuest('T2','Test Traveller Two','2026-11-01','2026-11-03')];
  rows.forEach(r=>Object.assign(r,{5:'(555) 010-1234',7:'Allentown, PA',11:'Flight',12:'11/1/2026 2:30 PM',13:'11/3/2026 3:00 PM',14:'PHL',15:'AA 123',16:'EWR',17:'UA 456',18:'YES'}));
  const harness=await setup(page,'ok',rows);
  await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Transport',exact:true}).click();
  await expect(page.locator('.transport-journey')).toHaveCount(2);
  await expect(page.getByRole('heading',{name:'AA123',exact:true})).toBeVisible();
  await expect(page.locator('.transport-guest-names').first()).toContainText('Test Traveller Two');
  await expect(page.getByRole('button',{name:'Arrivals',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'UA456',exact:true})).toBeVisible();
  await expect(page.locator('.transport-guest-names').first()).toContainText('(Allentown, PA)');
  await expect(page.locator('.transport-guest-names a').first()).toHaveAttribute('href','tel:5550101234');
  await expect(page.locator('.transport-journey details')).toHaveCount(0);
  await expect(page.locator('.campus-subtitle')).toContainText('Allentown Shri Swaminarayan Mandirji');
  await expect(page.getByText('Pickup requested',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Drivers & vehicles',exact:true}).click();
  await page.getByLabel('New driver',{exact:true}).fill('Test Sevak');
  await page.getByRole('dialog').locator('form').first().getByRole('button',{name:'Add',exact:true}).click();
  await expect(page.getByRole('button',{name:'Remove driver Test Sevak'})).toBeVisible();
  await page.getByLabel('New vehicle',{exact:true}).fill('Test Van');
  await page.getByRole('dialog').locator('form').nth(1).getByRole('button',{name:'Add',exact:true}).click();
  await expect(page.getByRole('button',{name:'Remove vehicle Test Van'})).toBeVisible();
  await page.getByLabel('New vehicle',{exact:true}).fill('Backup Van');
  await page.getByRole('dialog').locator('form').nth(1).getByRole('button',{name:'Add',exact:true}).click();
  await expect(page.getByRole('button',{name:'Remove vehicle Backup Van'})).toBeVisible();
  await page.screenshot({path:test.info().outputPath('resources-mobile.png'),fullPage:true,scale:'css'});
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  const driverSelect = view => view.getByRole('combobox',{name:'Sevak driver for AA123 Arrivals 2026-11-01',exact:true});
  const vehicleSelect = view => view.getByRole('combobox',{name:'Vehicle for AA123 Arrivals 2026-11-01',exact:true});
  await expect(page.getByRole('button',{name:'Assign transport',exact:true})).toHaveCount(0);
  await driverSelect(page).selectOption('Test Sevak');
  await expect(driverSelect(page)).toBeEnabled();
  await vehicleSelect(page).selectOption('Test Van');
  await expect(vehicleSelect(page)).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.transport-journey').first()).toContainText('American · PHL');
  await expect(page.getByLabel('Driver notes',{exact:true})).toHaveCount(0);
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.clock.install({time:TODAY});
  await mockBridge(context,harness);
  const second=await context.newPage();await second.goto('http://localhost:5175/#transport');
  await expect(vehicleSelect(second)).toHaveValue('Test Van');
  await expect(second.getByRole('button',{name:'Sign in with Google'})).toHaveCount(0);
  await vehicleSelect(page).selectOption('Backup Van');
  await expect(vehicleSelect(page)).toBeEnabled();
  await driverSelect(second).selectOption('');
  await expect(second.locator('.transport-plan').first().getByRole('alert')).toContainText('Another admin');
  await expect(driverSelect(second)).toHaveValue('Test Sevak');
  await second.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(vehicleSelect(second)).toHaveValue('Backup Van');
  await expect(second.locator('.transport-plan').getByRole('alert')).toHaveCount(0);
  await second.screenshot({path:test.info().outputPath('shared-transport-desktop.png'),fullPage:true,scale:'css'});
  await page.screenshot({path:test.info().outputPath('shared-transport-mobile.png'),fullPage:true,scale:'css'});
  for(const view of [page,second]) expect(await view.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByRole('heading',{name:'UA456',exact:true})).toBeVisible();
  await expect(page.getByText('Suggested mandir departure',{exact:true})).toHaveCount(0);
  await second.goto('http://localhost:5175/#transport?driver=Test+Sevak');
  await expect(second.getByRole('heading',{name:'Airport Trips',exact:true})).toBeVisible();
  await expect(second.locator('.transport-journey')).toHaveCount(1);
  await expect(second.locator('.transport-journey')).toContainText('AA123');
  await expect(second.getByRole('button',{name:'Copy driver link',exact:true})).toBeVisible();
  await second.reload();
  await expect(second.locator('.transport-journey')).toHaveCount(1);
  await second.getByRole('button',{name:'Show all trips',exact:true}).click();
  await expect(second.locator('.transport-journey')).toHaveCount(2);
  await second.goto('http://localhost:5175/?driver=test%20sevak#transport');
  await expect(second.locator('.transport-journey')).toHaveCount(1);
  await second.goto('http://localhost:5175/#transport?driver=Unknown+Driver');
  await expect(second.getByRole('heading',{name:'No journeys found',exact:true})).toBeVisible();
  await context.close();
});


test('mission branding, all four tabs, blue-orange theme and unassigned panel order', async ({page}) => {
  await openPlanner(page);
  await expect(page.locator('.stay-unassigned')).toBeVisible();
  expect(await page.locator('.stay-unassigned').evaluate(el => el.nextElementSibling.classList.contains('stay-calendar-panel'))).toBe(true);
  await expect(page.getByText('A little care.',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Hospitality operations',{exact:true})).toHaveCount(0);
  for (const width of [360,390,1095,1440]) {
    await page.setViewportSize({width,height:960});
    const nav = page.getByRole('navigation',{name:width<=760?'Mobile navigation':'Main navigation'});
    for(const name of ['Main','Transport','Accommodations','Yogi Prasad']) await expect(nav.getByRole('link',{name:new RegExp('^'+name)})).toBeVisible();
    const logo=page.locator(width<=760?'.mobile-brand img':'.brand img');
    await expect(logo).toHaveAttribute('alt','Anoopam Mission');
    await expect(logo).toHaveJSProperty('naturalWidth',300);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({path:test.info().outputPath(`accommodations-${width}.png`),fullPage:true,scale:'css'});
  }
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  for(const [label,heading] of [['Main','Main'],['Yogi Prasad','Yogi Prasad']]) {
    await nav.getByRole('link',{name:new RegExp('^'+label)}).click();
    await expect(page.getByRole('heading',{name:new RegExp('^'+heading)}).first()).toBeVisible();
    await page.screenshot({path:test.info().outputPath(`${label}.png`),fullPage:true,scale:'css'});
  }
});

test('dragging assigns the entire stay and rejects a conflict on a later night', async ({ page, browser }) => {
  const h = await openPlanner(page);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.clock.install({time:TODAY});
  await mockBridge(context, h);
  const desktop = await context.newPage();
  await desktop.goto('http://localhost:5175/#rooms');
  await desktop.getByRole('button', { name: 'Room 204 3 beds', exact: true }).click();
  const source = desktop.getByRole('button', { name: 'Assign Chirag Mehta', exact: true });
  await expect(source).toHaveAttribute('draggable', 'true');
  await source.dragTo(slot(desktop, '204', '1', '2026-10-31'));
  await expect(desktop.locator('.stay-drop-error')).toContainText('occupied');
  expect(h.writes).toHaveLength(0);
  await slot(desktop, '204', '2', '2026-10-31').scrollIntoViewIfNeeded();
  await source.dragTo(slot(desktop, '204', '2', '2026-10-31'));
  await expect(source).toHaveCount(0);
  expect(h.rows.find(r => r[0] === 'C').slice(29)).toEqual(['Samarpan', '204', 'S204B2']);
  await expect(slot(desktop, '204', '2', '2026-10-25')).toContainText('Chirag Mehta');
  await expect(slot(desktop, '204', '2', '2026-10-30')).toContainText('Chirag Mehta');
  await expect(slot(desktop, '204', '2', '2026-10-31')).toContainText('Empty bed');
  await desktop.screenshot({path:test.info().outputPath('drag-assigned.png'),fullPage:true,scale:'css'});
  await context.close();
});

test('hotel room slots provide four guest places and retain assignments when real numbers arrive', async ({page}) => {
  const h = await openPlanner(page);
  await page.getByRole('button', {name:'Offsite',exact:true}).click();
  await expect(page.getByLabel('Offsite hotel').locator('option')).toHaveText(['Hawthorn']);
  await expect(page.locator('.stay-room-chip')).toHaveCount(15);
  await expect(page.getByRole('heading',{name:'R01',exact:true})).toBeVisible();
  await expect(page.getByText('Hawthorn · 2 beds · 4 people · Hotel room number pending')).toBeVisible();
  await page.getByRole('button',{name:'Assign Chirag Mehta',exact:true}).click();
  const hotelRoom = h.request({action:'snapshot'}).offsiteRooms.find(room=>room.id==='hawthorn-r01');
  await page.getByLabel('Hotel planning room').selectOption(hotelRoom.id);
  await page.getByLabel('Bed number').selectOption('2');
  await expect(page.getByLabel('Bed number').locator('option:checked')).toHaveText('Bed 1 · Guest 2');
  await page.getByRole('button',{name:'Save assignment'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(h.rows.find(r=>r[0]==='C')[30]).toBe('');
  await expect(slot(page,hotelRoom.id,'2','2026-10-25')).toContainText('Chirag Mehta');
  await expect(page.getByRole('group', { name: /^R\d+ room type$/ })).toHaveCount(15);
  await page.getByRole('group', {name:'R01 room type',exact:true}).getByRole('button',{name:'King 2 spots',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('group', {name:'R01 room type',exact:true}).getByRole('button',{name:'King 2 spots',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(h.request({action:'snapshot'}).offsiteRooms.find(r=>r.id===hotelRoom.id).beds).toBe(2);
  await expect(slot(page,hotelRoom.id,'2','2026-10-25')).toContainText('Chirag Mehta');
  await expect(page.locator('.stay-week-grid tbody tr')).toHaveCount(2);
  await expect(page.getByText('1 bed · 2 people · Number pending')).toBeVisible();
  await page.getByRole('group', {name:'R01 room type',exact:true}).getByRole('button',{name:'Double Queen 4 spots',exact:true}).click();
  await expect(page.locator('.stay-week-grid tbody tr')).toHaveCount(4);
  await page.getByRole('button',{name:'Edit room details'}).click();
  await page.getByLabel('Hawthorn room type').selectOption('doubleQueen');
  await page.getByLabel('Hotel room number (optional)').fill('021');
  await page.getByRole('button',{name:'Save room',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Room 021',exact:true})).toBeVisible();
  expect(h.rows.find(r=>r[0]==='C')[30]).toBe('021');
  await page.reload();
  await page.getByRole('button',{name:'Offsite',exact:true}).click();
  await expect(slot(page,hotelRoom.id,'2','2026-10-25')).toContainText('Chirag Mehta');
  await page.getByRole('button',{name:'Daily view',exact:true}).click();
  const dailyRoom=page.getByRole('article',{name:'Room 021'});
  await expect(dailyRoom.locator('.stay-slot')).toHaveCount(4);
  await expect(dailyRoom.locator('.stay-bed-caption')).toHaveText(['Bed 1 · Guest 1','Bed 1 · Guest 2','Bed 2 · Guest 1','Bed 2 · Guest 2']);
  await page.getByRole('button',{name:'Guest list',exact:true}).click();
  await expect(page.locator('.sheet-room-details',{hasText:'Room 021'})).toBeVisible();
  await page.getByLabel('Offsite hotel').selectOption('Hawthorn');
  await page.getByRole('button',{name:'Weekly view',exact:true}).click();
  await expect(page.locator('.stay-room-chip')).toHaveCount(15);
  await expect(page.getByRole('heading',{name:'Room 021',exact:true})).toBeVisible();
  for (const width of [360,1440]) {
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({path:test.info().outputPath(`offsite-${width}.png`),fullPage:true,scale:'css'});
  }
});

test('housekeeping autoloads checkout beds and saves refreshed linens across reloads', async ({page}) => {
  const h = await openPlanner(page);
  h.setToday('2026-10-28');
  await page.reload();
  await page.getByRole('button',{name:'Housekeeping',exact:true}).click();
  await expect(page.locator('.stay-linen-card')).toHaveCount(2);
  const card=page.locator('.stay-linen-card').filter({hasText:'S204B1'});
  await card.getByRole('button',{name:'Linens refreshed',exact:true}).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await page.getByRole('button',{name:'Housekeeping',exact:true}).click();
  await expect(page.locator('.stay-linen-card')).toHaveCount(1);
  h.setToday('2026-10-31');
  await page.reload();
  await page.getByRole('button',{name:'Housekeeping',exact:true}).click();
  await expect(page.locator('.stay-linen-card').filter({hasText:'Bela Shah'})).toBeVisible();
  await page.screenshot({path:test.info().outputPath('housekeeping-mobile.png'),fullPage:true,scale:'css'});
});

test('team links show all four tabs without edits and preserve view-only access through reloads', async ({page,browser}) => {
  const h = await openPlanner(page);
  await page.goto('/#kitchen?team=yogi-prasad');
  const nav=page.getByRole('navigation',{name:'Mobile navigation'});
  await expect(page.getByRole('heading',{name:'Yogi Prasad',exact:true})).toBeVisible();
  await expect(nav.getByRole('link')).toHaveCount(4);
  await expect(page.getByRole('button',{name:'Adjust headcount'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Workspace settings'})).toHaveCount(0);
  await nav.getByRole('link',{name:'Accommodations',exact:true}).click();
  await expect(page.getByRole('button',{name:'Assign guest',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'View Chirag Mehta',exact:true})).toHaveAttribute('draggable','false');
  await page.getByRole('button',{name:'View Chirag Mehta',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Oct 25 – Oct 31');
  await expect(page.getByRole('button',{name:'Save assignment'})).toHaveCount(0);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByRole('button',{name:'Offsite',exact:true}).click();
  await expect(page.getByRole('button',{name:'Add planning room',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Housekeeping',exact:true}).click();
  await expect(page.getByRole('button',{name:'Linens refreshed',exact:true})).toHaveCount(0);
  await nav.getByRole('link',{name:'Transport',exact:true}).click();
  await expect(page.getByRole('button',{name:'Drivers & vehicles',exact:true})).toHaveCount(0);
  await page.reload();
  await expect(nav.getByRole('link')).toHaveCount(4);
  expect(page.url()).toContain('team=yogi-prasad');
  await expect(page.getByRole('button',{name:'Workspace settings'})).toHaveCount(0);
  await nav.getByRole('link',{name:/^Main/}).click();
  await expect(page.locator('.mobile-guest-name').first()).toBeVisible();
  await expect(page.getByRole('button',{name:'Add guest',exact:true})).toHaveCount(0);
  const context=await browser.newContext({viewport:{width:390,height:900}});
  await context.clock.install({time:TODAY});
  await mockBridge(context,h,false);
  const viewer=await context.newPage();
  await viewer.goto('http://localhost:5175/#rooms?admin=forged');
  await expect(viewer.getByRole('heading',{name:'Accommodations',exact:true})).toBeVisible();
  expect(viewer.url()).not.toContain('forged');
  await expect(viewer.getByRole('button',{name:'Assign guest',exact:true})).toHaveCount(0);
  expect(h.writes).toHaveLength(0);
  await context.close();
});

test('bus arrivals show Bus and ABE with no flight tracker', async({page})=>{
  const row=plannerGuest('P','Priya Sharma','2026-10-29','2026-11-02');
  Object.assign(row,{11:'Bus (arrival)',14:'ABE',18:'YES'});
  await setup(page,'ok',[row]);
  await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Transport',exact:true}).click();
  const bus=page.locator('.transport-journey').filter({hasText:'Bus journey'});
  await expect(bus).toContainText('Bus · ABE');
  await expect(bus).toContainText('Priya Sharma');
  await expect(bus.getByRole('link',{name:/Flight tracker/})).toHaveCount(0);
});

test('day overview adds a walk-in to the chosen bed and Main displays both dates', async ({ page }) => {
  test.setTimeout(60000);
  const h=await openPlanner(page);
  await page.getByRole('button',{name:'Day at a glance',exact:true}).click();
  await page.getByLabel('Choose occupancy date').fill('2026-10-28');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.stay-overview-room')).toHaveCount(34);
  await expect(page.locator('.stay-overview-bed')).toHaveCount(161);
  await expect(page.locator('.stay-overview')).toContainText('Bela Shah');
  await expect(page.locator('.stay-overview')).not.toContainText('Amal Patel');
  await page.getByRole('button',{name:'Assign guest to room 203 bed 2',exact:true}).click();
  await expect(page.getByLabel('Guest to assign')).toBeVisible();
  await page.getByRole('button',{name:'New walk-in guest',exact:true}).click();
  await expect(page.locator('.stay-chosen-bed')).toContainText('Room 203 · Bed 2');
  await expect(page.getByLabel('Walk-in room')).toHaveCount(0);
  await expect(page.getByLabel('Walk-in bed')).toHaveCount(0);
  await page.getByLabel('Guest name',{exact:true}).fill('Synthetic Walk In');
  await page.getByLabel('Checkout',{exact:true}).fill('2026-10-31');
  await page.getByLabel('Checkout',{exact:true}).press('Tab');
  await page.getByRole('button',{name:'Add guest & assign bed',exact:true}).click({timeout:10000});
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.stay-overview')).toContainText('Synthetic Walk In');
  expect(h.rows.find(r=>r[8]==='Synthetic Walk In').slice(29)).toEqual(['Samarpan','203','S203B2']);
  await page.setViewportSize({width:1440,height:1100});
  await page.screenshot({path:test.info().outputPath('overview-desktop.png'),fullPage:true});
  await page.goto('/#guests');
  await page.getByLabel('Search guests',{exact:true}).fill('Synthetic Walk In');
  const row=page.locator('.guest-table tbody tr').filter({hasText:'Synthetic Walk In'});
  await expect(row).toContainText('In · Oct 28');await expect(row).toContainText('Out · Oct 31');
  await page.setViewportSize({width:390,height:900});
  const card=page.locator('.mobile-guest-card').filter({hasText:'Synthetic Walk In'});
  await expect(card).toContainText('In · Oct 28');await expect(card).toContainText('Out · Oct 31');
  await expect(card).not.toContainText('12:00 AM');
  await page.screenshot({path:test.info().outputPath('main-dates-mobile.png'),fullPage:true});
});

test('trip collapse defaults for past dates and synchronizes between admin and viewer', async ({ page, browser }) => {
  const row=plannerGuest('T','Synthetic Traveller','2000-10-11','2099-10-15');
  Object.assign(row,{11:'BUS',14:'ABE',16:'ABE'});
  const h=await setup(page,'ok',[row],null); // uses real time: shared display timestamps come from the test server clock
  await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Transport',exact:true}).click();
  await expect(page.getByRole('button',{name:'Expand trips for 2000-10-11',exact:true})).toHaveCount(0);   // finished days are hidden by default
  await page.getByLabel(/Show past trips/).check();
  await page.getByRole('button',{name:'Expand trips for 2000-10-11',exact:true}).click();
  const past=page.getByRole('button',{name:'Expand Bus Arrivals 2000-10-11',exact:true});
  await expect(past).toHaveAttribute('aria-expanded','false');
  await expect(page.getByRole('button',{name:'Collapse Bus Departures 2099-10-15',exact:true})).toHaveAttribute('aria-expanded','true');
  const context=await browser.newContext({viewport:{width:390,height:900}});
  await mockBridge(context,h,false);
  const viewer=await context.newPage();await viewer.goto('http://localhost:5175/#transport');
  await viewer.getByLabel(/Show past trips/).check();
  await expect(viewer.getByRole('button',{name:'Expand Bus Arrivals 2000-10-11',exact:true})).toHaveAttribute('aria-expanded','false');
  await past.click();
  await expect(page.getByRole('button',{name:'Collapse Bus Arrivals 2000-10-11',exact:true})).toHaveAttribute('aria-expanded','true');
  await expect(viewer.getByRole('button',{name:'Collapse Bus Arrivals 2000-10-11',exact:true})).toHaveAttribute('aria-expanded','true',{timeout:15000});
  await viewer.getByRole('button',{name:'Collapse Bus Arrivals 2000-10-11',exact:true}).click();
  await expect(page.getByRole('button',{name:'Expand Bus Arrivals 2000-10-11',exact:true})).toHaveAttribute('aria-expanded','false',{timeout:15000});
  await viewer.getByRole('button',{name:'Collapse trips for 2000-10-11',exact:true}).click();
  await expect(page.getByRole('button',{name:'Expand trips for 2000-10-11',exact:true})).toHaveAttribute('aria-expanded','false',{timeout:15000});
  await expect(page.getByRole('button',{name:'Expand Bus Arrivals 2000-10-11',exact:true})).toHaveCount(0);
  await viewer.goto('http://localhost:5175/#rooms');
  await viewer.getByRole('button',{name:'Day at a glance',exact:true}).click();
  await expect(viewer.getByRole('button',{name:'Add walk-in',exact:true})).toHaveCount(0);
  await expect(viewer.getByRole('button',{name:/Assign guest to room/})).toHaveCount(0);
  expect(h.rows.length).toBe(2);expect(h.writes).toHaveLength(0);
  await page.screenshot({path:test.info().outputPath('transport-shared-mobile.png'),fullPage:true});
  await context.close();
});

test('flight status only calls the paid service on explicit request', async ({page}) => {
  const row=plannerGuest('MANUAL-FLIGHT','Test Flyer','11/1/2026 2:30 PM','11/3/2026 3:00 PM');
  Object.assign(row,{11:'Flight',14:'PHL',15:'AA123',16:'EWR',17:'UA456',18:'YES'});
  await setup(page,'ok',[row],new Date('2026-11-01T16:00:00Z'));
  let calls=0;
  await page.context().route('https://script.google.com/test-rpc',route=>{
    const req=route.request().postDataJSON(); if(req.action!=='flight')return route.fallback();
    calls++; return route.fulfill({json:{ok:true,flight:{available:false,reason:'Synthetic result'}}});
  });
  await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Transport',exact:true}).click();
  await expect(page.getByRole('button',{name:'Check flight status'}).first()).toBeVisible();
  await page.clock.fastForward(20*60*1000);
  expect(calls).toBe(0);
  await page.getByRole('button',{name:'Check flight status'}).first().click();
  await expect.poll(()=>calls).toBe(1);
  await page.clock.fastForward(20*60*1000);
  expect(calls).toBe(1);
});
