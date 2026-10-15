import { fixedRoomCode, isFixedLodging } from "./lodgingRooms.js";
import { OFFSITE_HOTELS, offsiteRoomFor, offsiteBedCode } from "./offsite.js";

export const FIRST_STAY_DAY = "2026-10-11";
export const LAST_STAY_DAY = "2026-11-21";
export const localDay = (iso) => new Date(`${iso}T12:00:00`);
export function moveDay(iso, days) {
  const date = localDay(iso);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export const WEEK_STARTS = Array.from({ length: 6 }, (_, i) => moveDay(FIRST_STAY_DAY, i * 7));
export const shortDay = (iso) => localDay(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const fullDay = (iso) => localDay(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export function needsLodging(guest) {
  return guest.stay !== "Day visitor" && !["Cancelled", "Departed"].includes(guest.status);
}
export function stayRange(guest) {
  const start = guest.accommodationIn || guest.arrivalDate || "";
  const end = guest.accommodationOut || guest.departureDate || "";
  const valid = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(localDay(day).getTime()) && moveDay(day, 0) === day;
  return valid(start) && valid(end) && end > start ? { start, end } : null;
}
export function overlaps(a, b) {
  return !!a && !!b && a.start < b.end && b.start < a.end;
}
export const onDay = (guest, day) => overlaps(stayRange(guest), { start: day, end: moveDay(day, 1) });
export function bedForGuest(guest, rooms = []) {
  if (!isFixedLodging(guest.lodging)) {
    const room = offsiteRoomFor(guest, rooms);
    const bed = Number(String(guest.roomCode || "").match(/B([1-9]\d*)$/)?.[1]);
    return room && bed >= 1 && bed <= room.beds ? bed : null;
  }
  const bed = String(guest.roomCode || "").match(/^SD?\d+B([1-9]\d*)$/)?.[1];
  return bed && fixedRoomCode(guest.lodging, guest.roomNo, bed) === guest.roomCode ? Number(bed) : null;
}
const sameGuest = (a, b) => (a.sourceIdentity || a.id) === (b.sourceIdentity || b.id);

// An assigned room with an unknown bed or stay cannot be advertised as empty.
// It stays visible for review until the sheet identifies the bed and dates.
export function bedState(guests, roomNo, bedNo, range, exceptGuest = null, lodging = "Samarpan", rooms = []) {
  const occupants = [];
  const uncertain = [];
  for (const guest of guests) {
    if (!needsLodging(guest) || guest.lodging !== lodging || (exceptGuest && sameGuest(guest, exceptGuest))) continue;
    if (isFixedLodging(lodging)) { if (String(guest.roomNo) !== String(roomNo)) continue; }
    else {
      const target = rooms.find((r) => r.id === roomNo && r.lodging === lodging);
      const assigned = offsiteRoomFor(guest, rooms);
      if (!target || (assigned ? assigned.id !== target.id : !target.roomNo || guest.roomNo !== target.roomNo)) continue;
    }
    const stay = stayRange(guest);
    if (stay && !overlaps(stay, range)) continue;
    const bed = bedForGuest(guest, rooms);
    if (bed !== null && bed !== Number(bedNo)) continue;
    if (!stay || bed === null) uncertain.push(guest);
    else occupants.push(guest);
  }
  return { occupants, uncertain, free: occupants.length === 0 && uncertain.length === 0 };
}

export function assignmentIssue(guests, guest, assignment, rooms = []) {
  if (!isFixedLodging(assignment.lodging) && !OFFSITE_HOTELS.includes(assignment.lodging)) return "";
  const hotelRoom = offsiteRoomFor(assignment, rooms);
  if (!isFixedLodging(assignment.lodging) && !hotelRoom) return "Choose a hotel room and bed from the Offsite inventory.";
  const range = stayRange(guest);
  if (!range) return "Add valid accommodation or arrival/departure dates in the source sheet before assigning a bed.";
  const bed = bedForGuest(assignment, rooms);
  if (!bed) return "Choose a valid room and bed.";
  if (hotelRoom && (assignment.roomNo !== hotelRoom.roomNo || assignment.roomCode !== offsiteBedCode(hotelRoom, bed))) return "The hotel room changed. Refresh before assigning.";
  const state = bedState(guests, hotelRoom?.id || assignment.roomNo, bed, range, guest, assignment.lodging, rooms);
  if (state.uncertain.length) return `Room ${assignment.roomNo} has an assignment with missing dates or an unrecognized bed code. Review it before assigning this bed.`;
  if (state.occupants.length) return `${assignment.roomCode} is occupied during this guest’s stay. Choose another bed.`;
  return "";
}

export function unassignedGuest(guest) {
  return needsLodging(guest) && (!guest.lodging || !guest.roomCode || (!guest.roomNo && !/^O[a-zA-Z0-9-]+B[1-9]\d*$/.test(guest.roomCode)));
}
