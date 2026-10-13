import { SPREADSHEET_ID, guestsFromRows } from "../src/lib/sheets.js";
import templates from "./hospitality-templates.json" with { type: "json" };
import { HOUR, digest, driverDirectory, assignedTrips, tripParties, driverAssignment, tripReminders, airborneMessage, lodgingCandidates, phoneAddress, utcInstant } from "./hospitality-model.js";

export const SCHEDULE = "0 * * * * *";
export const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxYBR2sIywbufmytSNLiQvGRy2oYg_tsMTEqdUj855z1LX8OJcDf6rTI0gR14kzdzpGog/exec";
const CLAIMS = "hospitality-notifications", STATE = "hospitality-notification-state", OUTBOX = "hospitality-notification-outbox";
const headers = {
  "Transport Resources": ["Type", "Name", "Active", "Updated at", "Phone number"],
  "Transport Assignments": ["Journey ID", "Direction", "Date", "Flight / service", "Airport", "Attendees", "Driver", "Vehicle", "Pickup / mandir departure", "Status", "Notes", "Revision", "Updated at", "Request ID"],
};
async function readTable(name, fetchImpl) {
  const query = new URLSearchParams({ sheet: name, headers: "1", tqx: "out:json", _: String(Date.now()) });
  const response = await fetchImpl(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?${query}`, { signal: AbortSignal.timeout(25000), cache: "no-store" });
  if (!response.ok) throw Error("Unable to read hospitality data");
  const raw = await response.text();
  if (raw.length > 5 * 1024 * 1024) throw Error("Hospitality data exceeds the read limit");
  const match = raw.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) throw Error("Invalid hospitality data response");
  let data;
  try { data = JSON.parse(match[1]); } catch { throw Error("Invalid hospitality data JSON"); }
  if (data.status !== "ok" || !data.table?.rows || !data.table?.cols) throw Error("Hospitality sheet is unavailable");
  const columns = data.table.cols.map(c => c.label);
  const expected = headers[name] || { 0: "Registration ID", 2: "Is Primary Contact?", 5: "Primary Phone", 8: "Attendee Full Name", 12: "Arrival Date Time", 13: "Departure Date Time", 24: "RSVP Status", 29: "Lodging", 30: "Room No." };
  if (Object.entries(expected).some(([i, value]) => columns[i] !== value)) throw Error(`The ${name} columns changed; notifications paused`);
  return [columns, ...data.table.rows.map(row => columns.map((_, i) => {
    const cell = row.c[i];
    return name === "Sheet1" && [12, 13, 21, 22].includes(i) ? cell?.v ?? "" : cell?.f ?? cell?.v ?? "";
  }))];
}
export async function loadSnapshot(fetchImpl = fetch) {
  const [rows, resources, assignments] = await Promise.all(["Sheet1", "Transport Resources", "Transport Assignments"].map(name => readTable(name, fetchImpl)));
  const validAssignments = assignments.slice(1).filter(r => r[0]);
  if (new Set(validAssignments.map(r => r[0])).size !== validAssignments.length) throw Error("Duplicate transport assignments; notifications paused");
  return {
    guests: guestsFromRows(rows), drivers: driverDirectory(resources),
    assignments: validAssignments.map(r => ({ id: r[0], driver: r[6], vehicle: r[7], pickup: r[8], status: r[9], notes: r[10], revision: r[11] })),
  };
}
async function scriptRequest(body, fetchImpl = fetch) {
  const response = await fetchImpl(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw Error("Hospitality backend unavailable");
  let result;
  try { result = await response.json(); } catch { throw Error("Hospitality backend needs its notification deployment"); }
  if (!result.ok) throw Error(result.error || "Hospitality backend rejected the request");
  return result;
}
export async function verifyAdmin(accessKey, fetchImpl = fetch) {
  if (typeof accessKey !== "string" || accessKey.length < 32 || accessKey.length > 160) return false;
  return (await scriptRequest({ action: "notification-authorize", accessKey }, fetchImpl)).authorized === true;
}
export function messagingClient(env, fetchImpl = fetch) {
  if (!/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID || "") || !/^SK[0-9a-f]{32}$/i.test(env.TWILIO_API_KEY || "") || !env.TWILIO_API_SECRET || !phoneAddress(env.TWILIO_WHATSAPP_FROM?.replace("whatsapp:", ""))) throw Error("Twilio is not configured");
  const auth = "Basic " + Buffer.from(`${env.TWILIO_API_KEY}:${env.TWILIO_API_SECRET}`).toString("base64");
  return async candidate => {
    const template = templates[candidate.type];
    if (!template || Object.values(candidate.variables).some(v => !v || v.length > 1000 || /[\r\n\t]/.test(v))) throw Error("Invalid notification variables");
    const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: env.TWILIO_WHATSAPP_FROM, To: candidate.recipient, MessagingServiceSid: "MG88f1fc4ecdb340549c259343d48d7f54", ContentSid: template.sid, ContentVariables: JSON.stringify(candidate.variables), ValidityPeriod: "3600" }),
    });
    let result;
    try { result = await response.json(); } catch { throw Error("Twilio outcome is uncertain"); }
    if (!response.ok) throw Error(`Twilio rejected the notification (HTTP ${response.status}, code ${Number(result.code) || 0})`);
    if (!/^(SM|MM)[0-9a-f]{32}$/i.test(result.sid || "") || !["accepted", "queued", "sending", "sent", "delivered", "read"].includes(result.status)) throw Error("Twilio did not confirm acceptance");
    return { sid: result.sid, status: result.status };
  };
}
async function get(table, partitionKey, rowKey) {
  try { return await table.getEntity(partitionKey, rowKey); } catch (e) { if (e.statusCode === 404) return null; throw e; }
}
async function create(table, entity) {
  try { await table.createEntity(entity); return true; } catch (e) { if (e.statusCode === 409) return false; throw e; }
}
export async function sendOnce(table, candidate, send, now = Date.now) {
  const claim = { partitionKey: CLAIMS, rowKey: candidate.key, type: candidate.type, status: "sending", createdAt: new Date(now()).toISOString() };
  if (!await create(table, claim)) return { status: "already_claimed" };
  try {
    const message = await send(candidate);
    await table.updateEntity({ partitionKey: CLAIMS, rowKey: candidate.key, status: "accepted", messageSid: message.sid, twilioStatus: message.status }, "Merge");
    return { status: "accepted", sid: message.sid };
  } catch (error) {
    try { await table.updateEntity({ partitionKey: CLAIMS, rowKey: candidate.key, status: "review", error: String(error.message).slice(0, 200) }, "Merge"); } catch {}
    throw Error(`Notification ${candidate.key} requires review; automatic resend blocked`);
  }
}
// Two durable, one-shot stages per flight. Failures are not polled or retried.
export async function departureFlightCheck(table, group, now, readFlight) {
  const id = digest(group.id);
  async function stage(name) {
    const rowKey = `flight-once-${name}-${id}`;
    const existing = await get(table, STATE, rowKey);
    if (existing) return existing.flightJson ? JSON.parse(existing.flightJson) : null;
    if (!await create(table, { partitionKey: STATE, rowKey, checkedAt: now, status: "checking" })) return null;
    try {
      const flight = await readFlight(group);
      await table.updateEntity({ partitionKey: STATE, rowKey, status: "complete", flightJson: JSON.stringify(flight) }, "Merge");
      return flight;
    } catch (error) {
      try { await table.updateEntity({ partitionKey: STATE, rowKey, status: "failed" }, "Merge"); } catch {}
      throw error;
    }
  }
  const schedule = await stage("schedule");
  if (!schedule?.available) return null;
  if (schedule.landed || ["C", "D"].includes(schedule.rawStatus)) return null;
  if (schedule.rawStatus === "A" || utcInstant(schedule.actualRunwayDepartureUtc) !== null) return schedule;
  const departure = utcInstant(schedule.scheduledDepartureUtc);
  // Missing schedule data never falls back to periodic polling.
  if (departure === null || now < departure + 15 * 60000) return null;
  return stage("departure");
}

export function createHospitalityWorker({ table, env, getSnapshot = loadSnapshot, now = Date.now, send, readFlight = async group => (await scriptRequest({ action: "notification-flight", tripId: group.id })).flight }) {
  return async (_timer, context) => {
    if (env.HOSPITALITY_NOTIFICATIONS_ENABLED !== "true") return { status: "disabled" };
    const started = now(), snapshot = await getSnapshot(), groups = assignedTrips(snapshot);
    const initialized = await get(table, STATE, "initialized");
    if (!initialized) {
      // Record all pre-existing assignments before sending assignment-change alerts.
      // Atomic creates make an interrupted bootstrap safe to repeat.
      await Promise.all(groups.map(group => {
        const driver = snapshot.drivers.get(group.plan.driver?.trim().toLowerCase());
        return create(table, { partitionKey: STATE, rowKey: "trip-" + digest(group.id), binding: driver?.phone ? digest([driver.name, driver.phone]) : "", epoch: 1 });
      }));
      await create(table, { partitionKey: STATE, rowKey: "initialized", initializedAt: new Date(started).toISOString() });
    }
    const candidates = lodgingCandidates(snapshot, started), issues = [];
    for (const group of groups) {
      if (now() - started > 65000) break;
      const rowKey = "trip-" + digest(group.id), previous = await get(table, STATE, rowKey);
      const driver = snapshot.drivers.get(group.plan.driver?.trim().toLowerCase());
      const binding = driver?.phone ? digest([driver.name, driver.phone]) : "";
      const epoch = previous ? Number(previous.epoch) + (previous.binding !== binding ? 1 : 0) : 1;
      const parties = tripParties(snapshot, group);
      for (const party of parties) {
        if (party.at > started && binding && (previous ? previous.binding !== binding : !!initialized)) candidates.push(driverAssignment(party, epoch));
        candidates.push(...tripReminders(party, started));
      }
      if (!previous || previous.binding !== binding) {
        // Save state only after assignment candidates have durable outbox records.
        for (const candidate of candidates.filter(c => c.type === "driver_assignment" && c.detail.trip === digest(group.id))) {
          await create(table, { partitionKey: OUTBOX, rowKey: candidate.key, status: "pending", candidateJson: JSON.stringify(candidate), tripId: group.id, binding, createdAt: new Date(started).toISOString() });
        }
        await table.upsertEntity({ partitionKey: STATE, rowKey, binding, epoch }, "Replace");
      }
      if (group.method === "Flight" && parties.some(p => p.arrival && started >= p.at - 24 * HOUR && started <= p.at + 6 * HOUR)) {
        try {
          const flight = await departureFlightCheck(table, group, started, readFlight);
          for (const party of parties) { const message = airborneMessage(party, flight, started); if (message) candidates.push(message); }
        } catch { issues.push("flight lookup unavailable"); }
      }
    }
    if (!initialized) await create(table, { partitionKey: STATE, rowKey: "initialized", initializedAt: new Date(started).toISOString() });
    const currentLodging = new Map(lodgingCandidates(snapshot, started, true).map(c => [c.key, c]));
    const outbox = [];
    for await (const row of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${OUTBOX}' and status eq 'pending'` } })) {
      if (outbox.length >= 100) break;
      let candidate = currentLodging.get(row.rowKey);
      if (row.candidateJson) {
        const group = groups.find(g => g.id === row.tripId), driver = group && snapshot.drivers.get(group.plan.driver?.trim().toLowerCase());
        const currentBinding = driver?.phone ? digest([driver.name, driver.phone]) : "";
        // Reassignment/removal invalidates queued notices to the former driver.
        if (group && row.binding === currentBinding) {
          const state = await get(table, STATE, "trip-" + digest(group.id));
          candidate = tripParties(snapshot, group).filter(p => p.at > started).map(p => driverAssignment(p, state?.epoch)).find(c => c.key === row.rowKey);
        }
      }
      if (candidate) { candidates.push(candidate); outbox.push(row.rowKey); }
      else await table.updateEntity({ partitionKey: OUTBOX, rowKey: row.rowKey, status: "stale" }, "Merge");
    }
    const unique = [...new Map(candidates.map(c => [c.key, c])).values()];
    const sender = send || messagingClient(env);
    let accepted = 0, skipped = 0;
    for (const candidate of unique) {
      if (now() - started > 90000 || accepted >= 25) break;
      try {
        const result = await sendOnce(table, candidate, sender, now);
        if (result.status === "accepted") accepted++; else skipped++;
        if (outbox.includes(candidate.key)) await table.updateEntity({ partitionKey: OUTBOX, rowKey: candidate.key, status: "processed" }, "Merge");
      } catch (error) { issues.push(error.message); }
    }
    const summary = { status: issues.length ? "attention" : "complete", accepted, skipped, issues: [...new Set(issues)], bootstrap: !initialized };
    context?.log?.(JSON.stringify({ task: "hospitality-notifications", ...summary }));
    if (issues.length) context?.error?.(JSON.stringify({ task: "hospitality-notifications", issues: summary.issues }));
    return summary;
  };
}
export function createAccommodationHandler({ table, getSnapshot = loadSnapshot, authorize = verifyAdmin, now = Date.now }) {
  return async (request) => {
    const response = (status, body) => ({ status, jsonBody: body, headers: { "Cache-Control": "no-store" } });
    try {
      const text = await request.text();
      if (text.length > 16000) return response(413, { ok: false, error: "Request too large" });
      const body = JSON.parse(text);
      if (!await authorize(body.accessKey)) return response(403, { ok: false, error: "Admin access is required." });
      if (!["preview", "queue"].includes(body.mode)) return response(400, { ok: false, error: "Invalid action" });
      const snapshot = await getSnapshot();
      const candidates = lodgingCandidates(snapshot, now(), true);
      const rows = [];
      for (const candidate of candidates) {
        const claim = await get(table, CLAIMS, candidate.key), queued = await get(table, OUTBOX, candidate.key);
        rows.push({ candidate, status: claim ? claim.status === "accepted" ? "already sent" : "needs review" : queued?.status === "pending" ? "queued" : "ready" });
      }
      const hash = digest(candidates.map(c => c.key).sort());
      const detail = {
        previewHash: hash, attendees: rows.map(({ candidate, status }) => ({ ...candidate.detail, status })),
        eligible: rows.filter(r => r.status === "ready").length,
        skippedMissingContact: snapshot.guests.filter(g => g.lodging && g.roomNo && !["Cancelled", "Departed"].includes(g.status) && !phoneAddress(g.phone)).length,
      };
      if (body.mode === "preview") return response(200, { ok: true, ...detail });
      if (!/^[a-zA-Z0-9-]{20,80}$/.test(body.requestId || "")) return response(400, { ok: false, error: "Missing request identifier" });
      if (body.previewHash !== hash) return response(409, { ok: false, error: "Room assignments changed. Preview the current list before sending." });
      let queued = 0;
      for (const { candidate, status } of rows) {
        if (status === "ready" && await create(table, { partitionKey: OUTBOX, rowKey: candidate.key, status: "pending", requestId: body.requestId, createdAt: new Date(now()).toISOString() })) queued++;
      }
      return response(200, { ok: true, queued, alreadyHandled: rows.length - queued, ...detail });
    } catch { return response(503, { ok: false, error: "Could not confirm the notification request. Preview again before retrying; previously queued messages will not be duplicated." }); }
  };
}
