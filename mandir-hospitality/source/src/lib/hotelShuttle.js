import { OFFSITE_HOTELS } from "./offsite.js";
import { needsLodging, onDay } from "./occupancy.js";

const isFlightArrival = (guest) => String(guest.travelMethod || "").trim().toUpperCase() === "FLIGHT";

// Hotel guests who flew in do not have a personal vehicle during their stay.
// This is an operational count for hotel ↔ temple shuttle planning on one day.
export function hotelShuttleNeed(guests, day) {
  const riders = guests.filter((guest) =>
    needsLodging(guest) && OFFSITE_HOTELS.includes(guest.lodging) && isFlightArrival(guest) && onDay(guest, day),
  );
  const byHotel = Object.fromEntries(OFFSITE_HOTELS.map((hotel) => [hotel, riders.filter((guest) => guest.lodging === hotel).length]));
  return { day, total: riders.length, byHotel, riders };
}
