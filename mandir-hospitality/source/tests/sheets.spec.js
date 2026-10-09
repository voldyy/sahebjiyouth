import { test, expect } from "@playwright/test";

async function setup(page, mode = "ok") {
  const headers = Array(32).fill("");
  Object.assign(headers, { 0: "Registration ID", 8: "Attendee Full Name", 29: "Lodging", 30: "Room No.", 31: "Room Code" });
  const row = Array(32).fill("");
  Object.assign(row, { 0: "SYNTHETIC-001", 3: "Synthetic Primary", 8: "Synthetic Guest", 9: "Self", 12: "10/18/2026", 13: "10/20/2026", 20: "YES", 24: "Confirmed" });
  const rows = [headers, row];
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
  await expect(page.getByText("Synthetic Guest", { exact: true }).last()).toBeVisible();
  return { rows, writes };
}
async function openAssignment(page) {
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Rooms", exact: true }).click();
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
