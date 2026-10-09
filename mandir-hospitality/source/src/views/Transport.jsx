import { useMemo, useState } from "react";
import {
  ArrowRight,
  CarFront,
  Check,
  CheckCheck,
  Clock3,
  MapPin,
  Navigation,
  Phone,
  PlaneLanding,
  PlaneTakeoff,
  Plus,
  Search,
  Users,
} from "lucide-react";
import Sheet from "../components/Sheet";
import { useLocalStorage } from "../lib/storage";
import "../styles/operations.css";

const DRIVERS = [
  {
    id: "harish",
    name: "Harishbhai Patel",
    initials: "HP",
    vehicle: "Ford Transit · 12 seats",
    capacity: 12,
    phone: "+16095550124",
  },
  {
    id: "bhavik",
    name: "Bhavikbhai Shah",
    initials: "BS",
    vehicle: "Mercedes Sprinter · 14 seats",
    capacity: 14,
    phone: "+16095550138",
  },
  {
    id: "hitesh",
    name: "Hiteshbhai Desai",
    initials: "HD",
    vehicle: "Toyota Sienna · 7 seats",
    capacity: 7,
    phone: "+16095550146",
  },
  {
    id: "ramesh",
    name: "Rameshbhai Mehta",
    initials: "RM",
    vehicle: "Ford Transit · 12 seats",
    capacity: 12,
    phone: "+16095550167",
  },
];

const INITIAL_TRIPS = [
  {
    id: "T-101",
    guestId: "G-1001",
    direction: "pickup",
    flight: "United · UA 1422",
    time: "13:45",
    location: "Newark Airport · Terminal C",
    driverId: "harish",
    status: "On the way",
    note: "Wheelchair assistance · meet at Gate 2",
  },
  {
    id: "T-102",
    guestId: "G-1005",
    direction: "pickup",
    flight: "Air Canada · AC 712",
    time: "14:20",
    location: "Newark Airport · Terminal A",
    driverId: "bhavik",
    status: "Scheduled",
    note: "2 checked bags",
  },
  {
    id: "T-103",
    guestId: "G-1006",
    direction: "pickup",
    flight: "British Airways · BA 189",
    time: "15:10",
    location: "Newark Airport · Terminal B",
    driverId: "hitesh",
    status: "Scheduled",
    note: "Call on arrival",
  },
  {
    id: "T-104",
    guestId: "G-1004",
    direction: "pickup",
    flight: "Delta · DL 0828",
    time: "15:30",
    location: "Newark Airport · Terminal A",
    driverId: "",
    status: "Scheduled",
    note: "Family of 4 · extra luggage",
  },
  {
    id: "T-105",
    guestId: "G-1007",
    direction: "pickup",
    flight: "Charter bus · 402",
    time: "16:00",
    location: "Trenton Transit Center",
    driverId: "",
    status: "Scheduled",
    note: "Group of 8 · minibus required",
  },
  {
    id: "T-106",
    guestId: "G-1002",
    direction: "departure",
    flight: "United · UA 149",
    time: "17:45",
    location: "Newark Airport · Terminal C",
    driverId: "ramesh",
    status: "Scheduled",
    note: "Allow 90 minutes at the airport",
  },
];

function displayTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value || "")) return value || "—";
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

function departureTime(flight) {
  const [hours, minutes] = flight.split(":").map(Number);
  const total = (hours * 60 + minutes - 135 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function Transport({ guests, onUpdateGuest, toast, sheetMode = false }) {
  const [trips, setTrips] = useLocalStorage(sheetMode ? "mandir-sheet-trips-v1" : "mandir-trips-v1", () => sheetMode ? [] : INITIAL_TRIPS, !sheetMode);
  const [direction, setDirection] = useState("pickup");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [sheet, setSheet] = useState(null);
  const [driverId, setDriverId] = useState("");
  const [formError, setFormError] = useState("");
  const guestById = useMemo(
    () => new Map(guests.map((guest) => [guest.id, guest])),
    [guests],
  );
  const visibleTrips = trips.filter((trip) => {
    const guest = guestById.get(trip.guestId);
    const driver = DRIVERS.find((item) => item.id === trip.driverId);
    return (
      trip.direction === direction &&
      (status === "All statuses" || trip.status === status) &&
      [guest?.name, trip.party, trip.flight, trip.location, driver?.name]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  const nextDeparture = trips
    .filter(
      (trip) => trip.direction === "departure" && trip.status !== "Completed",
    )
    .sort((a, b) => a.time.localeCompare(b.time))[0];
  const pending = trips.filter((trip) => trip.status === "Scheduled").length;
  const active = trips.filter((trip) => trip.status === "On the way").length;
  const completed = trips.filter((trip) => trip.status === "Completed").length;

  function updateTrip(trip, patch) {
    setTrips((previous) =>
      previous.map((item) =>
        item.id === trip.id ? { ...item, ...patch } : item,
      ),
    );
  }

  function advanceTrip(trip) {
    const assignedDriver = DRIVERS.find(
      (driver) => driver.id === trip.driverId,
    );
    if (
      !trip.driverId ||
      assignedDriver?.capacity < (guestById.get(trip.guestId)?.count || 1)
    ) {
      setDriverId("");
      setSheet({ type: "driver", trip });
      return;
    }
    const busyDriver = trips.some(
      (item) =>
        item.id !== trip.id &&
        item.driverId === trip.driverId &&
        item.status === "On the way",
    );
    if (trip.status === "Scheduled" && busyDriver) {
      setDriverId("");
      setSheet({ type: "driver", trip });
      toast(
        "This driver is on another journey. Please assign an available driver.",
      );
      return;
    }
    const nextStatus = trip.status === "Scheduled" ? "On the way" : "Completed";
    updateTrip(trip, { status: nextStatus });
    if (!sheetMode && trip.guestId && guestById.has(trip.guestId))
      onUpdateGuest(trip.guestId, {
        transport: nextStatus === "Completed" ? "Not needed" : "Assigned",
      });
    toast(
      nextStatus === "Completed"
        ? "Trip completed. Thank you for your seva."
        : "Trip dispatched. The journey is underway.",
    );
  }

  function assignDriver(event) {
    event.preventDefault();
    if (!driverId) return;
    const driver = DRIVERS.find((item) => item.id === driverId);
    const busy = trips.some(
      (trip) =>
        trip.id !== sheet.trip.id &&
        trip.driverId === driverId &&
        trip.status === "On the way",
    );
    if (
      !driver ||
      driver.capacity < (guestById.get(sheet.trip.guestId)?.count || 1) ||
      busy
    ) {
      setDriverId("");
      toast("Choose an available driver with enough seats for the party.");
      return;
    }
    updateTrip(sheet.trip, { driverId });
    if (!sheetMode && sheet.trip.guestId)
      onUpdateGuest(sheet.trip.guestId, { transport: "Assigned" });
    setSheet(null);
    toast("Driver assigned. This trip is ready for dispatch.");
  }

  function createTrip(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const newDirection = data.get("direction");
    const guestId = data.get("guestId");
    if (
      trips.some(
        (trip) =>
          trip.guestId === guestId &&
          trip.direction === newDirection &&
          trip.status !== "Completed",
      )
    ) {
      setFormError("This guest already has an active trip in this direction.");
      return;
    }
    const assignedDriver = data.get("driverId");
    const driver = DRIVERS.find((item) => item.id === assignedDriver);
    if (driver && driver.capacity < (guestById.get(guestId)?.count || 1)) {
      setFormError(
        "This vehicle does not have enough seats for the whole party. Choose a larger vehicle.",
      );
      return;
    }
    setTrips((previous) => [
      ...previous,
      {
        id: `T-${Date.now()}`,
        guestId,
        direction: newDirection,
        flight: String(data.get("flight")).trim(),
        time: data.get("time"),
        location: String(data.get("location")).trim(),
        driverId: assignedDriver,
        note: String(data.get("note")).trim(),
        status: "Scheduled",
      },
    ]);
    if (!sheetMode) onUpdateGuest(guestId, {
      transport: assignedDriver ? "Assigned" : "Needed",
    });
    setDirection(newDirection);
    setStatus("All statuses");
    setQuery("");
    setSheet(null);
    toast("Trip added to the dispatch board.");
  }

  return (
    <div className="op-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">EVERY JOURNEY, TAKEN CARE OF</p>
          <h1 className="page-title">Transport dispatch</h1>
          <p className="page-description">
            A smooth arrival. A thoughtful farewell.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setFormError("");
            setSheet({ type: "new" });
          }}
        >
          <Plus size={17} /> New trip
        </button>
      </div>
      {sheetMode && <p className="sheet-data-note">Guest pickup requests come from the sheet. Dispatch plans are session-only; they are not saved to the sheet and are cleared on reload.</p>}

      <div className="op-stat-grid">
        <div className="card op-stat">
          <span className="op-stat-icon amber">
            <Clock3 size={20} />
          </span>
          <div>
            <span className="op-stat-label">Upcoming trips</span>
            <strong>
              {pending}
              <small> ready to plan</small>
            </strong>
          </div>
        </div>
        <div className="card op-stat">
          <span className="op-stat-icon blue">
            <Navigation size={20} />
          </span>
          <div>
            <span className="op-stat-label">On the road</span>
            <strong>
              {active}
              <small> in progress</small>
            </strong>
          </div>
        </div>
        <div className="card op-stat">
          <span className="op-stat-icon green">
            <CheckCheck size={20} />
          </span>
          <div>
            <span className="op-stat-label">Completed</span>
            <strong>
              {completed}
              <small> journeys today</small>
            </strong>
          </div>
        </div>
      </div>

      {nextDeparture && (
        <section
          className="op-departure"
          aria-label="Next departure recommendation"
        >
          <div className="op-departure-main">
            <span className="op-departure-kicker">
              <Clock3 size={15} /> NEXT MANDIR DEPARTURE
            </span>
            <h2>
              Leave at {displayTime(departureTime(nextDeparture.time))}
              <span> for a relaxed journey.</span>
            </h2>
            <p>
              {guestById.get(nextDeparture.guestId)?.name ||
                nextDeparture.party}{" "}
              <span className="op-dot">·</span> {nextDeparture.location}
            </p>
          </div>
          <div className="op-time-breakdown">
            <div>
              <span>Drive time</span>
              <strong>
                45 <small>min</small>
              </strong>
            </div>
            <Plus size={15} />
            <div>
              <span>Airport buffer</span>
              <strong>
                90 <small>min</small>
              </strong>
            </div>
            <ArrowRight size={17} />
            <div>
              <span>Flight time</span>
              <strong>{displayTime(nextDeparture.time)}</strong>
            </div>
          </div>
        </section>
      )}

      <div className="op-toolbar">
        <div
          className="segmented op-trip-tabs"
          role="group"
          aria-label="Trip direction"
        >
          <button
            className={direction === "pickup" ? "active" : ""}
            aria-pressed={direction === "pickup"}
            onClick={() => setDirection("pickup")}
          >
            <PlaneLanding size={16} />
            <span>Guest pickups</span>
            <span className="op-tab-count">
              {trips.filter((trip) => trip.direction === "pickup").length}
            </span>
          </button>
          <button
            className={direction === "departure" ? "active" : ""}
            aria-pressed={direction === "departure"}
            onClick={() => setDirection("departure")}
          >
            <PlaneTakeoff size={16} />
            <span>Departures</span>
            <span className="op-tab-count">
              {trips.filter((trip) => trip.direction === "departure").length}
            </span>
          </button>
        </div>
        <div className="op-search-tools">
          <label className="search-field op-search">
            <Search size={17} />
            <input
              type="search"
              aria-label="Search trips"
              placeholder="Search guest, flight or driver…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            className="op-status-select"
            aria-label="Filter trip status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option>All statuses</option>
            <option>Scheduled</option>
            <option>On the way</option>
            <option>Completed</option>
          </select>
        </div>
      </div>

      <div className="op-list-heading">
        <h2>
          {direction === "pickup" ? "Arrival journeys" : "Departure journeys"}{" "}
          <span>{visibleTrips.length}</span>
        </h2>
        <span>All times local</span>
      </div>
      <div className="trip-grid">
        {visibleTrips.map((trip) => {
          const guest = guestById.get(trip.guestId);
          const driver = DRIVERS.find((item) => item.id === trip.driverId);
          const FlightIcon = trip.flight.toLowerCase().includes("bus")
            ? CarFront
            : trip.direction === "pickup"
              ? PlaneLanding
              : PlaneTakeoff;
          return (
            <article
              className={`card trip-card ${trip.status === "On the way" ? "trip-active" : ""}`}
              key={trip.id}
            >
              <div className="trip-top">
                <span className="trip-flight">
                  <FlightIcon size={15} />
                  {trip.flight}
                </span>
                <span
                  className={`badge ${trip.status === "Completed" ? "green" : trip.status === "On the way" ? "blue" : "amber"}`}
                >
                  <span className="op-status-dot" />
                  {trip.status}
                </span>
              </div>
              <div className="trip-guest">
                <h3>{guest?.name || trip.party || "Guest party"}</h3>
                <span>
                  <Users size={14} /> {guest?.count || trip.count || 1}
                </span>
              </div>
              <div className="trip-route">
                <span className="trip-route-icon">
                  <MapPin size={16} />
                </span>
                <div>
                  <strong>{trip.location}</strong>
                  <span>
                    {trip.direction === "pickup"
                      ? "Arrival"
                      : "Flight departure"}{" "}
                    at {displayTime(trip.time)}{" "}
                    <span className="op-dot">·</span>{" "}
                    {trip.direction === "pickup"
                      ? "To Mandir campus"
                      : `Leave Mandir at ${displayTime(departureTime(trip.time))}`}
                  </span>
                </div>
              </div>
              {trip.note && <p className="trip-note">{trip.note}</p>}
              <div className="trip-driver">
                {driver ? (
                  <>
                    <span className="op-avatar">{driver.initials}</span>
                    <div>
                      <strong>{driver.name}</strong>
                      <span>
                        <CarFront size={13} /> {driver.vehicle}
                      </span>
                    </div>
                    <a
                      className="icon-button trip-call"
                      href={`tel:${driver.phone}`}
                      aria-label={`Call ${driver.name}`}
                    >
                      <Phone size={16} />
                    </a>
                  </>
                ) : (
                  <>
                    <span className="op-avatar op-avatar-empty">
                      <CarFront size={19} />
                    </span>
                    <div>
                      <strong>Driver needed</strong>
                      <span>Assign a sevak before dispatch</span>
                    </div>
                  </>
                )}
              </div>
              <div className="trip-actions">
                {trip.status === "Completed" ? (
                  <span className="trip-completed">
                    <CheckCheck size={16} /> Journey completed
                  </span>
                ) : (
                  <>
                    <button
                      className="button secondary small"
                      onClick={() => {
                        setDriverId(trip.driverId);
                        setSheet({ type: "driver", trip });
                      }}
                    >
                      {driver ? "Change driver" : "Assign driver"}
                    </button>
                    {driver && (
                      <button
                        className={`button ${trip.status === "On the way" ? "trip-complete-button" : "primary"} small`}
                        onClick={() => advanceTrip(trip)}
                      >
                        {trip.status === "Scheduled" ? (
                          <>
                            <Navigation size={15} /> Dispatch
                          </>
                        ) : (
                          <>
                            <Check size={16} /> Complete trip
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {visibleTrips.length === 0 && (
        <div className="card empty-state op-empty">
          <CarFront size={30} />
          <h3>No journeys here yet</h3>
          <p>
            {query || status !== "All statuses"
              ? "Try a different search or status filter."
              : "Add a trip to take care of the next arrival."}
          </p>
          <button
            className="button secondary"
            onClick={() => {
              if (query || status !== "All statuses") {
                setQuery("");
                setStatus("All statuses");
              } else {
                setFormError("");
                setSheet({ type: "new" });
              }
            }}
          >
            {query || status !== "All statuses"
              ? "Clear filters"
              : "Add a trip"}
          </button>
        </div>
      )}

      {sheet?.type === "driver" && (
        <Sheet
          title="Assign a driver"
          subtitle={
            guestById.get(sheet.trip.guestId)?.name ||
            "Choose a sevak for this journey."
          }
          onClose={() => setSheet(null)}
        >
          <form onSubmit={assignDriver} className="op-form">
            <div className="op-driver-options">
              {DRIVERS.map((driver) => {
                const tooSmall =
                  driver.capacity <
                  (guestById.get(sheet.trip.guestId)?.count || 1);
                const busy = trips.some(
                  (trip) =>
                    trip.id !== sheet.trip.id &&
                    trip.driverId === driver.id &&
                    trip.status === "On the way",
                );
                return (
                  <label
                    className={`op-driver-option ${driverId === driver.id ? "selected" : ""} ${tooSmall || busy ? "unavailable" : ""}`}
                    key={driver.id}
                  >
                    <input
                      type="radio"
                      name="driver"
                      value={driver.id}
                      checked={driverId === driver.id}
                      onChange={() => setDriverId(driver.id)}
                      required
                      disabled={tooSmall || busy}
                    />
                    <span className="op-avatar">{driver.initials}</span>
                    <span>
                      <strong>{driver.name}</strong>
                      <small>
                        {driver.vehicle}
                        {tooSmall
                          ? " · Not enough seats"
                          : busy
                            ? " · On a journey"
                            : ""}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="op-form-note">
              {sheet.trip.status === "On the way"
                ? "The new driver will take over this journey."
                : "The trip stays scheduled until you tap Dispatch."}
            </p>
            <button
              className="button primary op-full-button"
              type="submit"
              disabled={!driverId}
            >
              Save driver <Check size={17} />
            </button>
          </form>
        </Sheet>
      )}

      {sheet?.type === "new" && (
        <Sheet
          title="Plan a new journey"
          subtitle="A few details to make the arrival effortless."
          onClose={() => setSheet(null)}
        >
          <form className="op-form" onSubmit={createTrip}>
            <label className="field">
              Guest or group
              <select name="guestId" required defaultValue="">
                <option value="" disabled>
                  Select a guest
                </option>
                {guests
                  .filter((guest) => guest.status !== "Departed")
                  .map((guest) => (
                    <option value={guest.id} key={guest.id}>
                      {guest.name} · {guest.count} guests
                    </option>
                  ))}
              </select>
            </label>
            <div className="form-grid">
              <label className="field">
                Journey type
                <select name="direction" defaultValue={direction}>
                  <option value="pickup">Guest pickup</option>
                  <option value="departure">Mandir departure</option>
                </select>
              </label>
              <label className="field">
                Flight / arrival time
                <input type="time" name="time" defaultValue="16:00" required />
              </label>
            </div>
            <label className="field">
              Flight or train
              <input
                name="flight"
                placeholder="e.g. United · UA 83"
                required
                maxLength={65}
              />
            </label>
            <label className="field">
              Airport, station or pickup point
              <input
                name="location"
                placeholder="e.g. Newark Airport · Terminal C"
                required
                maxLength={100}
              />
            </label>
            <label className="field">
              Driver
              <select name="driverId" defaultValue="">
                <option value="">Assign later</option>
                {DRIVERS.map((driver) => (
                  <option value={driver.id} key={driver.id}>
                    {driver.name} · {driver.vehicle}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Pickup notes <span className="op-optional">(optional)</span>
              <input
                name="note"
                placeholder="Meeting point, luggage or assistance"
                maxLength={120}
              />
            </label>
            {formError && (
              <p className="op-form-error" role="alert">
                {formError}
              </p>
            )}
            <button type="submit" className="button primary op-full-button">
              <Plus size={17} /> Add journey
            </button>
          </form>
        </Sheet>
      )}
    </div>
  );
}
