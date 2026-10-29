import test from "node:test";
import assert from "node:assert/strict";
import { HOUR, easternInstant, phoneAddress, driverDirectory, assignedTrips, tripParties, driverAssignment, tripReminders, airborneMessage, lodgingCandidates } from "../../notifications/hospitality-model.js";
import { createHospitalityWorker, createAccommodationHandler, sendOnce } from "../../notifications/hospitality-service.js";

function snapshot() {
  const base = { sourceWritable: true, status: "Registered", rsvpStatus: "Confirmed", primaryContact: "Alex Patel", registrationId: "R1", arrivalDate: "2026-10-20", arrivalTime: "16:30", arrivalTimeKnown: true, departureDate: "2026-10-24", departureTime: "12:00", departureTimeKnown: true, arrivalFlight: "UA308", departureFlight: "AA123", arrivalAirport: "EWR", departureAirport: "PHL", travelMethod: "FLIGHT", transport: "Needed", city: "Edison, NJ", phone: "202-555-0123", lodging: "Samarpan", roomNo: "007", count: 1 };
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
    async *listEntities(options) { for (const e of [...rows.values()]) if (options?.queryOptions?.filter?.includes('additionalDriver eq true') ? e.partitionKey === 'hospitality-notification-state' && e.additionalDriver : e.partitionKey === "hospitality-notification-outbox" && e.status === "pending") yield { ...e }; },
  };
}
const accepted = { sid: "MM" + "a".repeat(32), status: "queued" };

test('a declined leg cannot generate passenger or driver notifications for that leg',()=>{
  const s=snapshot();for(const g of s.guests){g.airportPickup='Not needed';g.airportDropoff='Needed';}
  const trips=assignedTrips(s);assert.equal(trips.length,1);assert.equal(trips[0].direction,'Departures');
  const party=tripParties(s,trips[0])[0];assert.ok(party);
  assert.deepEqual(tripReminders(party,party.at-8*HOUR).map(m=>m.type),['passenger_departure','driver_dropoff']);
  for(const g of s.guests)g.airportDropoff='Not needed';assert.equal(assignedTrips(s).length,0);
});

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
test('adding a driver notifies only the new driver and removal invalidates their notices',async()=>{
  const s=snapshot(),table=memoryTable(),sent=[];
  const worker=createHospitalityWorker({table,env:{HOSPITALITY_NOTIFICATIONS_ENABLED:'true'},getSnapshot:async()=>s,now:()=>easternInstant('2026-10-16','12:00'),send:async c=>{sent.push(c);return accepted;}});
  await worker();assert.equal(sent.length,0);
  s.assignments[0].additionalDrivers=[{driver:'Mira',vehicle:'Car'}];
  await worker();await worker();
  assert.equal(sent.length,1);assert.equal(sent[0].recipient,'whatsapp:+12025550125');
  s.assignments[0].additionalDrivers=[];await worker();assert.equal(sent.length,1);
  s.assignments[0].additionalDrivers=[{driver:'Mira',vehicle:'Car'}];await worker();await worker();assert.equal(sent.length,2);
});
test('multiple drivers share one flight lookup and passengers receive one reminder listing both contacts',async()=>{
  const {departureFlightCheck}=await import('../../notifications/hospitality-service.js');
  const s=snapshot();s.assignments[0].additionalDrivers=[{driver:'Mira',vehicle:'Car'}];
  const groups=assignedTrips(s).filter(g=>g.direction==='Arrivals');assert.equal(groups.length,2);
  const parties=groups.flatMap(g=>tripParties(s,g));assert.equal(parties.length,2);
  assert.equal(new Set(parties.map(p=>driverAssignment(p,1).recipient)).size,2);
  const reminders=parties.flatMap(p=>tripReminders(p,p.at-18*HOUR));
  assert.equal(reminders.length,1);assert.equal(reminders[0].variables['5'],'Raj / Mira');
  assert.match(reminders[0].variables['6'],/Raj: \+12025550124; Mira: \+12025550125/);
  const table=memoryTable();let calls=0;
  for(const g of groups)await departureFlightCheck(table,g,parties[0].at-20*HOUR,async()=>{calls++;return {available:false};});
  assert.equal(calls,1);
  s.assignments[0].driver='';
  const remaining=assignedTrips(s).filter(g=>g.direction==='Arrivals').flatMap(g=>tripParties(s,g));
  const remainingReminders=remaining.flatMap(p=>tripReminders(p,p.at-18*HOUR));
  assert.equal(remainingReminders.length,1);assert.equal(remainingReminders[0].variables['5'],'Mira');
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
test("automatic room messages can be paused without pausing transport messages", async () => {
  const now = () => easternInstant("2026-10-20", "00:00");
  const run = async env => {
    const sent = [], worker = createHospitalityWorker({ table: memoryTable(), env: { HOSPITALITY_NOTIFICATIONS_ENABLED: "true", ...env }, getSnapshot: async () => snapshot(), now, readFlight: async () => ({ available: false }), send: async c => { sent.push(c); return accepted; } });
    const summary = await worker();
    return { summary, types: sent.map(c => c.type).sort() };
  };
  const on = await run({}), off = await run({ LODGING_AUTO_NOTIFICATIONS_ENABLED: "false" }), other = await run({ LODGING_AUTO_NOTIFICATIONS_ENABLED: "true" });
  assert.equal(on.types.filter(t => t === "accommodation").length, 2);
  assert.deepEqual(other.types, on.types);
  assert.ok(on.types.some(t => t !== "accommodation"), "fixture should also produce a transport message");
  assert.deepEqual(off.types, on.types.filter(t => t !== "accommodation"));
  assert.equal(off.summary.status, "complete");
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

test('one schedule lookup and one departure check replace repeated flight polling', async () => {
  const { departureFlightCheck } = await import('../../notifications/hospitality-service.js');
  const table = memoryTable(), group = { id: 'bounded-flight' };
  const departure = Date.parse('2026-10-20T12:00:00Z');
  let calls = 0;
  const read = async () => { calls++; return { available: true, rawStatus: calls === 1 ? 'S' : 'A', scheduledDepartureUtc: '2026-10-20T12:00:00Z', expectedArrivalUtc: '2026-10-20T20:30:00Z' }; };
  for (let i = 0; i < 120; i++) await departureFlightCheck(table, group, departure - 2 * HOUR + i * 60000, read);
  assert.equal(calls, 1);
  assert.equal(await departureFlightCheck(table, group, departure + 14 * 60000, read), null);
  assert.equal((await departureFlightCheck(table, group, departure + 15 * 60000, read)).rawStatus, 'A');
  for (let i = 16; i < 400; i++) await departureFlightCheck(table, group, departure + i * 60000, read);
  assert.equal(calls, 2);
});

test('delays, missing departure times and failures never start repeated paid checks', async () => {
  const { departureFlightCheck } = await import('../../notifications/hospitality-service.js');
  for (const mode of ['delayed', 'missing', 'failure']) {
    const table = memoryTable(), group = { id: mode }; let calls = 0;
    const read = async () => { calls++; if (mode === 'failure') throw Error('network'); return { available: true, rawStatus: 'S', scheduledDepartureUtc: mode === 'missing' ? '' : '2026-10-20T12:00:00Z' }; };
    for (let i = 0; i < 100; i++) {
      try { await departureFlightCheck(table, group, Date.parse('2026-10-20T13:00:00Z') + i * 60000, read); } catch {}
    }
    assert.equal(calls, mode === 'delayed' ? 2 : 1);
  }
});

test('all relevant lodging fields reject blanks and NA variants for automatic and bulk sends', () => {
  const now=easternInstant('2026-10-19','16:30');
  for(const field of ['registrationId','name','phone','rsvpStatus','arrivalDate','arrivalTime','lodging','roomNo']) {
    for(const value of ['', ' ', 'NA', 'n/a', 'N.A.', 'N A', 'TBD', 'Unknown', '-']) {
      const s=snapshot();s.guests=[s.guests[0]];s.guests[0][field]=value;
      assert.equal(lodgingCandidates(s,now).length,0,`${field}: ${value}`);
      assert.equal(lodgingCandidates(s,now,true).length,0,`bulk ${field}: ${value}`);
    }
  }
  const valid=snapshot();valid.guests[0].departureFlight='NA';
  assert.equal(lodgingCandidates(valid,now,true).length,2,'unrelated flight fields do not block lodging');
});

test('incomplete primary, companion or driver data suppresses transport messages', () => {
  for(const field of ['name','primaryContact','city','phone','registrationId','rsvpStatus','travelMethod','arrivalDate','arrivalTime','arrivalAirport','arrivalFlight']) {
    for(const value of ['', 'NA', 'N/A']) {
      const s=snapshot();const group=assignedTrips(s)[0];s.guests[0][field]=value;
      assert.equal(tripParties(s,group).length,0,`${field}: ${value}`);
    }
  }
  for(const field of ['name','arrivalTime','arrivalFlight']) {
    const s=snapshot(), group=assignedTrips(s)[0];s.guests[1][field]='NA';
    assert.equal(tripParties(s,group).length,0,`companion ${field}`);
  }
  const s=snapshot(), group=assignedTrips(s)[0];s.drivers.get('raj').name='N/A';
  assert.equal(tripParties(s,group).length,0);
  const rawInvalid=snapshot();rawInvalid.incompleteTransportRegistrations=new Set(['R1']);
  assert.equal(tripParties(rawInvalid,assignedTrips(rawInvalid)[0]).length,0,'dropped incomplete source rows still block their registration');
});

test('a queued attendee with subsequently incomplete data is never sent', async () => {
  const s=snapshot(), table=memoryTable(), now=()=>easternInstant('2026-10-16','12:00');let sent=0;
  s.guests=[s.guests[0]];
  const handler=createAccommodationHandler({table,getSnapshot:async()=>s,authorize:async()=>true,now});
  const request=body=>({text:async()=>JSON.stringify(body)});
  const preview=(await handler(request({mode:'preview'}))).jsonBody;
  assert.equal(preview.eligible,1);
  await handler(request({mode:'queue',previewHash:preview.previewHash,requestId:'q'.repeat(36)}));
  s.guests[0].roomNo='NA';
  const worker=createHospitalityWorker({table,env:{HOSPITALITY_NOTIFICATIONS_ENABLED:'true'},getSnapshot:async()=>s,now,send:async()=>{sent++;return accepted;}});
  await worker(); assert.equal(sent,0);
  assert.equal([...table.rows.values()].find(r=>r.partitionKey==='hospitality-notification-outbox').status,'stale');
  const next=(await handler(request({mode:'preview'}))).jsonBody;
  assert.equal(next.eligible,0);assert.equal(next.skippedIncompleteData,1);
});

test('last-line sending validation blocks placeholder variables before claiming or calling Twilio', async () => {
  const table=memoryTable(), candidate=lodgingCandidates(snapshot(),0,true)[0];let sent=0;
  candidate.variables['3']='N/A';
  assert.equal((await sendOnce(table,candidate,async()=>{sent++;return accepted;})).status,'skipped_incomplete_data');
  assert.equal(sent,0);assert.equal(table.rows.size,0);
});
