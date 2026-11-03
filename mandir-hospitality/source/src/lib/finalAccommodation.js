import { OFFSITE_HOTELS, normalizeOffsiteHotel, offsiteRoomFor } from "./offsite.js";
import { LAST_STAY_DAY, moveDay, needsLodging, stayRange } from "./occupancy.js";

export const FINAL_START_NIGHT = "2026-11-06";
const compare = new Intl.Collator("en", { numeric: true, sensitivity: "base" }).compare;
export const staysOnNight = (stay, night) => stay.start <= night && night < stay.end;

export function finalAccommodationPlan(guests, rooms) {
  const inventory = rooms.filter(room => OFFSITE_HOTELS.includes(room.lodging));
  const rows = inventory.map(room => ({ room, occupants: [] })).sort((a,b) => compare(a.room.lodging,b.room.lodging) || compare(a.room.label,b.room.label));
  const missingDates = [], missingRooms = [];
  for (const guest of guests) {
    const lodging = normalizeOffsiteHotel(guest.lodging);
    if (!OFFSITE_HOTELS.includes(lodging) || !needsLodging(guest)) continue;
    const stay = stayRange(guest);
    if (!stay) { missingDates.push(guest); continue; }
    if (stay.end <= FINAL_START_NIGHT || stay.start >= LAST_STAY_DAY) continue;
    const assigned = offsiteRoomFor({ ...guest, lodging }, inventory) || inventory.find(room => room.lodging === lodging && guest.roomNo && (room.label === guest.roomNo || room.roomNo === guest.roomNo));
    const row = assigned && rows.find(row => row.room.id === assigned.id);
    if (!row) { missingRooms.push(guest); continue; }
    row.occupants.push({ guest, ...stay });
  }
  rows.forEach(row => row.occupants.sort((a,b) => compare(a.start,b.start) || compare(a.guest.name,b.guest.name)));
  const end = rows.flatMap(row => row.occupants).reduce((last, stay) => stay.end > last ? stay.end : last, moveDay(FINAL_START_NIGHT,1));
  const nights = [];
  for (let day=FINAL_START_NIGHT; day<end && day<LAST_STAY_DAY; day=moveDay(day,1)) {
    const byHotel = Object.fromEntries(OFFSITE_HOTELS.map(hotel => [hotel, rows.filter(row => row.room.lodging === hotel && row.occupants.some(stay => staysOnNight(stay,day))).length]));
    nights.push({ day, byHotel, total: Object.values(byHotel).reduce((a,b)=>a+b,0) });
  }
  return { rows, nights, missingDates, missingRooms };
}
