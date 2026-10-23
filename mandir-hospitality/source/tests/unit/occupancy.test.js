import { test } from "node:test";
import assert from "node:assert/strict";
import { WEEK_STARTS, moveDay, stayRange, onDay, bedState, assignmentIssue } from "../../src/lib/occupancy.js";

const guest = (id, start, end, room = "204", bed = 1) => ({ id, name: id, lodging: "Samarpan", roomNo: room, roomCode: `S${room}B${bed}`, arrivalDate: start, departureDate: end, status: "Registered" });
test("stay nights use accommodation dates and allow checkout-day reuse", () => {
  const a = { ...guest("A", "2026-10-11", "2026-10-17"), accommodationIn: "2026-10-12", accommodationOut: "2026-10-14" };
  assert.deepEqual(stayRange(a), { start: "2026-10-12", end: "2026-10-14" });
  assert.equal(onDay(a, "2026-10-11"), false);
  assert.equal(onDay(a, "2026-10-13"), true);
  assert.equal(onDay(a, "2026-10-14"), false);
  const b = guest("B", "2026-10-14", "2026-10-17");
  assert.equal(assignmentIssue([a], b, b), "");
  assert.match(assignmentIssue([a], guest("C", "2026-10-13", "2026-10-17"), b), /occupied/);
  assert.equal(assignmentIssue([a], a, a), "");
});
test("empty-on-click beds are checked over the full stay including later nights", () => {
  const a = guest("A", "2026-10-15", "2026-10-18");
  const b = guest("B", "2026-10-11", "2026-10-17");
  assert.equal(bedState([a], "204", 1, { start: "2026-10-11", end: "2026-10-12" }).free, true);
  assert.match(assignmentIssue([a], b, b), /occupied/);
  assert.equal(assignmentIssue([{ ...a, status: "Cancelled" }], b, b), "");
});
test("unknown dates and unrecognized bed codes are flagged instead of appearing empty", () => {
  const a = guest("A", "", "");
  const range = { start: "2026-10-11", end: "2026-10-12" };
  assert.equal(bedState([a], "204", 1, range).free, false);
  assert.equal(bedState([a], "204", 2, range).free, true);
  const unmapped = { ...guest("B", "2026-10-11", "2026-10-17"), roomCode: "legacy" };
  assert.equal(bedState([unmapped], "204", 2, range).free, false);
  assert.match(assignmentIssue([], a, a), /valid accommodation/);
  assert.equal(stayRange(guest("C", "2026-10-15", "2026-10-15")), null);
});
test("all six weeks retain calendar dates across the daylight-saving boundary", () => {
  assert.deepEqual(WEEK_STARTS, ["2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08", "2026-11-15"]);
  assert.equal(moveDay("2026-11-01", 6), "2026-11-07");
  assert.equal(moveDay(WEEK_STARTS.at(-1), 6), "2026-11-21");
});

test('Sadhak beds have independent inventory and full-stay occupancy from Samarpan', async () => {
  const { sadhakRooms, roomAssignment, roomKey } = await import('../../src/lib/lodgingRooms.js');
  const { validateAssignment } = await import('../../src/lib/sheets.js');
  assert.deepEqual(sadhakRooms.map(r => [r.number,r.beds]), [['101',3],['102',3],['104',2],['201',1],['202',3],['203',2],['204',2]]);
  const room = sadhakRooms.find(r => r.number === '101');
  const value = roomAssignment(room, 3);
  assert.deepEqual(value, {lodging:'Sadhak',roomNo:'101',roomCode:'SD101B3'});
  assert.notEqual(roomKey(room), roomKey({number:'101'}));
  assert.deepEqual(validateAssignment(value), ['Sadhak','101','SD101B3']);
  assert.throws(() => validateAssignment({...value,roomCode:'SD101B4'}), /valid bed/);
  assert.throws(() => validateAssignment({...value,roomCode:'S101B3'}), /valid bed/);
  const incoming = {...guest('Incoming','2026-10-11','2026-10-17'), ...value};
  const samarpan = guest('Samarpan','2026-10-11','2026-10-17','101',3);
  assert.equal(assignmentIssue([samarpan],incoming,value), '');
  const sadhak = {...guest('Later','2026-10-15','2026-10-18'), ...value};
  assert.equal(bedState([sadhak], '101', 3, {start:'2026-10-11',end:'2026-10-12'},null,'Sadhak').free,true);
  assert.match(assignmentIssue([sadhak],incoming,value), /occupied/);
  assert.equal(assignmentIssue([sadhak],{...incoming,arrivalDate:'2026-10-18',departureDate:'2026-10-20'},value), '');
});

test("capacity reached counts assigned beds against all beds, per day, and reports the busiest day", async () => {
  const { lodgingOccupancy } = await import("../../src/lib/occupancy.js");
  const rooms = [{ number: "204", beds: 3 }, { number: "203", beds: 1 }];
  const guests = [
    guest("A", "2026-10-26", "2026-10-29", "204", 1), guest("B", "2026-10-27", "2026-10-30", "204", 2), guest("C", "2026-10-27", "2026-10-28", "203", 1),
    { ...guest("D", "2026-10-27", "2026-10-29"), lodging: "", roomNo: "", roomCode: "" },                // staying, no bed yet
    { ...guest("E", "2026-10-27", "2026-10-29", "204", 3), status: "Cancelled" },                        // cancelled guests free their bed
    { ...guest("F", "2026-10-27", "2026-10-29", "204", 3), stay: "Day visitor" },
    { ...guest("G", "2026-10-27", "2026-10-29", "204", 3), roomCode: "S204B9" },                          // a bed that does not exist is not counted
  ];
  const days = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"];
  const result = lodgingOccupancy(guests, "Samarpan", rooms, days);
  assert.equal(result.capacity, 4);
  assert.deepEqual(result.perDay.map((d) => [d.filled, d.percent]), [[1, 25], [3, 75], [2, 50], [1, 25]]);
  assert.equal(result.perDay[1].unassigned, 1, "only D lacks a lodging; G's bad bed code is a review item, not a free bed or a filled one");
  assert.equal(result.peak.day, "2026-10-27");
  assert.equal(lodgingOccupancy(guests, "Samarpan", [], days).perDay[0].percent, 0);
});
