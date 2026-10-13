import test from "node:test";
import assert from "node:assert/strict";
import { HOUR, easternInstant, phoneAddress, driverDirectory, assignedTrips, tripParties, driverAssignment, tripReminders, airborneMessage, lodgingCandidates } from "../../notifications/hospitality-model.js";
import { createHospitalityWorker, createAccommodationHandler, sendOnce } from "../../notifications/hospitality-service.js";

function snapshot() {
  const base = { sourceWritable: true, status: "Registered", registrationId: "R1", arrivalDate: "2026-10-20", arrivalTime: "16:30", arrivalTimeKnown: true, departureDate: "2026-10-24", departureTime: "12:00", departureTimeKnown: true, arrivalFlight: "UA308", departureFlight: "AA123", arrivalAirport: "EWR", departureAirport: "PHL", travelMethod: "FLIGHT", transport: "Needed", city: "Edison, NJ", phone: "202-555-0123", lodging: "Samarpan", roomNo: "007", count: 1 };
  const guests = [{ ...base, sourceIdentity: "primary", name: "Alex Patel", isPrimaryContact: true }, { ...base, sourceIdentity: "child", name: "Sam Patel", isPrimaryContact: false }];
  const s = { guests, assignments: [], drivers: driverDirectory([["Type", "Name", "Active", "Updated at", "Phone number"], ["Driver", "Raj", "Yes", "", "2025550124"], ["Driver", "Mira", "Yes", "", "+12025550125"]]) };
  s.assignments = assignedTrips(s).map(g => ({ id: g.id, driver: "Raj", status: "Planned", vehicle: "Van" }));
  return s;
}
function memoryTable() {
  const rows = new Map(), key = (p, r) => `${p}/${r}`;
  return {
    rows,
    async getEntity(p, r) { const e = rows.get(key(p, r)); if (!e) throw { statusCode: 404 }; return { ...e }; },
    async createEntity(e) { const k = key(e.partitionKey, e.rowKey); if (rows.has(k)) throw { statusCode: 409 }; rows.set(k, { ...e }); },
    async updateEntity(e) { const k = key(e.partitionKey, e.rowKey); if (!rows.has(k)) throw { statusCode: 404 }; rows.set(k, { ...rows.get(k), ...e }); },
    async upsertEntity(e) { rows.set(key(e.partitionKey, e.rowKey), { ...e }); },
    async *listEntities() { for (const e of [...rows.values()]) if (e.partitionKey === "hospitality-notification-outbox" && e.status === "pending") yield { ...e }; },
  };
}
const accepted = { sid: "MM" + "a".repeat(32), status: "queued" };

test("phone validation handles North American and explicit international numbers", () => {
  assert.equal(phoneAddress("(202) 555-0123"), "whatsapp:+12025550123");
  assert.equal(phoneAddress("+44 20 7946 0123"), "whatsapp:+442079460123");
  for (const value of ["123", "unknown", "2025550123 ext 4", "2025550123/2025550124", "442079460123"]) assert.equal(phoneAddress(value), "");
});
test("airport wall-clock scheduling observes DST and rejects missing or ambiguous times", () => {
  assert.equal(new Date(easternInstant("2026-10-20", "16:30")).toISOString(), "2026-10-20T20:30:00.000Z");
  assert.equal(new Date(easternInstant("2026-11-20", "16:30")).toISOString(), "2026-11-20T21:30:00.000Z");
  assert.equal(easternInstant("2026-03-08", "02:30"), null);
  assert.equal(easternInstant("2026-11-01", "01:30"), null);
  assert.equal(easternInstant("2026-10-20", ""), null);
});
test("driver details identify only the primary and omit a companion count for solo trips", () => {
  const s = snapshot(), g = assignedTrips(s)[0], party = tripParties(s, g)[0];
  const message = driverAssignment(party, 1);
  assert.match(message.variables["2"], /^Alex Patel \(Edison, NJ\), with 1 accompanying passenger$/);
  assert.equal(message.recipient, "whatsapp:+12025550124");
  assert.equal(message.variables["3"], "+12025550123");
  assert.match(message.variables["5"], /United Airlines UA308/);
  s.guests = s.guests.slice(0, 1);
  assert.equal(driverAssignment(tripParties(s, assignedTrips(s)[0])[0], 1).variables["2"], "Alex Patel (Edison, NJ)");
});
test("ambiguous primary contacts, missing driver phones and unknown times do not produce trip notifications", () => {
  const s = snapshot(); s.guests[1].isPrimaryContact = true;
  assert.equal(tripParties(s, assignedTrips(s)[0]).length, 0);
  s.guests[1].isPrimaryContact = false; s.drivers.get("raj").phone = "";
  assert.equal(tripParties(s, assignedTrips(s)[0]).length, 0);
  s.drivers.get("raj").phone = "whatsapp:+12025550124"; s.guests[0].arrivalTimeKnown = false;
  assert.equal(tripParties(s, assignedTrips(s)[0]).length, 0);
});
test("secondary-only trips cannot impersonate the primary passenger", () => {
  const s = snapshot(); s.guests[0].arrivalFlight = "UA309";
  const childTrip = assignedTrips(s).find(g => g.flight === "UA308");
  assert.equal(tripParties(s, childTrip).length, 0);
});
test("18-hour passenger and 8-hour driver reminders respect direction and thresholds", () => {
  const s = snapshot(); const arrival = tripParties(s, assignedTrips(s).find(g => g.direction === "Arrivals"))[0];
  const departure = tripParties(s, assignedTrips(s).find(g => g.direction === "Departures"))[0];
  assert.equal(tripReminders(arrival, arrival.at - 18 * HOUR - 1).length, 0);
  assert.deepEqual(tripReminders(arrival, arrival.at - 18 * HOUR).map(c => c.type), ["passenger_arrival"]);
  assert.deepEqual(tripReminders(departure, departure.at - 8 * HOUR - 1).map(c => c.type), ["passenger_departure"]);
  assert.deepEqual(tripReminders(departure, departure.at - 8 * HOUR).map(c => c.type), ["passenger_departure", "driver_dropoff"]);
  assert.equal(tripReminders(departure, departure.at).length, 0);
});
test("airborne alerts require live flight evidence and a future FlightStats ETA", () => {
  const s = snapshot(), p = tripParties(s, assignedTrips(s)[0])[0], now = p.at - 2 * HOUR;
  const flight = { available: true, rawStatus: "S", expectedArrivalUtc: new Date(p.at).toISOString(), flightId: "123" };
  assert.equal(airborneMessage(p, flight, now), null);
  flight.rawStatus = "A";
  const first = airborneMessage(p, flight, now); assert.ok(first); assert.match(first.variables["5"], /4:30 PM/);
  flight.expectedArrivalUtc = new Date(p.at + HOUR).toISOString();
  assert.equal(airborneMessage(p, flight, now).key, first.key);
  for (const patch of [{ rawStatus: "C" }, { rawStatus: "D" }, { landed: true }, { expectedArrivalUtc: "" }]) assert.equal(airborneMessage(p, { ...flight, ...patch }, now), null);
});
test("lodging sends one addressed message per attendee, preserves room zeros and shares manual/automatic dedupe", () => {
  const s = snapshot(), at = easternInstant("2026-10-20", "16:30");
  assert.equal(lodgingCandidates(s, at - 24 * HOUR - 1).length, 0);
  const candidates = lodgingCandidates(s, at - 24 * HOUR);
  assert.equal(candidates.length, 2); assert.notEqual(candidates[0].key, candidates[1].key);
  assert.equal(candidates[0].recipient, candidates[1].recipient);
  assert.deepEqual(candidates.map(c => c.variables["1"]), ["Alex Patel", "Sam Patel"]);
  assert.equal(candidates[0].variables["3"], "007");
  assert.deepEqual(candidates.map(c => c.key), lodgingCandidates(s, at - 24 * HOUR, true).map(c => c.key));
  assert.equal(lodgingCandidates(s, at).length, 0);
});
test("concurrent sends and ambiguous outcomes cannot create duplicate messages", async () => {
  const table = memoryTable(), candidate = lodgingCandidates(snapshot(), 0, true)[0]; let count = 0;
  const send = async () => { count++; return accepted; };
  await Promise.all([sendOnce(table, candidate, send), sendOnce(table, candidate, send)]);
  assert.equal(count, 1);
  const another = lodgingCandidates(snapshot(), 0, true)[1];
  await assert.rejects(sendOnce(table, another, async () => { throw Error("timeout"); }), /requires review/);
  assert.equal((await sendOnce(table, another, send)).status, "already_claimed"); assert.equal(count, 1);
});
test("worker seeds existing assignments, detects changes, and ignores vehicle-only edits", async () => {
  const s = snapshot(), table = memoryTable(), sent = [];
  const worker = createHospitalityWorker({ table, env: { HOSPITALITY_NOTIFICATIONS_ENABLED: "true" }, getSnapshot: async () => s, now: () => easternInstant("2026-10-16", "12:00"), send: async c => { sent.push(c); return accepted; } });
  await worker(); assert.equal(sent.length, 0);
  s.assignments[0].driver = "Mira";
  await worker(); assert.equal(sent.filter(c => c.type === "driver_assignment").length, 1);
  s.assignments[0].vehicle = "Car"; await worker(); assert.equal(sent.length, 1);
  s.assignments[0].driver = ""; await worker(); s.assignments[0].driver = "Mira"; await worker(); assert.equal(sent.length, 2);
});
test("bulk sending verifies admin access, previews every attendee, rejects stale lists and queues without sending", async () => {
  const table = memoryTable(), s = snapshot(); let reads = 0;
  const handler = createAccommodationHandler({ table, getSnapshot: async () => { reads++; return s; }, authorize: async key => key === "valid", now: () => 0 });
  const request = body => ({ text: async () => JSON.stringify(body) });
  assert.equal((await handler(request({ mode: "preview", accessKey: "bad" }))).status, 403); assert.equal(reads, 0);
  const preview = (await handler(request({ mode: "preview", accessKey: "valid" }))).jsonBody;
  assert.equal(preview.eligible, 2);
  assert.equal((await handler(request({ mode: "queue", accessKey: "valid", previewHash: "stale", requestId: "a".repeat(36) }))).status, 409);
  const body = { mode: "queue", accessKey: "valid", previewHash: preview.previewHash, requestId: "a".repeat(36) };
  assert.equal((await handler(request(body))).jsonBody.queued, 2);
  assert.equal((await handler(request(body))).jsonBody.queued, 0);
  assert.equal([...table.rows.values()].filter(r => r.partitionKey === "hospitality-notifications").length, 0);
});
test("manual lodging batches and automatic reminders cannot send twice", async () => {
  const s = snapshot(), table = memoryTable(), now = () => easternInstant("2026-10-19", "16:30"), sent = [];
  const handler = createAccommodationHandler({ table, getSnapshot: async () => s, authorize: async () => true, now });
  const req = body => ({ text: async () => JSON.stringify(body) });
  const preview = (await handler(req({ mode: "preview" }))).jsonBody;
  await handler(req({ mode: "queue", previewHash: preview.previewHash, requestId: "b".repeat(36) }));
  const worker = createHospitalityWorker({ table, env: { HOSPITALITY_NOTIFICATIONS_ENABLED: "true" }, getSnapshot: async () => s, now, readFlight: async () => ({ available: false }), send: async c => { sent.push(c); return accepted; } });
  await worker(); await worker(); assert.equal(sent.filter(c => c.type === "accommodation").length, 2);
});
