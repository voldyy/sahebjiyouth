import { bedForGuest, stayRange } from "./occupancy.js";

export function allentownDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// A checkout is tied to the particular stay, not simply to a bed's last clean date.
// The backend retains these records when a lodging assignment is later cleared.
export function checkoutEvents(guests, today) {
  return guests.flatMap((guest) => {
    const stay = stayRange(guest), bed = bedForGuest(guest);
    if (guest.lodging !== "Samarpan" || !bed || !stay || guest.status === "Cancelled" || stay.end > today) return [];
    return [{ id: JSON.stringify([guest.sourceIdentity || guest.id, guest.roomCode, stay.start, stay.end]), roomNo: guest.roomNo, bed, roomCode: guest.roomCode, name: guest.name, checkout: stay.end, refreshedAt: "" }];
  });
}

export function linenBeds(events) {
  const beds = new Map();
  for (const event of events.filter((e) => !e.refreshedAt)) {
    if (!beds.has(event.roomCode)) beds.set(event.roomCode, { roomCode: event.roomCode, roomNo: event.roomNo, bed: event.bed, events: [] });
    beds.get(event.roomCode).events.push(event);
  }
  return [...beds.values()].sort((a, b) => a.events[0].checkout.localeCompare(b.events[0].checkout) || a.roomCode.localeCompare(b.roomCode, undefined, { numeric: true }));
}
