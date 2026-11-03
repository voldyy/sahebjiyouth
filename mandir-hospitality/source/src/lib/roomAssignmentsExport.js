import { allentownDay } from "./housekeeping.js";
import { normalizeOffsiteHotel, offsiteRoomFor, withDefaultOffsiteRooms } from "./offsite.js";

export const ROOM_ASSIGNMENT_HEADERS = ["Lodging", "Room number", "Name", "City, State", "Check-in date", "Check-out date", "Registration ID"];
const text = value => String(value ?? "").trim();
const compare = new Intl.Collator("en", { numeric: true, sensitivity: "base" }).compare;

export function roomAssignmentRows(guests, offsiteRooms = []) {
  const rooms = withDefaultOffsiteRooms(offsiteRooms);
  return guests.filter(guest => guest.status !== "Cancelled").map(guest => {
    const lodging = normalizeOffsiteHotel(text(guest.lodging));
    const room = offsiteRoomFor({ ...guest, lodging }, rooms);
    return [lodging, text(room?.roomNo || guest.roomNo || room?.label), text(guest.name), text(guest.city), guest.accommodationIn || guest.arrivalDate || "", guest.accommodationOut || guest.departureDate || "", text(guest.registrationId)];
  }).filter(row => row[0] && row[1] && row[2])
    .sort((a, b) => compare(a[0], b[0]) || compare(a[1], b[1]) || compare(a[2], b[2]) || compare(a[4], b[4]));
}

function excelDate(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? date : null;
}

export async function roomAssignmentsWorkbook(rows) {
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const header = ROOM_ASSIGNMENT_HEADERS.map(value => ({ value, type: String, fontWeight: "bold", backgroundColor: "#326681", color: "#ffffff" }));
  const data = rows.map(row => row.map((value, col) => (col === 4 || col === 5) ? excelDate(value) : { value, type: String }));
  return writeExcelFile([header, ...data], {
    sheet: "Room assignments",
    columns: [22, 18, 30, 28, 18, 18, 32].map(width => ({ width })),
    stickyRowsCount: 1,
    dateFormat: "mm/dd/yyyy",
  }).toBlob();
}

export async function downloadRoomAssignments(rows) {
  const blob = await roomAssignmentsWorkbook(rows);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mandir-room-assignments-${allentownDay()}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
