import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, BusFront, CalendarDays, ChevronLeft, ChevronRight, Plane } from "lucide-react";
import { allentownDay } from "../lib/housekeeping";
import { formatTime } from "../lib/data";
import { fullDay, moveDay } from "../lib/occupancy";
import "../styles/daily-movements.css";

const weekday = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
const dayNumber = (iso) => String(Number(iso.slice(8)));
const monthName = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short" });
const people = (list) => list.reduce((sum, g) => sum + (g.count || 1), 0);
const SIDES = {
  arrivals: { dateKey: "arrivalDate", timeKey: "arrivalTime", knownKey: "arrivalTimeKnown", flightKey: "arrivalFlight", airportKey: "arrivalAirport", title: "Arriving", icon: ArrowDownToLine, empty: "Nobody is arriving this day." },
  departures: { dateKey: "departureDate", timeKey: "departureTime", knownKey: "departureTimeKnown", flightKey: "departureFlight", airportKey: "departureAirport", title: "Departing", icon: ArrowUpFromLine, empty: "Nobody is departing this day." },
};

// One row per registration travelling together, earliest first; trips with no time yet come last.
function tripsFor(guests, side, day) {
  const { dateKey, timeKey, knownKey, flightKey, airportKey } = SIDES[side];
  const trips = new Map();
  for (const guest of guests) {
    if (guest.status === "Cancelled" || guest[dateKey] !== day) continue;
    const known = guest[knownKey] !== false && !!guest[timeKey];
    const key = [guest.registrationId || guest.id, known ? guest[timeKey] : "", guest[flightKey], guest[airportKey]].join("|");
    if (!trips.has(key)) trips.set(key, { key, time: known ? guest[timeKey] : "", flight: guest[flightKey] || "", airport: guest[airportKey] || "", method: guest.travelMethod || "", guests: [] });
    trips.get(key).guests.push(guest);
  }
  return [...trips.values()].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") || a.guests[0].name.localeCompare(b.guests[0].name));
}

export default function DailyMovements({ guests }) {
  const [day, setDay] = useState(allentownDay);
  const today = allentownDay();
  const counts = useMemo(() => {
    const out = new Map();
    for (const guest of guests) {
      if (guest.status === "Cancelled") continue;
      for (const [side, { dateKey }] of Object.entries(SIDES)) {
        const date = guest[dateKey]; if (!date) continue;
        const entry = out.get(date) || { arrivals: 0, departures: 0 };
        entry[side] += guest.count || 1; out.set(date, entry);
      }
    }
    return out;
  }, [guests]);
  const trips = useMemo(() => Object.fromEntries(Object.keys(SIDES).map((side) => [side, tripsFor(guests, side, day)])), [guests, day]);
  const strip = Array.from({ length: 14 }, (_, i) => moveDay(day, i - 3));
  return (
    <section className="card daily-movements" aria-label="Daily arrivals and departures">
      <header className="daily-head">
        <div>
          <span className="daily-kicker"><CalendarDays size={14} /> DAY BY DAY</span>
          <h2 aria-live="polite">{fullDay(day)}</h2>
        </div>
        <div className="daily-nav">
          <button type="button" className="button secondary" aria-label="Previous day" onClick={() => setDay(moveDay(day, -1))}><ChevronLeft size={18} /></button>
          <button type="button" className="button secondary" disabled={day === today} onClick={() => setDay(today)}>Today</button>
          <button type="button" className="button secondary" aria-label="Next day" onClick={() => setDay(moveDay(day, 1))}><ChevronRight size={18} /></button>
        </div>
      </header>
      <div className="daily-strip" role="group" aria-label="Choose a day">
        {strip.map((iso) => {
          const entry = counts.get(iso);
          return (
            <button key={iso} type="button" className={`daily-chip${iso === day ? " active" : ""}${iso === today ? " is-today" : ""}`} aria-pressed={iso === day} aria-label={`${fullDay(iso)}: ${entry?.arrivals || 0} arriving, ${entry?.departures || 0} departing`} onClick={() => setDay(iso)}>
              <small>{weekday(iso)}</small><strong>{dayNumber(iso)}</strong><small>{monthName(iso)}</small>
              <span className="daily-dots" aria-hidden="true"><i className={entry?.arrivals ? "in" : ""}>{entry?.arrivals || ""}</i><i className={entry?.departures ? "out" : ""}>{entry?.departures || ""}</i></span>
            </button>
          );
        })}
      </div>
      <div className="daily-columns">
        {Object.entries(SIDES).map(([side, config]) => {
          const list = trips[side], Icon = config.icon;
          return (
            <section key={side} className={`daily-side daily-${side}`} aria-label={config.title}>
              <h3><Icon size={17} />{config.title}<span>{people(list.flatMap((trip) => trip.guests))}</span></h3>
              {!list.length && <p className="daily-empty">{config.empty}</p>}
              {list.map((trip) => {
                const first = trip.guests[0], needsRide = trip.guests.some((g) => g.transport === "Needed");
                return (
                  <article key={trip.key} className="daily-trip">
                    <div className="daily-time">{trip.time ? formatTime(trip.time) : "Time needed"}</div>
                    <div className="daily-who">
                      <strong>{trip.guests.map((g) => g.name).join(", ")}</strong>
                      <span>{[first.city, trip.guests.length > 1 ? `${trip.guests.length} guests` : ""].filter(Boolean).join(" · ")}</span>
                      <span className="daily-how">
                        {trip.method === "Flight" || trip.flight ? <Plane size={13} /> : trip.method ? <BusFront size={13} /> : null}
                        {[trip.method, trip.flight, trip.airport].filter(Boolean).join(" · ") || "Travel details needed"}
                        {needsRide && <em>{side === "arrivals" ? "Pickup" : "Drop-off"}</em>}
                      </span>
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </section>
  );
}
