import { test, expect } from "@playwright/test";

async function setup(page, mode = "ok", attendeeRows = null) {
  const headers = Array(32).fill("");
  Object.assign(headers, { 0: "Registration ID", 8: "Attendee Full Name", 29: "Lodging", 30: "Room No.", 31: "Room Code" });
  const row = Array(32).fill("");
  Object.assign(row, { 0: "SYNTHETIC-001", 3: "Synthetic Primary", 8: "Synthetic Guest", 9: "Self", 12: "10/18/2026", 13: "10/20/2026", 20: "YES", 24: "Confirmed" });
  const rows = [headers, ...(attendeeRows || [row])];
  const writes = [];
  await page.addInitScript(() => localStorage.setItem("mandir.google-client-id", "123-test.apps.googleusercontent.com"));
  await page.route("https://accounts.google.com/gsi/client", (route) => route.fulfill({ contentType: "application/javascript", body: "window.google={accounts:{oauth2:{initTokenClient:(options)=>({requestAccessToken:()=>options.callback({access_token:'synthetic-token',expires_in:3600})})}}};" }));
  await page.route("https://docs.google.com/spreadsheets/**", async (route) => {
    const callback = new URL(route.request().url()).searchParams.get("tqx").split("responseHandler:")[1];
    await route.fulfill({ contentType: "application/javascript", body: `${callback}(${JSON.stringify({ status: "ok", table: { cols: headers.map((label) => ({ label })), rows: rows.slice(1).map((r) => ({ c: r.map((v) => ({ v })) })) } })});` });
  });
  await page.route("https://sheets.googleapis.com/**", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      writes.push(request.postDataJSON());
      if (mode === "denied") return route.fulfill({ status: 403, json: {} });
      const n = Number(writes.at(-1).range.match(/AD(\d+)/)[1]);
      rows[n - 1].splice(29, 3, ...writes.at(-1).values[0]);
      return route.fulfill({ json: { updatedCells: 3 } });
    }
    await route.fulfill({ json: request.url().includes("fields=sheets.properties") ? { sheets: [{ properties: { sheetId: 0, title: "Attendees" } }] } : { values: rows } });
  });
  await page.goto("/");
  await expect(page.locator(".mobile-guest-name").first()).toBeVisible();
  return { rows, writes };
}
async function openAssignment(page) {
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Rooms", exact: true }).click();
  await page.getByRole("button", { name: "Guest list", exact: true }).click();
  await page.getByRole("button", { name: "Assign lodging", exact: true }).click();
  await page.getByLabel("Lodging location (AD)").selectOption("Comfort Inn");
  await page.getByLabel("Room number (AE)").fill("021");
  await page.getByLabel("Custom room code (AF)").fill("CI-021");
}
test("sheet source replaces demo data and authorized assignment persists AD–AF only", async ({ page }) => {
  const { rows, writes } = await setup(page);
  await expect(page.getByText("Girishbhai & Taraben Patel", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add guest", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Sign in with Google", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await openAssignment(page);
  await page.getByRole("button", { name: "Save assignment to sheet" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes).toEqual([{ range: "'Attendees'!AD2:AF2", majorDimension: "ROWS", values: [["Comfort Inn", "021", "CI-021"]] }]);
  expect(rows[1][8]).toBe("Synthetic Guest");
  await expect(page.getByText("Room: 021", { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain("Synthetic Guest");
  expect(stored).not.toContain("synthetic-token");
  await page.reload();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Rooms", exact: true }).click();
  await page.getByRole("button", { name: "Guest list", exact: true }).click();
  await expect(page.getByText("Room: 021", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google", exact: true })).toBeVisible();
  const dimensions = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(dimensions[0]).toBeLessThanOrEqual(dimensions[1]);
});
test("read-only source never writes an assignment before Google authorization", async ({ page }) => {
  const { writes } = await setup(page);
  await openAssignment(page);
  await expect(page.getByRole("button", { name: "Save assignment to sheet" })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath("lodging-assignment.png"), fullPage: true });
  expect(writes).toHaveLength(0);
});
test("Google permission failure leaves the form open and does not report success", async ({ page }) => {
  const { rows, writes } = await setup(page, "denied");
  await page.getByRole("button", { name: "Sign in with Google", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await openAssignment(page);
  await page.getByRole("button", { name: "Save assignment to sheet" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("cannot edit");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(rows[1].slice(29)).toEqual(["", "", ""]);
  await expect(page.getByText("Lodging saved to Google Sheets (AD–AF).", { exact: true })).toHaveCount(0);
});
test("Samarpan offers only confirmed rooms with bed capacities", async ({ page }) => {
  await setup(page);
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Rooms", exact: true }).click();
  await page.getByRole("button", { name: "Guest list", exact: true }).click();
  await page.getByRole("button", { name: "Assign lodging", exact: true }).click();
  const room = page.getByLabel("Room number (AE)");
  await expect(room).toHaveJSProperty("tagName", "SELECT");
  await expect(room.locator("option")).toHaveText(["Choose a Samarpan room", "204 · 4 beds", "205 · 4 beds", "206 · 4 beds", "207 · 4 beds", "100 · 7 beds", "101 · 12 beds", "102 · 12 beds", "103 · 12 beds", "104 · 12 beds"]);
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
  await expect(page.getByLabel("Room number (AE)")).toHaveValue("");
  await expect(page.getByLabel("Room number (AE)")).toHaveJSProperty("tagName", "INPUT");
});

function plannerGuest(id, name, start, end, room = "", bed = "") {
  const row = Array(32).fill("");
  Object.assign(row, { 0: id, 3: name, 8: name, 9: "Self", 12: start, 13: end, 20: "YES", 24: "Confirmed", 29: room ? "Samarpan" : "", 30: room, 31: room ? `S${room}B${bed}` : "" });
  return row;
}
const plannerRows = () => [
  plannerGuest("A", "Amal Patel", "2026-10-11", "2026-10-14", "204", "1"),
  plannerGuest("B", "Bela Shah", "2026-10-14", "2026-10-17", "204", "1"),
  plannerGuest("C", "Chirag Mehta", "2026-10-11", "2026-10-17"),
  plannerGuest("D", "Dev Shah", "2026-10-18", "2026-10-20"),
  plannerGuest("E", "Erin Patel", "2026-10-12", "2026-10-13", "101", "12"),
  plannerGuest("F", "Guest Missing Dates", "", ""),
];
async function openPlanner(page) {
  const result = await setup(page, "ok", plannerRows());
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Rooms", exact: true }).click();
  return result;
}
const slot = (page, room, bed, day) => page.locator(`.stay-slot[data-room="${room}"][data-bed="${bed}"][data-day="${day}"]`);

test("weekly calendar has six bounded weeks, correct room beds, and checkout-day handoffs", async ({ page }) => {
  await openPlanner(page);
  await expect(page.getByRole("button", { name: "Weekly view" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Oct 11 – Oct 17, 2026" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous week", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Room 204 4 beds", exact: true }).click();
  await expect(page.locator(".stay-week-grid tbody tr")).toHaveCount(4);
  await expect(slot(page, "204", "1", "2026-10-13")).toContainText("Amal Patel");
  await expect(slot(page, "204", "1", "2026-10-14")).toContainText("Bela Shah");
  await expect(slot(page, "204", "1", "2026-10-14")).not.toContainText("Amal Patel");
  await expect(slot(page, "204", "1", "2026-10-17")).toContainText("Empty bed");
  for (const label of ["Oct 18 – Oct 24, 2026", "Oct 25 – Oct 31, 2026", "Nov 1 – Nov 7, 2026", "Nov 8 – Nov 14, 2026", "Nov 15 – Nov 21, 2026"]) {
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Next week", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Room 204 4 beds", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Previous week", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nov 8 – Nov 14, 2026" })).toBeVisible();
});

test("daily view shows all 71 beds, date-filtered unassigned guests, and saves from an empty bed", async ({ page }) => {
  const { writes } = await openPlanner(page);
  await page.getByRole("button", { name: "Sign in with Google", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Daily view", exact: true }).click();
  await expect(page.locator(".stay-day-room")).toHaveCount(9);
  await expect(page.locator(".stay-day-beds .stay-slot")).toHaveCount(71);
  await expect(page.getByRole("button", { name: "Assign Chirag Mehta", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign Dev Shah", exact: true })).toHaveCount(0);
  await expect(page.getByText("1 unassigned guests need stay dates")).toBeVisible();
  await slot(page, "204", "2", "2026-10-11").getByRole("button").click();
  await page.getByLabel("Guest to assign").selectOption({ label: "Chirag Mehta · Oct 11 – Oct 17" });
  await expect(page.getByLabel("Room number (AE)")).toHaveValue("204");
  await expect(page.getByLabel("Custom room code (AF)")).toHaveValue("S204B2");
  await expect(page.getByLabel("Bed number").locator('option[value="1"]')).toHaveJSProperty("disabled", true);
  await page.getByRole("button", { name: "Save assignment to sheet" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes[0].values).toEqual([["Samarpan", "204", "S204B2"]]);
  await expect(slot(page, "204", "2", "2026-10-11")).toContainText("Chirag Mehta");
  await expect(page.getByRole("button", { name: "Assign Chirag Mehta", exact: true })).toHaveCount(0);
  await page.getByLabel("Choose occupancy date").fill("2026-10-18");
  await expect(page.getByRole("button", { name: "Assign Dev Shah", exact: true })).toBeVisible();
  await expect(slot(page, "204", "2", "2026-10-18")).toContainText("Empty bed");
});

test("calendar layouts fit mobile and desktop and the weekly day header opens daily view", async ({ page }) => {
  await openPlanner(page);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const mode of ["Weekly view", "Daily view"]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      if (mode === "Weekly view") await page.getByRole("button", { name: "Room 204 4 beds", exact: true }).click();
      const size = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(size[0]).toBeLessThanOrEqual(size[1]);
      if (width === 1440) await page.screenshot({ path: test.info().outputPath(`${mode}.png`), fullPage: true });
    }
  }
  await page.getByRole("button", { name: "Weekly view", exact: true }).click();
  await page.getByRole("button", { name: "Open daily view for Wednesday, October 14, 2026", exact: true }).click();
  await expect(page.getByLabel("Choose occupancy date")).toHaveValue("2026-10-14");
  await expect(slot(page, "204", "1", "2026-10-14")).toContainText("Bela Shah");
});
