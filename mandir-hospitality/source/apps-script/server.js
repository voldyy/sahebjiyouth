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
import { OFFSITE_HOTELS, offsiteRoomFor } from "../src/lib/offsite.js";
import { checkoutEvents } from "../src/lib/housekeeping.js";
import bridge from "./bridge.html";
import { assertSyncKey, databaseExchange } from "./database-sync.js";
import { TABLES, createWorkspaceEngine } from "../shared/workspace-engine.js";
const engine = createWorkspaceEngine({
  uuid: () => Utilities.getUuid(),
  today: () => Utilities.formatDate(new Date(), "America/New_York", "yyyy-MM-dd"),
  flush: () => SpreadsheetApp.flush(),
});
const { table, roster, plans, hotelRooms, tripDisplay, housekeeping, snapshot, clean } = engine;
const text = (value) => String(value ?? "").trim();
function spreadsheet() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
export function setupHospitality() {
  const book = spreadsheet();
  roster(book);
  Object.keys(TABLES).forEach((name) => table(book, name));
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("ADMIN_ACCESS_KEY")) props.setProperty("ADMIN_ACCESS_KEY", Utilities.getUuid() + Utilities.getUuid());
  return "Hospitality tabs ready. Admin access is configured. Run showAdminLink to retrieve the private admin link.";
}
export function showAdminLink() {
  const key = PropertiesService.getScriptProperties().getProperty("ADMIN_ACCESS_KEY");
  if (!key) throw new Error("Run setupHospitality first.");
  return `https://www.sahebjiyouth.org/mandir-hospitality/#guests?admin=${encodeURIComponent(key)}`;
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
export function doPost(e) {
  let result;
  try {
    const raw = e?.postData?.contents || "";
    if (raw.length > 512000) throw new Error("Oversized request.");
    const req = JSON.parse(raw);
    if (req.action === "database-sync") result = databaseExchange(req, engine);
    else if (req.action === "database-service") {
      assertSyncKey(req);
      if (!["flight", "accommodation-notifications"].includes(req.request?.action)) throw new Error("Unsupported database service.");
      result = hospitalityRequest(req.request, true);
    } else {
    // Server-to-server reads only. Shared writes retain their existing RPC path.
    if (!["notification-authorize", "notification-flight"].includes(req.action)) throw new Error("Unsupported server request.");
    result = hospitalityRequest(req);
    }
  } catch (error) { result = { ok: false, error: error.message || "Invalid server request." }; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function accommodationNotifications(req) {
  if (!["preview", "queue"].includes(req.mode)) throw new Error("Choose preview or queue.");
  if (req.mode === "queue" && !/^[a-zA-Z0-9-]{20,80}$/.test(req.requestId || "")) throw new Error("Missing request identifier.");
  const response = UrlFetchApp.fetch("https://sahebjiyouth-reg-api.azurewebsites.net/api/hospitality-notifications", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify({ mode: req.mode, requestId: req.requestId, previewHash: req.previewHash, accessKey: req.accessKey }),
  });
  const result = JSON.parse(response.getContentText());
  if (response.getResponseCode() !== 200 || !result.ok) throw new Error(result.error || "Notification service is unavailable. No new batch was confirmed.");
  return result;
}
export function hospitalityRequest(req, local = false) {
  const lock = LockService.getScriptLock();
  try {
    if (!req || JSON.stringify(req).length > 16000)
      throw new Error("Invalid or oversized request.");
    // Already-open dashboard versions also use the new database after cutover.
    // Service requests from the database deliberately bypass this forwarding.
    const databaseUrl = PropertiesService.getScriptProperties().getProperty("DATABASE_API_URL");
    if (!local && databaseUrl && !["notification-authorize", "notification-flight"].includes(req.action)) {
      if (!/^https:\/\/[a-z0-9-]+\.usayouth\.workers\.dev\/api$/.test(databaseUrl)) throw new Error("Invalid database endpoint.");
      const response = UrlFetchApp.fetch(databaseUrl, { method: "post", contentType: "application/json", muteHttpExceptions: true, payload: JSON.stringify(req) });
      return JSON.parse(response.getContentText());
    }
    if (
      !["snapshot", "lodging", "transport", "resource", "flight", "linen", "offsite", "guest", "trip-display", "trip-display-read", "notification-authorize", "notification-flight", "accommodation-notifications"].includes(
        req.action,
      )
    )
      throw new Error("Unknown action.");
    const key = PropertiesService.getScriptProperties().getProperty("ADMIN_ACCESS_KEY");
    const role = key && typeof req.accessKey === "string" && req.accessKey === key ? "admin" : "viewer";
    if (req.action === "notification-authorize") return { ok: true, authorized: role === "admin" };
    if (req.action === "notification-flight") {
      const current = roster(spreadsheet());
      const group = transportGroups(current.guests, "Arrivals").find(g => g.id === req.tripId && g.method === "Flight");
      if (!group) throw new Error("This pickup flight is no longer in the roster.");
      return { ok: true, flight: flightStatus({ day: group.day, flight: group.flight, airport: group.airport, direction: "Arrivals" }, true) };
    }
    if (!["snapshot", "flight", "trip-display", "trip-display-read"].includes(req.action) && role !== "admin") throw new Error("Admin access is required to change this view-only dashboard. Open your private admin link.");
    if (req.action === "accommodation-notifications") return accommodationNotifications(req);
    if (req.action === "flight") return { ok: true, flight: req.manual === true ? flightStatus(req) : { available: false, reason: "Automatic flight checks are disabled. Reload and choose Check flight status." } };
    if (!lock.tryLock(20000))
      throw new Error("Another save is in progress. Please retry shortly.");
    const book = spreadsheet();
    if (["trip-display", "trip-display-read"].includes(req.action)) {
      if (req.action === "trip-display") {
        if (!/^[a-zA-Z0-9-]{20,80}$/.test(req.requestId || "")) throw new Error("Missing request identifier.");
        engine.mutate(book, req);
      }
      return { ok: true, tripDisplay: tripDisplay(book) };
    }
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
      const linenCommitted = req.action === "linen" && table(book, "Housekeeping").rows.some((r, i) => i > 0 && r[7] === req.requestId);
      if (!past && !committed && !linenCommitted)
        engine.mutate(book, req);
    }
    return { ok: true, ...snapshot(book, role) };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Google Sheets could not complete the request.",
    };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}
function flightStatus(req, adjacentDay = false) {
  const today = Utilities.formatDate(
    new Date(),
    "America/New_York",
    "yyyy-MM-dd",
  );
  const day = req.day;
  const difference = (Date.parse(day + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86400000;
  if (day !== today && !(adjacentDay && Number.isFinite(difference) && Math.abs(difference) <= 1))
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
    "flight-v4",
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
  const scheduled = times["scheduled" + suffix] || {};
  const latest = times["actual" + suffix] || times["estimated" + suffix] || {};
  const landed = leg.status === "L" || !!times.actualRunwayArrival || !!times.actualGateArrival;
  const inTransit = leg.status !== "C" && !landed && (leg.status === "A" || !!times.actualRunwayDeparture);
  const providerDelay = leg.delays?.[req.direction === "Arrivals" ? "arrivalGateDelayMinutes" : "departureGateDelayMinutes"];
  const result = {
    available: true,
    rawStatus: leg.status,
    inTransit,
    landed,
    status:
      {
        S: "Scheduled",
        A: "Active",
        L: "Landed",
        C: "Cancelled",
        D: "Diverted",
      }[leg.status] || "Status unavailable",
    scheduled: scheduled.dateLocal || "",
    estimated: latest.dateLocal || "",
    scheduledUtc: scheduled.dateUtc || "",
    estimatedUtc: latest.dateUtc || "",
    flightId: String(leg.flightId || ""),
    actualRunwayDepartureUtc: times.actualRunwayDeparture?.dateUtc || "",
    scheduledDepartureUtc: (times.scheduledGateDeparture || times.scheduledRunwayDeparture || {}).dateUtc || "",
    expectedArrivalUtc: (times.estimatedRunwayArrival || times.estimatedGateArrival || times.scheduledGateArrival || {}).dateUtc || "",
    delayMinutes: typeof providerDelay === "number" && Number.isFinite(providerDelay) ? providerDelay : null,
    checkedAt: new Date().toISOString(),
  };
  cache.put(cacheKey, JSON.stringify(result), 300);
  return result;
}
