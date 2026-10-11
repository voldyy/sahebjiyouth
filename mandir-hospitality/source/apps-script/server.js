import {
  SPREADSHEET_ID,
  guestsFromRows,
  validateAssignment,
  attendeeKey,
  lodgingValues,
} from "../src/lib/sheets.js";
import {
  assignmentIssue,
  needsLodging,
  stayRange,
} from "../src/lib/occupancy.js";
import { transportGroups } from "../src/lib/transport.js";
import bridge from "./bridge.html";
const TABLES = {
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
const text = (value) => String(value ?? "").trim();
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const literal = (value) => {
  const s = String(value ?? "");
  return /^[=+\-@']/.test(s) ? "'" + s : s;
};
function spreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}
function table(book, name) {
  const expected = TABLES[name];
  let sheet = book.getSheetByName(name);
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
  if (!equal(rows[0], expected))
    throw new Error(
      `The ${name} headers changed. Restore its columns before saving.`,
    );
  return { sheet, rows };
}
function roster(book) {
  const sheet = book.getSheets().find((s) => s.getSheetId() === 0);
  if (!sheet) throw new Error("The attendee tab (gid 0) is missing.");
  const rows = sheet
    .getRange(1, 1, Math.max(1, sheet.getLastRow()), 32)
    .getDisplayValues();
  return { sheet, rows, guests: guestsFromRows(rows) };
}
function plans(book) {
  const rows = table(book, "Transport Assignments")
    .rows.slice(1)
    .filter((r) => r[0]);
  const resources = table(book, "Transport Resources")
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
    })),
    drivers: resources.filter((r) => r[0] === "Driver").map((r) => r[1]),
    vehicles: resources.filter((r) => r[0] === "Vehicle").map((r) => r[1]),
  };
}
function snapshot(book) {
  return {
    rows: roster(book).rows,
    transport: plans(book),
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
  if (values[0] === "Samarpan") {
    if (!needsLodging(guest))
      throw new Error("This guest no longer needs overnight accommodation.");
    if (!equal(stayRange(guest), req.stay))
      throw new Error(
        "This guest’s stay dates changed. Refresh before assigning.",
      );
    const problem = assignmentIssue(current.guests, guest, {
      lodging: values[0],
      roomNo: values[1],
      roomCode: values[2],
    });
    if (problem) throw new Error(problem);
  }
  current.sheet
    .getRange(match.index + 1, 30, 1, 3)
    .setNumberFormat("@")
    .setValues([values.map(literal)]);
  SpreadsheetApp.flush();
  const confirmed = roster(book)
    .rows.slice(1)
    .filter((r) => attendeeKey(r) === req.identity);
  if (confirmed.length !== 1 || !equal(lodgingValues(confirmed[0]), values))
    throw new Error("Save could not be confirmed. Refresh before retrying.");
  history(book, req, req.identity, before, values);
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
  const driver = clean(req.plan.driver),
    vehicle = clean(req.plan.vehicle),
    pickup = clean(req.plan.pickup),
    notes = clean(req.plan.notes, 500),
    status = clean(req.plan.status);
  if (driver && !data.drivers.includes(driver))
    throw new Error("Choose an active driver.");
  if (vehicle && !data.vehicles.includes(vehicle))
    throw new Error("Choose an active vehicle.");
  if (!["Planned", "Dispatched", "Completed"].includes(status))
    throw new Error("Choose a valid journey status.");
  if (status !== "Planned" && (!driver || !vehicle))
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
    Utilities.getUuid(),
    new Date().toISOString(),
    req.requestId,
  ];
  writeRow(sheet, match ? match.index + 1 : sheet.getLastRow() + 1, values);
  SpreadsheetApp.flush();
  const confirmed = table(book, "Transport Assignments").rows.find(
    (r) => r[0] === group.id,
  );
  if (!confirmed || !equal(confirmed, values))
    throw new Error(
      "Journey save could not be confirmed. Refresh before retrying.",
    );
  history(book, req, group.id, match?.row || [], values);
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
          (req.type === "Driver" ? p.driver : p.vehicle) === name &&
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
  SpreadsheetApp.flush();
  history(
    book,
    req,
    req.type + ": " + name,
    match > 0 ? rows[match] : [],
    values,
  );
}
export function setupHospitality() {
  const book = spreadsheet();
  roster(book);
  Object.keys(TABLES).forEach((name) => table(book, name));
  return "Hospitality tabs ready. No attendee assignments changed.";
}
export function doGet(e) {
  const origin = e?.parameter?.origin;
  const channel = e?.parameter?.channel || "";
  const allowed = [
    "https://www.sahebjiyouth.org",
    "https://sahebjiyouth.org",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ];
  if (!allowed.includes(origin) || !/^[a-zA-Z0-9-]{20,80}$/.test(channel))
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, service: "Mandir Hospitality", version: 1 }),
    ).setMimeType(ContentService.MimeType.JSON);
  return HtmlService.createHtmlOutput(
    bridge.replace("__CONFIG__", JSON.stringify({ origin, channel })),
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
export function hospitalityRequest(req) {
  const lock = LockService.getScriptLock();
  try {
    if (!req || JSON.stringify(req).length > 16000)
      throw new Error("Invalid or oversized request.");
    if (
      !["snapshot", "lodging", "transport", "resource", "flight"].includes(
        req.action,
      )
    )
      throw new Error("Unknown action.");
    if (req.action === "flight") return { ok: true, flight: flightStatus(req) };
    if (!lock.tryLock(20000))
      throw new Error("Another save is in progress. Please retry shortly.");
    const book = spreadsheet();
    if (req.action !== "snapshot") {
      if (!/^[a-zA-Z0-9-]{20,80}$/.test(req.requestId || ""))
        throw new Error("Missing request identifier.");
      const past = table(book, "Assignment History").rows.some(
        (r, i) => i > 0 && r[0] === req.requestId,
      );
      // Also recognize transport commits whose history write failed.
      const committed =
        req.action === "transport" &&
        table(book, "Transport Assignments").rows.some(
          (r, i) => i > 0 && r[13] === req.requestId,
        );
      if (!past && !committed)
        ({ lodging, transport, resource })[req.action](book, req);
    }
    return { ok: true, ...snapshot(book) };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Google Sheets could not complete the request.",
    };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}
function flightStatus(req) {
  const day = Utilities.formatDate(
    new Date(),
    "America/New_York",
    "yyyy-MM-dd",
  );
  if (req.day !== day)
    return {
      available: false,
      reason: "Flight status is checked on the travel day.",
    };
  const number = clean(req.flight).toUpperCase().replace(/\s/g, "");
  const match = number.match(/^([A-Z0-9]{2})(\d{1,4})$/);
  if (!match || !["Arrivals", "Departures"].includes(req.direction))
    throw new Error("Flight number is not recognized.");
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("FLIGHTSTATS_APP_ID"),
    key = props.getProperty("FLIGHTSTATS_APP_KEY");
  if (!id || !key)
    return {
      available: false,
      reason:
        "Live flight service is not configured. Use the airline flight tracker.",
    };
  const cache = CacheService.getScriptCache();
  const cacheKey = [
    "flight",
    number,
    day,
    req.direction,
    clean(req.airport),
  ].join(":");
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  const [year, month, date] = day.split("-");
  const url = `https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/${match[1]}/${match[2]}/${req.direction === "Arrivals" ? "arr" : "dep"}/${year}/${month}/${date}?appId=${encodeURIComponent(id)}&appKey=${encodeURIComponent(key)}`;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200)
    return {
      available: false,
      reason: "The flight service is unavailable. Check the airline.",
    };
  const body = JSON.parse(response.getContentText());
  const legKey =
    req.direction === "Arrivals"
      ? "arrivalAirportFsCode"
      : "departureAirportFsCode";
  const leg = body.flightStatuses?.find((s) => s[legKey] === req.airport);
  if (!leg)
    return { available: false, reason: "No matching flight at this airport." };
  const suffix = req.direction === "Arrivals" ? "GateArrival" : "GateDeparture";
  const times = leg.operationalTimes || {};
  const result = {
    available: true,
    status:
      {
        S: "Scheduled",
        A: "Active",
        L: "Landed",
        C: "Cancelled",
        D: "Diverted",
      }[leg.status] || "Status unavailable",
    scheduled: times["scheduled" + suffix]?.dateLocal || "",
    estimated:
      times["actual" + suffix]?.dateLocal ||
      times["estimated" + suffix]?.dateLocal ||
      "",
    checkedAt: new Date().toISOString(),
  };
  cache.put(cacheKey, JSON.stringify(result), 300);
  return result;
}
