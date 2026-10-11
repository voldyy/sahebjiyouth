import { useEffect, useMemo, useState } from "react";
import {
  PlaneLanding,
  PlaneTakeoff,
  BusFront,
  Car,
  Users,
  Search,
  Plus,
  Trash2,
  CalendarDays,
  ExternalLink,
  Link2,
  Clock,
} from "lucide-react";
import Sheet from "../components/Sheet";
import { transportGroups, transportWithPlans } from "../lib/transport";
import { driverFromUrl, driverUrl } from "../lib/driverLinks";
import { fullDay } from "../lib/occupancy";
import "../styles/operations.css";
import "../styles/shared-transport.css";
const timeLabel = (value) =>
  value
    ? new Date(`2000-01-01T${value}`).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "Time needed";
const pickupLabel = (value) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function FlightStatus({ group, workspace }) {
  const [flight, setFlight] = useState(null),
    [loading, setLoading] = useState(false);
  const check = async () => {
    setLoading(true);
    try {
      setFlight((await workspace.flightStatus(group)).flight);
    } catch (error) {
      setFlight({ available: false, reason: error.message });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (group.method === "Flight" && group.day === today() && group.flight)
      check();
  }, [group.id]);
  if (group.method !== "Flight" || !group.flight) return null;
  return (
    <div className="transport-flight-status">
      {flight?.available ? (
        <>
          <strong>{flight.status}</strong>
          {flight.estimated && (
            <span>Latest: {pickupLabel(flight.estimated)}</span>
          )}
          <small>
            Checked {new Date(flight.checkedAt).toLocaleTimeString()}
          </small>
        </>
      ) : (
        <small>
          {flight?.reason ||
            (group.day === today()
              ? "Checking flight…"
              : "Flight status available on the travel day")}
        </small>
      )}
      <div>
        {group.day === today() && (
          <button className="text-button" disabled={loading} onClick={check}>
            {loading ? "Checking…" : "Refresh flight"}
          </button>
        )}
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(group.flight + " flight status " + group.day)}`}
          target="_blank"
          rel="noreferrer"
        >
          Flight tracker <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
export default function SheetTransport({ workspace, toast }) {
  const [query, setQuery] = useState(""),
    [airport, setAirport] = useState("All"),
    [driver, setDriver] = useState(() => driverFromUrl(location.href)),
    [date, setDate] = useState("");
  const [resources, setResources] = useState(false),
    [editing, setEditing] = useState(null),
    [draft, setDraft] = useState(null),
    [error, setError] = useState("");
  const [newDriver, setNewDriver] = useState(""),
    [newVehicle, setNewVehicle] = useState("");
  const groups = useMemo(
    () =>
      ["Arrivals", "Departures"]
        .flatMap((direction) =>
          transportWithPlans(
            transportGroups(workspace.guests, direction),
            workspace.transport.assignments,
          ),
        )
        .sort(
          (a, b) =>
            (a.day || "9999").localeCompare(b.day || "9999") ||
            (a.time || "99").localeCompare(b.time || "99") ||
            a.direction.localeCompare(b.direction),
        ),
    [workspace.guests, workspace.transport],
  );
  const airports = [
    ...new Set(groups.map((g) => g.airport).filter(Boolean)),
  ].sort();
  const filtered = groups.filter(
    (g) =>
      (airport === "All" || g.airport === airport) &&
      (!date || g.day === date) &&
      (driver === "All" ||
        (driver === "Unassigned"
          ? !g.plan.driver
          : g.plan.driver.toLowerCase() === driver.toLowerCase())) &&
      [
        g.flight,
        g.airport,
        g.plan.driver,
        g.plan.vehicle,
        ...g.guests.map((g) => g.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const days = [...new Set(filtered.map((g) => g.day))];
  const assigned = filtered.filter(
    (g) => g.plan.driver && g.plan.vehicle,
  ).length;
  useEffect(() => {
    const sync = () => setDriver(driverFromUrl(location.href));
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  const selectDriver = (name) => {
    setDriver(name);
    history.replaceState(null, "", driverUrl(location.href, name));
  };
  const copyDriver = async (name) => {
    try {
      await navigator.clipboard.writeText(driverUrl(location.href, name));
      toast(`Link copied for ${name}.`);
    } catch {
      toast("Use the Driver view link to open and copy its address.");
    }
  };
  const saveResource = async (type, name, active) => {
    setError("");
    try {
      await workspace.saveResource(type, name, active);
      if (type === "Driver") setNewDriver("");
      else setNewVehicle("");
      toast(`${type} list saved to Google Sheets.`);
    } catch (error) {
      setError(error.message);
    }
  };
  const open = (group) => {
    setEditing(group);
    setDraft({ ...group.plan });
    setError("");
  };
  const save = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await workspace.saveTransport(editing, draft);
      setEditing(null);
      toast("Transport assignment saved to Google Sheets.");
    } catch (error) {
      setError(error.message);
    }
  };
  return (
    <div className="op-page shared-transport">
      <div className="page-heading">
        <div>
          <div className="eyebrow">JOURNEYS & SEVA</div>
          <h1>Airport Trips</h1>
          <p>Airport pickups and drop-offs, together in one schedule.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            setResources(true);
            setError("");
          }}
        >
          <Car size={17} />
          Drivers & vehicles
        </button>
      </div>
      <div className="transport-summary">
        <div>
          <strong>{filtered.length}</strong>
          <span>Journeys</span>
        </div>
        <div>
          <strong>
            {
              new Set(
                filtered.flatMap((g) => g.guests.map((guest) => guest.id)),
              ).size
            }
          </strong>
          <span>Guests travelling</span>
        </div>
        <div>
          <strong>{filtered.length - assigned}</strong>
          <span>Need assignment</span>
        </div>
        <div>
          <strong>{workspace.transport.drivers.length}</strong>
          <span>Sevak drivers</span>
        </div>
      </div>
      <div className="transport-toolbar card">
        <label className="field transport-search">
          Search
          <span className="search-field">
            <Search size={17} />
            <input
              aria-label="Search transport"
              placeholder="Guest, flight, driver…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </span>
        </label>
        <label className="field">
          Airport
          <select value={airport} onChange={(e) => setAirport(e.target.value)}>
            <option value="All">All airports</option>
            {airports.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Driver filter
          <select value={driver} onChange={(e) => selectDriver(e.target.value)}>
            {[
              ...new Set([
                "All",
                "Unassigned",
                ...workspace.transport.drivers,
                driver,
              ]),
            ].map((d) => (
              <option key={d} value={d}>
                {d === "All" ? "All drivers" : d}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Travel date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {date && (
          <button className="text-button" onClick={() => setDate("")}>
            All dates
          </button>
        )}
      </div>
      {driver !== "All" && driver !== "Unassigned" && (
        <div className="transport-driver-link">
          <strong>Trips assigned to {driver}</strong>
          <a href={driverUrl(location.href, driver)}>
            Driver view <ExternalLink size={13} />
          </a>
          <button className="text-button" onClick={() => copyDriver(driver)}>
            <Link2 size={14} /> Copy driver link
          </button>
          <button className="text-button" onClick={() => selectDriver("All")}>
            Show all trips
          </button>
        </div>
      )}
      {!filtered.length && (
        <div className="card transport-empty">
          <BusFront size={32} />
          <h2>No journeys found</h2>
          <p>
            {workspace.loading
              ? "Loading travel details…"
              : "Adjust the filters, or add travel details in the guest sheet."}
          </p>
        </div>
      )}
      {days.map((day) => (
        <section key={day} className="transport-day">
          <h2>
            <CalendarDays size={18} />
            {day ? fullDay(day) : "Date needed"}
          </h2>
          {filtered
            .filter((g) => g.day === day)
            .map((group) => (
              <article className="card transport-journey" key={group.id}>
                <div className="transport-journey-head">
                  <div className="transport-time">
                    <Clock size={16} />
                    <strong>{timeLabel(group.time)}</strong>
                    <span>
                      {group.direction === "Arrivals" ? "Arrival" : "Departure"}
                    </span>
                  </div>
                  <div className="transport-service">
                    <span className="eyebrow">
                      {group.method} · {group.airport || "Location needed"}
                    </span>
                    <h3>{group.flight || `${group.method} journey`}</h3>
                    <span>
                      {group.guests.length}{" "}
                      {group.guests.length === 1 ? "guest" : "guests"}
                    </span>
                  </div>
                  <span
                    className={`transport-status ${group.plan.driver && group.plan.vehicle ? "assigned" : ""}`}
                  >
                    {group.plan.driver && group.plan.vehicle
                      ? group.plan.status
                      : "Unassigned"}
                  </span>
                </div>
                {group.timeMismatch && (
                  <p className="transport-review">
                    Guests have different times for this service. Showing the
                    earliest; verify with the airline.
                  </p>
                )}
                <div className="transport-journey-body">
                  <div>
                    <p className="transport-guest-names">
                      {group.guests.map((g) => g.name).join(", ")}
                    </p>
                    <details>
                      <summary>
                        <Users size={15} /> Guest details
                      </summary>
                      <ul className="transport-guests">
                        {group.guests.map((g) => (
                          <li key={g.id}>
                            <span>
                              {g.name}
                              <small>
                                {g.registrationId}
                                {g.phone && (
                                  <>
                                    {" "}
                                    · <a href={`tel:${g.phone}`}>{g.phone}</a>
                                  </>
                                )}
                              </small>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                    <FlightStatus group={group} workspace={workspace} />
                  </div>
                  <div className="transport-plan">
                    <div>
                      <span>Sevak driver</span>
                      <strong>{group.plan.driver || "Not assigned"}</strong>
                    </div>
                    <div>
                      <span>Vehicle</span>
                      <strong>{group.plan.vehicle || "Not assigned"}</strong>
                    </div>
                    {(group.plan.pickup || group.suggestedPickup) && (
                      <div>
                        <span>
                          {group.plan.pickup
                            ? "Pickup / mandir departure"
                            : "Suggested mandir departure"}
                        </span>
                        <strong>
                          {pickupLabel(
                            group.plan.pickup || group.suggestedPickup,
                          )}
                        </strong>
                      </div>
                    )}
                    {group.plan.notes && <p>{group.plan.notes}</p>}
                    <button
                      className="button secondary"
                      disabled={
                        !workspace.connected ||
                        workspace.saving ||
                        !group.day ||
                        group.guests.some((g) => !g.sourceWritable)
                      }
                      onClick={() => open(group)}
                    >
                      {group.plan.revision
                        ? "Edit transport assignment"
                        : "Assign transport"}
                    </button>
                    {!group.day && (
                      <small>
                        Add the travel date in the source sheet before
                        assigning.
                      </small>
                    )}
                  </div>
                </div>
              </article>
            ))}
        </section>
      ))}
      {editing && (
        <Sheet
          title={`Assign ${editing.flight || editing.method} · ${editing.airport || "Journey"}`}
          subtitle={`${editing.day} · ${editing.guests.length} guests`}
          onClose={() => {
            if (!workspace.saving) setEditing(null);
          }}
        >
          <form className="op-form" onSubmit={save}>
            <label className="field">
              Sevak driver
              <select
                value={draft.driver}
                disabled={workspace.saving}
                onChange={(e) => setDraft({ ...draft, driver: e.target.value })}
              >
                <option value="">Not assigned</option>
                {[
                  ...new Set([
                    ...workspace.transport.drivers,
                    ...(draft.driver ? [draft.driver] : []),
                  ]),
                ].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Vehicle
              <select
                value={draft.vehicle}
                disabled={workspace.saving}
                onChange={(e) =>
                  setDraft({ ...draft, vehicle: e.target.value })
                }
              >
                <option value="">Not assigned</option>
                {[
                  ...new Set([
                    ...workspace.transport.vehicles,
                    ...(draft.vehicle ? [draft.vehicle] : []),
                  ]),
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            {(!workspace.transport.drivers.length ||
              !workspace.transport.vehicles.length) && (
              <p>
                Add your driver and vehicle lists using “Drivers & vehicles”.
              </p>
            )}
            <label className="field">
              Pickup / mandir departure
              <input
                type="datetime-local"
                value={draft.pickup}
                disabled={workspace.saving}
                onChange={(e) => setDraft({ ...draft, pickup: e.target.value })}
              />
            </label>
            {editing.suggestedPickup && !draft.pickup && (
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  setDraft({ ...draft, pickup: editing.suggestedPickup })
                }
              >
                Use suggested time: {pickupLabel(editing.suggestedPickup)}
              </button>
            )}
            <label className="field">
              Journey status
              <select
                value={draft.status}
                disabled={workspace.saving}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                {["Planned", "Dispatched", "Completed"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Driver notes
              <input
                value={draft.notes}
                maxLength={500}
                disabled={workspace.saving}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Pickup point or useful instructions"
              />
            </label>
            {error && (
              <p className="op-form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={workspace.saving}>
              {workspace.saving ? "Saving…" : "Save transport to sheet"}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={workspace.saving}
              onClick={() =>
                setDraft({
                  ...draft,
                  driver: "",
                  vehicle: "",
                  pickup: "",
                  status: "Planned",
                  notes: "",
                })
              }
            >
              Clear assignment fields
            </button>
          </form>
        </Sheet>
      )}
      {resources && (
        <Sheet
          title="Drivers & vehicles"
          subtitle="These lists are shared with every admin."
          onClose={() => {
            if (!workspace.saving) setResources(false);
          }}
        >
          <div className="transport-resources">
            {[
              {
                type: "Driver",
                value: newDriver,
                set: setNewDriver,
                list: workspace.transport.drivers,
              },
              {
                type: "Vehicle",
                value: newVehicle,
                set: setNewVehicle,
                list: workspace.transport.vehicles,
              },
            ].map(({ type, value, set, list }) => (
              <section key={type}>
                <h3>{type === "Driver" ? "Sevak drivers" : "Vehicles"}</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveResource(type, value, true);
                  }}
                >
                  <label className="field">
                    {`New ${type.toLowerCase()}`}
                    <input
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      maxLength={100}
                      required
                      placeholder={
                        type === "Driver"
                          ? "Driver name"
                          : "Vehicle name or registration"
                      }
                    />
                  </label>
                  <button
                    className="button secondary"
                    disabled={workspace.saving || !value.trim()}
                  >
                    <Plus size={16} />
                    Add
                  </button>
                </form>
                {!list.length && <p>No {type.toLowerCase()}s added yet.</p>}
                <ul>
                  {list.map((name) => (
                    <li key={name}>
                      <span>{name}</span>
                      <button
                        className="icon-button"
                        aria-label={`Remove ${type.toLowerCase()} ${name}`}
                        disabled={workspace.saving}
                        onClick={() => saveResource(type, name, false)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {error && (
              <p role="alert" className="op-form-error">
                {error}
              </p>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
