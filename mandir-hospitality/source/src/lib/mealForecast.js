// Shared by the Yogi Prasad dashboard and its nightly WhatsApp notification.
export const MEAL_CUTOFFS = { breakfast: 11 * 60, lunch: 15 * 60, dinner: 24 * 60 };

function arrivalMinutes(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return 0;
  let hours = Number(match[1]);
  if (match[3]) hours = (hours % 12) + (match[3].toUpperCase() === "PM" ? 12 : 0);
  return hours * 60 + Number(match[2]);
}

export function getForecast(guests, meal, plan, day) {
  const attending = guests.filter((guest) => {
    if (guest.status === "Departed" || guest.status === "Cancelled") return false;
    if (guest.sourceIdentity && (!guest.arrivalDate || !guest.departureDate)) return false;
    if (guest.arrivalDate && guest.arrivalDate > day) return false;
    if (guest.departureDate && guest.departureDate < day) return false;
    if (guest.stay === "Day visitor" && guest.arrivalDate !== day) return false;
    return (guest.arrivalDate && guest.arrivalDate < day) || arrivalMinutes(guest.arrivalTime) < meal.cutoff;
  });
  const guestCount = attending.reduce((sum, guest) => sum + Number(guest.count || 1), 0);
  const expected = guestCount + Number(plan.volunteers) + Number(plan.visitors);
  const bufferCount = Math.ceil((expected * Number(plan.buffer)) / 100);
  return {
    guests: guestCount,
    diners: attending.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    expected,
    bufferCount,
    target: expected + bufferCount,
  };
}

export function rosterMealCounts(guests, day) {
  const plan = { volunteers: 0, visitors: 0, buffer: 0 };
  return Object.fromEntries(Object.entries(MEAL_CUTOFFS).map(([name, cutoff]) => [
    name, getForecast(guests, { cutoff }, plan, day).expected,
  ]));
}
