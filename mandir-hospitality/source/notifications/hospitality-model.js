import { createHash } from "node:crypto";
import { transportGroups, transportWithPlans } from "../src/lib/transport.js";
import { airlineForFlight } from "../src/lib/airlines.js";

export const ZONE = "America/New_York";
export const HOUR = 3600000;
const easternAirports = new Set(["ABE", "EWR", "JFK", "PHL"]);
export const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const oneLine = value => String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
export function phoneAddress(value) {
  const raw = oneLine(value).replace(/^'/, "");
  if (!raw || !/^[+\d ().-]+$/.test(raw)) return "";
  let digits = raw.replace(/\D/g, "");
  if (!raw.startsWith("+") && digits.length === 10) digits = "1" + digits;
  if (!raw.startsWith("+") && !(digits.length === 11 && digits.startsWith("1"))) return "";
  return /^[1-9]\d{7,14}$/.test(digits) ? `whatsapp:+${digits}` : "";
}
export const displayPhone = address => address.replace(/^whatsapp:/, "");

// Convert the sheet's airport-local wall clock without using the host timezone.
export function easternInstant(day, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "") || !/^\d{2}:\d{2}$/.test(time || "")) return null;
  const wall = Date.parse(`${day}T${time}:00Z`);
  if (!Number.isFinite(wall)) return null;
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(format.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const shown = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    instant += wall - shown;
  }
  const p = Object.fromEntries(format.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
  if (`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` !== `${day}T${time}`) return null;
  // Ambiguous fall-back wall times cannot identify a flight reliably.
  const earlier = Object.fromEntries(format.formatToParts(new Date(instant - HOUR)).map(p => [p.type, p.value]));
  const later = Object.fromEntries(format.formatToParts(new Date(instant + HOUR)).map(p => [p.type, p.value]));
  if ([earlier, later].some(q => `${q.year}-${q.month}-${q.day}T${q.hour}:${q.minute}` === `${day}T${time}`)) return null;
  return instant;
}
export const formatWhen = instant => new Intl.DateTimeFormat("en-US", { timeZone: ZONE, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(instant));
export function utcInstant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const instant = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isFinite(instant) ? instant : null;
}
export function driverDirectory(rows) {
  const result = new Map();
  for (const row of rows.slice(1)) {
    if (row[0] !== "Driver" || row[2] !== "Yes") continue;
    const name = oneLine(row[1]), key = name.toLowerCase(), phone = phoneAddress(row[4]);
    if (!name) continue;
    result.set(key, result.has(key) ? null : { name, phone });
  }
  return result;
}
function candidate(type, identity, recipient, values, detail) {
  return { type, key: digest([type, identity, recipient, values]), recipient, variables: Object.fromEntries(values.map((v, i) => [String(i + 1), oneLine(v)])), detail };
}
export function assignedTrips(snapshot) {
  const groups = ["Arrivals", "Departures"].flatMap(direction => transportWithPlans(transportGroups(snapshot.guests, direction), snapshot.assignments));
  return groups.filter(g => g.guests.every(a => a.status !== "Departed"));
}
export function tripParties(snapshot, group) {
  const driver = snapshot.drivers.get(oneLine(group.plan.driver).toLowerCase());
  const arrival = group.direction === "Arrivals";
  const times = group.guests.map(g => arrival ? [g.arrivalTime, g.arrivalTimeKnown] : [g.departureTime, g.departureTimeKnown]);
  const at = easternAirports.has(group.airport) && times.every(([time, known]) => known && time === group.time) ? easternInstant(group.day, group.time) : null;
  if (!driver?.phone || at === null || group.plan.status === "Completed") return [];
  const flight = group.method === "Flight" ? [airlineForFlight(group.flight)?.name, group.flight].filter(Boolean).join(" ") : group.method === "Bus" ? "Bus service (no flight)" : "Ground transport (no flight)";
  const registrations = [...new Set(group.guests.map(g => g.registrationId))];
  return registrations.flatMap(registrationId => {
    const family = snapshot.guests.filter(g => g.registrationId === registrationId && !["Cancelled", "Departed"].includes(g.status));
    const primaries = family.filter(g => g.isPrimaryContact);
    if (primaries.length !== 1 || !primaries[0].sourceWritable) return [];
    const primary = primaries[0], passengerPhone = phoneAddress(primary.phone);
    // Never substitute a secondary attendee for the primary passenger.
    if (!passengerPhone || !group.guests.some(g => g.sourceIdentity === primary.sourceIdentity)) return [];
    const travelers = group.guests.filter(g => g.registrationId === registrationId);
    if (travelers.some(g => !g.sourceWritable)) return [];
    const companions = travelers.filter(g => !g.isPrimaryContact).length;
    const name = primary.name + (primary.city ? ` (${primary.city})` : "");
    const summary = name + (companions ? `, with ${companions} accompanying passenger${companions === 1 ? "" : "s"}` : "");
    return [{ group, driver, primary, passengerPhone, companions, summary, name, flight, at, arrival, identity: [group.id, registrationId, driver.name, driver.phone] }];
  });
}
export function driverAssignment(party, epoch) {
  const p = party;
  return candidate("driver_assignment", [...p.identity, epoch], p.driver.phone,
    [p.driver.name, p.summary, displayPhone(p.passengerPhone), p.arrival ? "Arrival / airport pickup" : "Departure / airport dropoff", p.flight, formatWhen(p.at), p.group.airport],
    { trip: digest(p.group.id), event: "driver assigned" });
}
export function tripReminders(party, now) {
  const p = party, result = [];
  if (p.group.method !== "Flight" || now >= p.at || now < p.at - 18 * HOUR) return result;
  result.push(candidate(p.arrival ? "passenger_arrival" : "passenger_departure", p.identity, p.passengerPhone,
    [p.primary.name, p.flight, p.group.airport, formatWhen(p.at), p.driver.name, displayPhone(p.driver.phone)], { trip: digest(p.group.id), event: "18-hour passenger reminder" }));
  if (!p.arrival && now >= p.at - 8 * HOUR) result.push(candidate("driver_dropoff", p.identity, p.driver.phone,
    [p.driver.name, p.name, displayPhone(p.passengerPhone), p.flight, formatWhen(p.at), p.group.airport], { trip: digest(p.group.id), event: "8-hour driver reminder" }));
  return result;
}
export function airborneMessage(party, flight, now) {
  const p = party;
  if (p.group.method !== "Flight" || !p.arrival || !flight?.available || flight.landed || ["C", "D"].includes(flight.rawStatus)) return null;
  const takeoff = utcInstant(flight.actualRunwayDepartureUtc);
  if (!(takeoff !== null && takeoff <= now) && flight.rawStatus !== "A") return null;
  const eta = utcInstant(flight.expectedArrivalUtc);
  if (eta === null || eta <= now) return null;
  const result = candidate("driver_airborne", [...p.identity, flight.flightId || p.group.day], p.driver.phone,
    [p.driver.name, p.name, p.flight, p.group.airport, formatWhen(eta), displayPhone(p.passengerPhone)], { trip: digest(p.group.id), event: "airborne" });
  // ETA updates do not create additional takeoff alerts.
  result.key = digest(["driver_airborne", p.identity, flight.flightId || p.group.day]);
  return result;
}
export function lodgingCandidates(snapshot, now, manual = false) {
  return snapshot.guests.flatMap(g => {
    if (!g.sourceWritable || ["Cancelled", "Departed"].includes(g.status) || !g.lodging || !g.roomNo) return [];
    const recipient = phoneAddress(g.phone);
    if (!recipient) return [];
    const at = g.arrivalTimeKnown ? easternInstant(g.arrivalDate, g.arrivalTime) : null;
    if (!manual && (at === null || now >= at || now < at - 24 * HOUR)) return [];
    return [candidate("accommodation", [g.sourceIdentity, g.arrivalDate, g.arrivalTime], recipient, [g.name, g.lodging, g.roomNo],
      { name: g.name, lodging: g.lodging, roomNo: g.roomNo, phoneEnding: displayPhone(recipient).slice(-4), event: "lodging assignment" })];
  });
}
