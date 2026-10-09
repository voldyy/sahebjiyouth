import { test } from "node:test";
import assert from "node:assert/strict";
import { guestsFromRows, attendeeKey, sheetDate, validateAssignment, writeLodging } from "../../src/lib/sheets.js";

const header = () => { const row = Array(32).fill(""); row[0] = "Registration ID"; row[8] = "Attendee Full Name"; row[29] = "Lodging"; row[30] = "Room No."; row[31] = "Room Code"; return row; };
const attendee = (id = "TEST-1", name = "Test Guest") => {
  const row = Array(32).fill("");
  Object.assign(row, { 0: id, 3: "Test Primary", 8: name, 9: "Self", 12: "10/18/2026 2:30 PM", 13: "10/20/2026", 20: "YES", 24: "Confirmed" });
  return row;
};

test("attendees are not multiplied by registration groups and dates are interpreted without timezone shifts", () => {
  const rows = [header(), attendee(), attendee("TEST-1", "Second Guest")];
  const guests = guestsFromRows(rows);
  assert.equal(guests.length, 2);
  assert.equal(guests.reduce((sum, g) => sum + g.count, 0), 2);
  assert.equal(guests[0].arrivalDate, "2026-10-18");
  assert.equal(guests[0].arrivalTime, "14:30");
  assert.equal(guests[0].status, "Registered");
  assert.equal(guests[0].stay, "Pending lodging");
  assert.notEqual(guests[0].id, guests[1].id);
  assert.deepEqual(sheetDate("Date(2026,9,18,14,30,0)"), { date: "2026-10-18", time: "14:30" });
  assert.deepEqual(sheetDate("2/30/2026"), { date: "", time: "" });
  assert.deepEqual(sheetDate(1), { date: "1899-12-31", time: "00:00" });
});
test("duplicate or missing identities and unexpected headers are handled safely", () => {
  assert.equal(guestsFromRows([header(), attendee(), attendee()])[0].sourceWritable, false);
  assert.equal(guestsFromRows([header(), []]).length, 0);
  assert.throws(() => guestsFromRows([[], attendee()]), /Registration ID/);
  assert.throws(() => validateAssignment({ lodging: "Other", roomNo: "1", roomCode: "X" }), /Choose a lodging/);
  assert.throws(() => validateAssignment({ lodging: "Samarpan", roomNo: "1", roomCode: "" }), /both/);
  assert.deepEqual(validateAssignment({ lodging: "", roomNo: "", roomCode: "" }), ["", "", ""]);
});

function mockGoogle(t, initialRows, fail = false) {
  const rows = structuredClone(initialRows);
  const writes = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(options.headers.Authorization, /^Bearer synthetic-token$/);
    if (options.method === "PUT") {
      writes.push({ url: decodeURIComponent(url), ...JSON.parse(options.body) });
      if (fail) return new Response("{}", { status: 403 });
      const row = Number(writes.at(-1).range.match(/AD(\d+)/)[1]);
      rows[row - 1].splice(29, 3, ...writes.at(-1).values[0]);
      return Response.json({ updatedCells: 3 });
    }
    return url.includes("fields=sheets.properties") ? Response.json({ sheets: [{ properties: { sheetId: 0, title: "Guest's Roster" } }] }) : Response.json({ values: rows });
  });
  return { rows, writes };
}
test("a moved attendee writes only current AD:AF as RAW text and reads back confirmation", async (t) => {
  const target = attendee();
  const guest = guestsFromRows([header(), target])[0];
  const google = mockGoogle(t, [header(), attendee("OTHER"), target]);
  const result = await writeLodging(guest, { lodging: "Comfort Inn", roomNo: "021", roomCode: "CI-021" }, "synthetic-token");
  assert.deepEqual(result, ["Comfort Inn", "021", "CI-021"]);
  assert.equal(google.writes[0].range, "'Guest''s Roster'!AD3:AF3");
  assert.match(google.writes[0].url, /valueInputOption=RAW/);
  assert.equal(google.rows[2][0], "TEST-1");
  assert.equal(google.rows[2][30], "021");
  assert.equal(google.writes.length, 1);
  assert.equal(attendeeKey(google.rows[2]), guest.sourceIdentity);
});
test("stale lodging or duplicate attendees cause no write", async (t) => {
  const target = attendee();
  const guest = guestsFromRows([header(), target])[0];
  target[29] = "Hawthorn";
  const google = mockGoogle(t, [header(), target]);
  await assert.rejects(writeLodging(guest, { lodging: "Samarpan", roomNo: "12", roomCode: "S12" }, "synthetic-token"), /Someone changed/);
  google.rows.push(structuredClone(target));
  await assert.rejects(writeLodging(guest, { lodging: "Samarpan", roomNo: "12", roomCode: "S12" }, "synthetic-token"), /duplicated/);
  assert.equal(google.writes.length, 0);
});
test("clearing touches only the three lodging fields, and a denied write never reports success", async (t) => {
  const target = attendee();
  target.splice(29, 3, "Samarpan", "001", "S-001");
  const guest = guestsFromRows([header(), target])[0];
  const google = mockGoogle(t, [header(), target]);
  await writeLodging(guest, { lodging: "", roomNo: "", roomCode: "" }, "synthetic-token");
  assert.deepEqual(google.rows[1].slice(0, 29), target.slice(0, 29));
  assert.deepEqual(google.rows[1].slice(29), ["", "", ""]);
});
test("permission failure does not retry or change the snapshot", async (t) => {
  const target = attendee();
  const google = mockGoogle(t, [header(), target], true);
  await assert.rejects(writeLodging(guestsFromRows([header(), target])[0], { lodging: "Hawthorn", roomNo: "007", roomCode: "H007" }, "synthetic-token"), /cannot edit/);
  assert.equal(google.writes.length, 1);
  assert.deepEqual(google.rows[1].slice(29), ["", "", ""]);
});
