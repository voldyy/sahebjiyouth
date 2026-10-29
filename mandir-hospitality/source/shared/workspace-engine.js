import {
  SPREADSHEET_ID,
  guestsFromRows,
  validateAssignment,
  attendeeKey,
  lodgingValues,
  sheetDate,
} from "../src/lib/sheets.js";
import {
  assignmentIssue,
  needsLodging,
  stayRange,
} from "../src/lib/occupancy.js";
import { transportGroups } from "../src/lib/transport.js";
import { crewForPlan, readAdditionalDrivers } from "../src/lib/transportCrew.js";
import { dayDisplayId, displayChangedAt } from "../src/lib/transportDisplay.js";
import { HAWTHORN_ROOM_TYPES, OFFSITE_HOTELS, defaultOffsiteRoom, normalizeOffsiteHotel, offsiteRoomFor, withDefaultOffsiteRooms } from "../src/lib/offsite.js";
import { checkoutEvents } from "../src/lib/housekeeping.js";
export const TABLES = {
  "Transport Crew": ["Journey ID", "Additional drivers"],
  "Transport Display": ["Journey ID", "Collapsed", "Revision", "Request ID"],
  "Offsite Rooms": ["ID", "Hotel", "Room number", "Beds", "Planning label", "Revision"],
  "Housekeeping": ["Checkout ID", "Room", "Bed", "Bed code", "Guest", "Checkout date", "Linens refreshed at", "Request ID", "State"],
  "Transport Assignments": [
    "Journey ID",
    "Direction",
    "Date",
    "Flight / service",
    "Airport",
    "Attendees",
    "Driver",
    "Vehicle",
    "Pickup / mandir departure",
    "Status",
    "Notes",
    "Revision",
    "Updated at",
    "Request ID",
  ],
  "Transport Resources": ["Type", "Name", "Active", "Updated at"],
  "Assignment History": [
    "Request ID",
    "Time",
    "Action",
    "Record",
    "Before",
    "After",
  ],
};

// The same rules run against Sheets during migration and transactional SQLite tables.
export function createWorkspaceEngine(runtime) {
const text = (value) => String(value ?? "").trim();
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const literal = (value) => {
  const s = String(value ?? "");
  return /^[=+\-@']/.test(s) ? "'" + s : s;
};
function table(book, name, readOnly = false) {
  const expected = TABLES[name];
  let sheet = book.getSheetByName(name);
  if (!sheet && readOnly) return { sheet: null, rows: [expected] };
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet
      .getRange(1, 1, 1, expected.length)
      .setValues([expected])
      .setBackground("#335b4b")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, expected.length, 160);
  }
  const rows = sheet.getDataRange().getDisplayValues();
  const resourceHeaders = name === "Transport Resources" &&
    equal(rows[0].slice(0, 4), expected) &&
    (rows[0].length === 4 || (rows[0].length === 5 && rows[0][4] === "Phone number"));
  if (!resourceHeaders && !equal(rows[0], expected))
    throw new Error(
      `The ${name} headers changed. Restore its columns before saving.`,
    );
  return { sheet, rows };
}
function roster(book) {
  const sheet = book.getSheets().find((s) => s.getSheetId() === 0);
  if (!sheet) throw new Error("The attendee tab (gid 0) is missing.");
  const rows = sheet
    .getRange(1, 1, Math.max(1, sheet.getLastRow()), Math.min(33, Math.max(32, sheet.getDataRange().getDisplayValues()[0].length)))
    .getDisplayValues();
  return { sheet, rows, guests: guestsFromRows(rows) };
}
function plans(book, readOnly = false) {
  const crewRows = table(book, "Transport Crew", true).rows.slice(1).filter(r => r[0]);
  if (new Set(crewRows.map(r => r[0])).size !== crewRows.length) throw new Error("Duplicate journeys in Transport Crew. Review the sheet.");
  const crew = new Map(crewRows.map(r => [r[0], readAdditionalDrivers(r[1])]));
  const rows = table(book, "Transport Assignments", readOnly)
    .rows.slice(1)
    .filter((r) => r[0]);
  const resources = table(book, "Transport Resources", readOnly)
    .rows.slice(1)
    .filter((r) => r[2] === "Yes");
  return {
    assignments: rows.map((r) => ({
      id: r[0],
      driver: r[6],
      vehicle: r[7],
      pickup: r[8],
      status: r[9],
      notes: r[10],
      revision: r[11],
      additionalDrivers: crew.get(r[0]) || [],
    })),
    drivers: resources.filter((r) => r[0] === "Driver").map((r) => r[1]),
    vehicles: resources.filter((r) => r[0] === "Vehicle").map((r) => r[1]),
  };
}
function hotelRooms(book, readOnly = false) {
  const stored = table(book, "Offsite Rooms", readOnly).rows.slice(1).filter((r) => r[0]).map((r) => { const beds = Number(r[3]); const type = beds === HAWTHORN_ROOM_TYPES.king.beds ? HAWTHORN_ROOM_TYPES.king : HAWTHORN_ROOM_TYPES.doubleQueen; return { id: r[0], number: r[0], lodging: normalizeOffsiteHotel(r[1]), roomNo: r[2], beds, physicalBeds: type.physicalBeds, peoplePerBed: type.peoplePerBed, label: r[4], revision: r[5] }; });
  return withDefaultOffsiteRooms(stored);
}
function tripDisplay(book) {
  return table(book, "Transport Display", true).rows.slice(1).filter(r => r[0]).map(r => ({ id: r[0], collapsed: r[1] === "Yes", revision: r[2], updatedAt: displayChangedAt(r[2]) }));
}
function setTripDisplay(book, req) {
  // Viewers can change presentation only. Resolve the journey against the
  // roster and never accept assignment fields through this action.
  const guests = roster(book).guests;
  const valid = ["Arrivals", "Departures"].some(direction => transportGroups(guests, direction).some(g => g.id === req.id || (g.day && dayDisplayId(g.day) === req.id)));
  if (typeof req.collapsed !== "boolean" || !valid) throw new Error("This trip changed. Refresh before changing its display.");
  const current = table(book, "Transport Display");
  const matches = current.rows.map((row, index) => ({ row, index })).filter(x => x.index > 0 && x.row[0] === req.id);
  if (matches.length > 1) throw new Error("Duplicate trip display records. Review the sheet.");
  if (matches[0]?.row[3] === req.requestId) return;
  const values = [req.id, req.collapsed ? "Yes" : "No", `${new Date().toISOString()}|${runtime.uuid()}`, req.requestId];
  writeRow(current.sheet, matches[0] ? matches[0].index + 1 : current.sheet.getLastRow() + 1, values);
  runtime.flush();
  if (!equal(table(book, "Transport Display").rows.find(r => r[0] === req.id), values)) throw new Error("Trip display could not be confirmed. Refresh before retrying.");
}
function housekeeping(book, guests, readOnly = false) {
  const current = table(book, "Housekeeping", readOnly);
  const today = runtime.today();
  const due = checkoutEvents(guests, today);
  const dueIds = new Set(due.map((e) => e.id));
  const known = new Set(current.rows.slice(1).map((r) => r[0]));
  current.rows.forEach((r, i) => {
    if (!i || !r[0] || r[6]) return;
    let identity;
    try { identity = JSON.parse(r[0])[0]; } catch { return; }
    const guest = guests.find((g) => g.sourceIdentity === identity && g.roomCode === r[3]);
    // A corrected stay supersedes the scheduled checkout. Clearing/moving a
    // lodging assignment retains the linen task for the bed that was vacated.
    const state = dueIds.has(r[0]) ? "Pending" : guest && stayRange(guest) ? "Superseded" : r[8];
    if (state !== r[8]) {
      if (readOnly) current.rows[i] = [...r.slice(0, 8), state];
      else writeRow(current.sheet, i + 1, [...r.slice(0, 8), state]);
    }
  });
  for (const event of due) {
    if (known.has(event.id)) continue;
    const values = [event.id, event.roomNo, String(event.bed), event.roomCode, event.name, event.checkout, "", "", "Pending"];
    if (readOnly) current.rows.push(values);
    else writeRow(current.sheet, current.sheet.getLastRow() + 1, values);
    known.add(event.id);
  }
  return (readOnly ? current.rows : table(book, "Housekeeping").rows).slice(1).filter((r) => r[0] && r[8] !== "Superseded").map((r) => ({ id: r[0], roomNo: r[1], bed: Number(r[2]), roomCode: r[3], name: r[4], checkout: r[5], refreshedAt: r[6] }));
}
function snapshot(book, role) {
  const current = roster(book);
  if (role !== "admin") return {
    role: "viewer",
    tripDisplay: tripDisplay(book),
    // All dashboard views use normalized display data, never the raw source rows.
    guests: current.guests,
    transport: plans(book, true),
    offsiteRooms: hotelRooms(book, true),
    housekeeping: housekeeping(book, current.guests, true),
    // Retain the meal projection for already-open versions of the team page.
    kitchenGuests: current.guests.map((g, index) => ({ sourceIdentity: `meal-${index}`, name: g.name, city: g.city, count: g.count, arrivalDate: g.arrivalDate, arrivalTime: g.arrivalTime, departureDate: g.departureDate, status: g.status, stay: g.stay === "Day visitor" ? "Day visitor" : "Overnight" })),
    refreshedAt: new Date().toISOString(),
  };
  return {
    role,
    tripDisplay: tripDisplay(book),
    rows: current.rows,
    transport: plans(book),
    offsiteRooms: hotelRooms(book),
    housekeeping: housekeeping(book, current.guests),
    refreshedAt: new Date().toISOString(),
  };
}
function writeRow(sheet, row, values) {
  sheet
    .getRange(row, 1, 1, values.length)
    .setNumberFormat("@")
    .setValues([values.map(literal)]);
}
function history(book, req, record, before, after) {
  const { sheet } = table(book, "Assignment History");
  writeRow(sheet, sheet.getLastRow() + 1, [
    req.requestId,
    new Date().toISOString(),
    req.action,
    record,
    JSON.stringify(before),
    JSON.stringify(after),
  ]);
}
function lodging(book, req) {
  const values = validateAssignment(req.assignment);
  const current = roster(book);
  housekeeping(book, current.guests);
  const matches = current.rows
    .map((row, index) => ({ row, index }))
    .filter((x) => x.index > 0 && attendeeKey(x.row) === req.identity);
  if (matches.length !== 1)
    throw new Error(
      "The attendee was removed, changed, or duplicated. Refresh before assigning.",
    );
  const match = matches[0];
  const before = lodgingValues(match.row);
  // A retry after a lost response may observe the requested values already committed.
  if (equal(before, values)) return;
  if (!equal(before, req.expected))
    throw new Error(
      "Someone changed this attendee’s lodging. Refresh and review their assignment first.",
    );
  const guest = current.guests.find((g) => g.sourceIdentity === req.identity);
  if (values[0]) {
    if (!needsLodging(guest))
      throw new Error("This guest no longer needs overnight accommodation.");
    const currentStay = stayRange(guest);
    // google.script.run may reorder object keys. Compare the normalized days,
    // not their JSON property order, while still rejecting stale stay dates.
    if (currentStay?.start !== req.stay?.start || currentStay?.end !== req.stay?.end)
      throw new Error(
        "This guest’s stay dates changed. Refresh before assigning.",
      );
    const problem = assignmentIssue(current.guests, guest, {
      lodging: values[0],
      roomNo: values[1],
      roomCode: values[2],
    }, hotelRooms(book));
    if (problem) throw new Error(problem);
  }
  current.sheet
    .getRange(match.index + 1, 30, 1, 3)
    .setNumberFormat("@")
    .setValues([values.map(literal)]);
  runtime.flush();
  const confirmed = roster(book)
    .rows.slice(1)
    .filter((r) => attendeeKey(r) === req.identity);
  if (confirmed.length !== 1 || !equal(lodgingValues(confirmed[0]), values))
    throw new Error("Save could not be confirmed. Refresh before retrying.");
  history(book, req, req.identity, before, values);
}
function guest(book, req) {
  const form = req.guest || {};
  const field = (key, max = 200) => {
    const value = text(form[key]);
    if (value.length > max || /[\x00\r\n]/.test(value)) throw new Error("Guest details must be single-line text within the field limits.");
    return value;
  };
  const name = field("name");
  if (!name) throw new Error("Enter the attendee's full name.");
  const date = (key) => {
    const value = field(key);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || sheetDate(value).date !== value)) throw new Error("Enter valid stay dates.");
    return value;
  };
  const start = date("arrivalDate"), end = date("departureDate");
  if (start && end && end < start) throw new Error("Checkout cannot be before check-in.");
  const time = (key, day) => {
    const value = field(key);
    if (value && (!day || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) throw new Error("Enter a valid time and its date, or leave the time blank.");
    return value ? `${day} ${value}` : day;
  };
  const overnight = field("overnight"), transport = field("airportPickup") || field("airportTransport"), dropoff = form.airportDropoff === undefined ? transport : field("airportDropoff"), mode = field("travelMethod");
  if (!["", "YES", "NO"].includes(overnight) || !["", "YES", "NO"].includes(transport) || !["", "YES", "NO"].includes(dropoff) || !["", "CAR", "FLIGHT", "BUS", "Bus (arrival)"].includes(mode)) throw new Error("Choose valid accommodation and transport options.");
  if (overnight === "YES" && start && end && start === end) throw new Error("An overnight stay needs a checkout date after check-in.");
  const notes = text(form.notes);
  if (notes.length > 1000 || /\x00/.test(notes)) throw new Error("Notes must be up to 1,000 characters.");
  const id = `MAN-2026-${req.requestId}`;
  const current = roster(book);
  // The request ID also identifies the roster row, so a retry is safe even if
  // the original response or history write failed after the row was saved.
  const existing = current.rows.slice(1).filter(r => text(r[0]) === id);
  if (existing.length > 1) throw new Error("Duplicate guest entry found. Refresh and review the sheet.");
  if (existing.length === 1) return;
  const primary = field("primaryContact") || name;
  const row = Array(current.rows[0].length >= 33 ? 33 : 32).fill("");
  Object.assign(row, { 0: id, 1: new Date().toISOString(), 2: primary === name ? "YES" : "NO", 3: primary, 5: field("phone"), 7: field("city"), 8: name, 9: field("relationship") || (primary === name ? "Self (Primary)" : ""), 11: mode, 12: time("arrivalTime", start), 13: time("departureTime", end), 18: transport, 20: overnight, 21: start, 22: end, 23: notes });
  if (row.length >= 33) row[32] = dropoff;
  if (req.assignment) {
    const values = validateAssignment(req.assignment);
    const proposed = guestsFromRows([current.rows[0], row])[0];
    if (!values[0] || overnight !== "YES" || !stayRange(proposed)) throw new Error("Enter valid check-in and checkout dates for the walk-in stay.");
    const problem = assignmentIssue(current.guests, proposed, { lodging: values[0], roomNo: values[1], roomCode: values[2] }, hotelRooms(book, true));
    if (problem) throw new Error(problem);
    row.splice(29, 3, ...values);
  }
  const target = current.sheet.getLastRow() + 1;
  writeRow(current.sheet, target, row);
  runtime.flush();
  const confirmed = roster(book).rows.slice(1).filter(r => text(r[0]) === id);
  if (confirmed.length !== 1 || !equal(confirmed[0], row)) throw new Error("Guest save could not be confirmed. Retry this form before adding another entry.");
  history(book, req, attendeeKey(row), {}, row);
}
function linen(book, req) {
  const events = housekeeping(book, roster(book).guests).filter((e) => e.roomCode === req.roomCode && !e.refreshedAt);
  if (!Array.isArray(req.expected) || !events.length || !equal(events.map((e) => e.id).sort(), [...req.expected].sort())) throw new Error("The checkout list changed. Refresh before marking this bed clean.");
  const { sheet, rows } = table(book, "Housekeeping");
  const now = new Date().toISOString();
  const ids = new Set(events.map((e) => e.id));
  rows.forEach((r, i) => { if (i > 0 && ids.has(r[0])) writeRow(sheet, i + 1, [...r.slice(0, 6), now, req.requestId, "Refreshed"]); });
  runtime.flush();
  const confirmed = table(book, "Housekeeping").rows.filter((r) => ids.has(r[0]));
  if (confirmed.length !== ids.size || confirmed.some((r) => r[6] !== now)) throw new Error("The linen update could not be confirmed. Refresh before retrying.");
  history(book, req, req.roomCode, events, { refreshedAt: now });
}
function offsite(book, req) {
  const rooms = hotelRooms(book);
  const old = req.id ? rooms.find((r) => r.id === req.id) : null;
  if (req.id && (!old || old.revision !== req.expectedRevision)) throw new Error("This hotel room changed. Refresh before saving.");
  const preset = defaultOffsiteRoom(req.id);
  const hotel = normalizeOffsiteHotel(clean(req.lodging)), roomNo = clean(req.roomNo);
  const roomType = req.roomType || (Number(req.beds) === HAWTHORN_ROOM_TYPES.king.beds ? "king" : "doubleQueen");
  const type = HAWTHORN_ROOM_TYPES[roomType];
  const beds = req.roomType ? type?.beds : (preset?.beds || type?.beds || Number(req.beds));
  if (!OFFSITE_HOTELS.includes(hotel) || !Number.isInteger(beds) || beds < 1 || beds > 20) throw new Error("Choose a hotel and between 1 and 20 beds.");
  if (hotel === "Hawthorn" && !type) throw new Error("Choose King or Double Queen room type.");
  if (hotel === "Hawthorn" && beds !== type.beds) throw new Error("The selected Hawthorn room type has a fixed capacity.");
  if (old && old.lodging !== hotel) throw new Error("An existing planning room cannot be moved to another hotel.");
  if (roomNo && rooms.some((r) => r.id !== old?.id && r.lodging === hotel && r.roomNo.toLowerCase() === roomNo.toLowerCase())) throw new Error("This hotel room number is already in the inventory.");
  const current = roster(book);
  const assigned = old ? current.guests.filter((g) => offsiteRoomFor(g, rooms)?.id === old.id) : [];
  if (assigned.some((g) => Number(g.roomCode.match(/B(\d+)$/)?.[1]) > beds)) throw new Error("A guest is assigned to a bed you are removing. Reassign them first.");
  if (assigned.some((g) => !g.sourceWritable)) throw new Error("Resolve duplicate attendee identities before changing this room.");
  const id = old?.id || runtime.uuid();
  const label = old?.label || `Provisional room ${rooms.filter((r) => r.lodging === hotel && !defaultOffsiteRoom(r.id)).length + 1}`;
  const values = [id, hotel, roomNo, String(beds), label, runtime.uuid()];
  const { sheet, rows } = table(book, "Offsite Rooms");
  const index = rows.findIndex((r) => r[0] === id);
  writeRow(sheet, index < 0 ? sheet.getLastRow() + 1 : index + 1, values);
  // Stable bed codes keep reservations attached when the hotel supplies its room number.
  if (old && assigned.some((g) => g.roomNo !== roomNo)) {
    const identities = new Set(assigned.map((g) => g.sourceIdentity));
    current.rows.forEach((r, i) => { if (i > 0 && identities.has(attendeeKey(r))) current.sheet.getRange(i + 1, 31, 1, 1).setNumberFormat("@").setValues([[literal(roomNo)]]); });
  }
  runtime.flush();
  const confirmed = hotelRooms(book).find((r) => r.id === id);
  if (!confirmed || confirmed.roomNo !== roomNo || confirmed.beds !== beds || roster(book).guests.some((g) => assigned.some((a) => a.sourceIdentity === g.sourceIdentity) && g.roomNo !== roomNo)) throw new Error("Room changes could not be confirmed. Refresh before retrying.");
  history(book, req, id, old || {}, confirmed);
}
function clean(value, max = 100) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\r\n\x00]/.test(value)
  )
    throw new Error(
      "Assignment fields must be single-line text within their length limit.",
    );
  return value.trim();
}
function transport(book, req) {
  const group = transportGroups(roster(book).guests, req.direction).find(
    (g) => g.id === req.id,
  );
  if (
    !group ||
    !group.day ||
    group.signature !== req.signature ||
    group.guests.some((g) => !g.sourceWritable)
  )
    throw new Error(
      "The travel details or attendee list changed, or dates are missing. Refresh and review this journey.",
    );
  const { sheet, rows } = table(book, "Transport Assignments");
  const matches = rows
    .map((row, index) => ({ row, index }))
    .filter((x) => x.index > 0 && x.row[0] === group.id);
  if (matches.length > 1)
    throw new Error(
      "Duplicate journey records in Transport Assignments. Resolve them in the sheet.",
    );
  const match = matches[0];
  if ((match?.row[11] || "") !== req.expectedRevision)
    throw new Error(
      "Another admin changed this journey. Refresh before saving.",
    );
  if (match && req.expectedPlan && !equal(
    [match.row[6], match.row[7], match.row[8], match.row[9], match.row[10]],
    [req.expectedPlan.driver, req.expectedPlan.vehicle, req.expectedPlan.pickup, req.expectedPlan.status, req.expectedPlan.notes]
  )) throw new Error("Someone edited this journey in the sheet. Refresh before saving.");
  const data = plans(book);
  const previousCrew = data.assignments.find(p => p.id === group.id)?.additionalDrivers || [];
  if (req.expectedPlan && !equal(previousCrew, req.expectedPlan.additionalDrivers || [])) throw new Error("Someone edited this journey in the sheet. Refresh before saving.");
  // An older client can update the original fields without erasing added drivers.
  const submittedCrew = req.plan.additionalDrivers ?? previousCrew;
  if (!Array.isArray(submittedCrew) || submittedCrew.length > 19) throw new Error("Choose at most 20 drivers for a journey.");
  const additionalDrivers = submittedCrew.map(pair => ({ driver: clean(pair?.driver), vehicle: clean(pair?.vehicle) })).filter(pair => pair.driver || pair.vehicle);
  const driver = clean(req.plan.driver),
    vehicle = clean(req.plan.vehicle),
    pickup = clean(req.plan.pickup),
    notes = clean(req.plan.notes, 500),
    status = clean(req.plan.status);
  const crew = [{ driver, vehicle }, ...additionalDrivers];
  if (crew.some(pair => pair.driver && !data.drivers.includes(pair.driver)))
    throw new Error("Choose an active driver.");
  if (crew.some(pair => pair.vehicle && !data.vehicles.includes(pair.vehicle)))
    throw new Error("Choose an active vehicle.");
  for (const field of ["driver", "vehicle"]) {
    const values = crew.map(pair => pair[field].toLowerCase()).filter(Boolean);
    if (new Set(values).size !== values.length) throw new Error(`Choose a different ${field} for each assignment.`);
  }
  if (!["Planned", "Dispatched", "Completed"].includes(status))
    throw new Error("Choose a valid journey status.");
  if (status !== "Planned" && crew.some(pair => !pair.driver || !pair.vehicle))
    throw new Error("Assign both a driver and vehicle before dispatching.");
  if (
    pickup &&
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(pickup) ||
      Number.isNaN(Date.parse(pickup)))
  )
    throw new Error("Enter a valid pickup date and time.");
  const values = [
    group.id,
    group.direction,
    group.day,
    group.flight || group.method,
    group.airport,
    group.guests.map((g) => g.name).join(", "),
    driver,
    vehicle,
    pickup,
    status,
    notes,
    runtime.uuid(),
    new Date().toISOString(),
    req.requestId,
  ];
  writeRow(sheet, match ? match.index + 1 : sheet.getLastRow() + 1, values);
  runtime.flush();
  const confirmed = table(book, "Transport Assignments").rows.find(
    (r) => r[0] === group.id,
  );
  if (!confirmed || !equal(confirmed, values))
    throw new Error(
      "Journey save could not be confirmed. Refresh before retrying.",
    );
  const crewTable = table(book, "Transport Crew");
  const crewIndex = crewTable.rows.findIndex((r, i) => i > 0 && r[0] === group.id);
  const crewValues = [group.id, JSON.stringify(additionalDrivers)];
  writeRow(crewTable.sheet, crewIndex < 0 ? crewTable.sheet.getLastRow() + 1 : crewIndex + 1, crewValues);
  runtime.flush();
  const confirmedCrew = table(book, "Transport Crew").rows.find(r => r[0] === group.id);
  if (!equal(confirmedCrew, crewValues)) throw new Error("Driver assignments could not be confirmed. Refresh before retrying.");
  history(book, req, group.id, { plan: match?.row || [], additionalDrivers: previousCrew }, { plan: values, additionalDrivers });
}
function resource(book, req) {
  if (!["Driver", "Vehicle"].includes(req.type))
    throw new Error("Invalid resource type.");
  const name = clean(req.name);
  if (!name) throw new Error("Enter a name.");
  const active = req.active === true;
  if (!active) {
    const data = plans(book);
    if (
      data.assignments.some(
        (p) =>
          crewForPlan(p).some(pair => (req.type === "Driver" ? pair.driver : pair.vehicle) === name) &&
          p.status !== "Completed",
      )
    )
      throw new Error(
        "This resource is assigned to an active journey. Clear those assignments before removing it.",
      );
  }
  const { sheet, rows } = table(book, "Transport Resources");
  const match = rows.findIndex(
    (r, i) =>
      i > 0 && r[0] === req.type && r[1].toLowerCase() === name.toLowerCase(),
  );
  const values = [
    req.type,
    match > 0 ? rows[match][1] : name,
    active ? "Yes" : "No",
    new Date().toISOString(),
  ];
  writeRow(sheet, match > 0 ? match + 1 : sheet.getLastRow() + 1, values);
  runtime.flush();
  history(
    book,
    req,
    req.type + ": " + name,
    match > 0 ? rows[match] : [],
    values,
  );
}

return { table, roster, plans, hotelRooms, tripDisplay, housekeeping, snapshot, clean, mutate: (book, req) => ({lodging, guest, linen, offsite, transport, resource, "trip-display": setTripDisplay})[req.action](book, req) };
}
