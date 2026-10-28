// One attendee per roster row. Group flight/bus services by day and direction.
export const EMPTY_TRANSPORT = { assignments: [], drivers: [], vehicles: [] };
export { tripCollapsed } from "./transportDisplay.js";
export const transportForLeg = (guest, direction) => (direction === "Arrivals" ? guest.airportPickup : guest.airportDropoff) ?? guest.transport;
export function transportGroups(guests, direction) {
  const groups = new Map();
  for (const guest of guests) {
    if (guest.status === "Cancelled") continue;
    if (transportForLeg(guest, direction) === "Not needed") continue;
    const arrival = direction === "Arrivals";
    const method = !arrival && /bus\s*\(arrival\)/i.test(guest.travelMethod || "") ? "" : guest.travelMethod || "";
    const isBus = /bus/i.test(method);
    const flight = isBus ? "" :
      (arrival ? guest.arrivalFlight : guest.departureFlight)
        ?.trim()
        .toUpperCase()
        .replace(/\s+/g, "") || "";
    const airport =
      (arrival ? guest.arrivalAirport : guest.departureAirport)
        ?.trim()
        .toUpperCase() || "";
    if (
      !/flight|air|bus/i.test(method) &&
      !flight &&
      transportForLeg(guest, direction) !== "Needed"
    )
      continue;
    const day = (arrival ? guest.arrivalDate : guest.departureDate) || "";
    const time = (arrival ? guest.arrivalTime : guest.departureTime) || "";
    const mode = isBus
      ? "Bus"
      : flight || /flight|air/i.test(method)
        ? "Flight"
        : "Pickup";
    // Unknown flights stay with their registration instead of combining strangers.
    const id = JSON.stringify([
      direction,
      day,
      mode,
      airport,
      flight || guest.registrationId,
    ]);
    if (!groups.has(id))
      groups.set(id, {
        id,
        direction,
        day,
        time,
        method: mode,
        flight,
        airport,
        guests: [],
      });
    const group = groups.get(id);
    if (time && (!group.time || time < group.time)) group.time = time;
    group.guests.push(guest);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      timeKnown: group.guests.every(g => (direction === "Arrivals" ? g.arrivalTimeKnown : g.departureTimeKnown) !== false),
      latestTime: group.guests.map(g => direction === "Arrivals" ? g.arrivalTime : g.departureTime).filter(Boolean).sort().at(-1) || "",
      signature: JSON.stringify(
        group.guests
          .map((g) => [
            g.sourceIdentity,
            g.arrivalDate,
            g.arrivalTime,
            g.departureDate,
            g.departureTime,
            transportForLeg(g, direction),
          ])
          .sort((a, b) => a[0].localeCompare(b[0])),
      ),
      timeMismatch:
        new Set(
          group.guests
            .map((g) =>
              direction === "Arrivals" ? g.arrivalTime : g.departureTime,
            )
            .filter(Boolean),
        ).size > 1,
    }))
    .sort(
      (a, b) =>
        (a.day || "9999").localeCompare(b.day || "9999") ||
        (a.time || "99").localeCompare(b.time || "99") ||
        a.flight.localeCompare(b.flight),
    );
}
export function transportWithPlans(groups, assignments) {
  const byId = new Map(assignments.map((a) => [a.id, a]));
  const result = groups.map((g) => ({
    ...g,
    plan: byId.get(g.id) || {
      id: g.id,
      driver: "",
      vehicle: "",
      status: "Planned",
      pickup: "",
      notes: "",
      revision: "",
    },
  }));
  // Shared consecutive services at the same airport/date share the earliest suggested departure.
  let previous;
  for (const group of result) {
    if (group.direction !== "Departures" || !group.day || !group.time) continue;
    const key =
      group.plan.driver && group.plan.vehicle
        ? JSON.stringify([
            group.day,
            group.airport,
            group.plan.driver,
            group.plan.vehicle,
          ])
        : group.id;
    let suggestion;
    if (previous?.key === key) suggestion = previous.suggestion;
    else {
      const date = new Date(`${group.day}T${group.time}:00`);
      date.setMinutes(date.getMinutes() - 180);
      const pad = (n) => String(n).padStart(2, "0");
      suggestion = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    group.suggestedPickup = suggestion;
    previous = { key, suggestion };
  }
  return result;
}
