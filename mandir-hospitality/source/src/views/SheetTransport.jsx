import { useEffect, useMemo, useState } from "react";
import {
  BusFront,
  Car,
  Search,
  Plus,
  Trash2,
  CalendarDays,
  Link2,
  Clock,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import Sheet from "../components/Sheet";
import AirlineLabel from "../components/AirlineLabel";
import FlightStatus, { FlightTime, LiveFlightProvider } from "../components/FlightStatus";
import { transportGroups, transportWithPlans, tripCollapsed } from "../lib/transport";
import { dayCollapsed, dayCollapseAt, dayDisplayId } from "../lib/transportDisplay";
import { driverFromUrl, driverUrl } from "../lib/driverLinks";
import { fullDay } from "../lib/occupancy";
import "../styles/operations.css";
import "../styles/shared-transport.css";
export default function SheetTransport({ workspace, toast, readOnly = false }) {
  const [query, setQuery] = useState(""),
    [airport, setAirport] = useState("All"),
    [driver, setDriver] = useState(() => driverFromUrl(location.href)),
    [date, setDate] = useState("");
  const [resources, setResources] = useState(false),
    [inlineDraft, setInlineDraft] = useState(null),
    [saveState, setSaveState] = useState(null),
    [error, setError] = useState("");
  const [newDriver, setNewDriver] = useState(""),
    [newVehicle, setNewVehicle] = useState("");
  const [displaySaving, setDisplaySaving] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => { if (!document.hidden) setNow(Date.now()); };
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); };
  }, []);
  useEffect(() => {
    let active = true, refreshing = false;
    const sync = async () => {
      if (!active || document.hidden || refreshing) return;
      refreshing = true;
      try { await workspace.refreshTripDisplay(); } catch { /* Keep the last confirmed display and retry. */ }
      finally { refreshing = false; }
    };
    const timer = setInterval(sync, 5000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", sync); window.removeEventListener("focus", sync); };
  }, [workspace.refreshTripDisplay]);
  const toggleTrip = async (group, collapsed) => {
    setDisplaySaving(group.id); setError("");
    try { await workspace.setTripCollapsed(group.id, !collapsed); }
    catch (failure) { setError(failure.message); }
    finally { setDisplaySaving(""); }
  };
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
  useEffect(() => {
    setSaveState(current => current?.error ? null : current);
  }, [workspace.refreshedAt]);
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
    if (readOnly) return;
    setError("");
    try {
      await workspace.saveResource(type, name, active);
      if (type === "Driver") setNewDriver("");
      else setNewVehicle("");
      toast(`${type} list saved.`);
    } catch (error) {
      setError(error.message);
    }
  };
  const saveInline = async (group, field, value) => {
    if (readOnly) return;
    const plan = { ...group.plan, [field]: value };
    if (!plan.driver || !plan.vehicle) plan.status = "Planned";
    setInlineDraft({ id: group.id, plan });
    setSaveState({ id: group.id, message: "Saving…" });
    try {
      await workspace.saveTransport(group, plan);
      setSaveState({ id: group.id, message: "Saved" });
    } catch (error) {
      setSaveState({ id: group.id, error: error.message });
    } finally {
      setInlineDraft(null);
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
        {!readOnly && <button
          className="button secondary"
          onClick={() => {
            setResources(true);
            setError("");
          }}
        >
          <Car size={17} />
          Drivers & vehicles
        </button>}
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
      {error && !resources && <p role="alert" className="transport-save-error">{error}</p>}
      {days.map((day) => {
        const trips = filtered.filter(g => g.day === day);
        const minimized = dayCollapsed(day, workspace.tripDisplay || [], now);
        const past = dayCollapseAt(day, now) !== null;
        return (
        <section key={day} className={`transport-day${minimized ? " is-minimized" : ""}${past ? " is-past" : ""}`}>
          <h2 className="transport-day-heading">
            <button className="transport-day-toggle" aria-expanded={!minimized} aria-label={`${minimized ? "Expand" : "Collapse"} trips for ${day || "date needed"}`} disabled={!day || !workspace.connected || !!displaySaving} onClick={() => toggleTrip({ id: dayDisplayId(day) }, minimized)}>
              <CalendarDays size={18} /><span>{day ? fullDay(day) : "Date needed"}</span>
              <small>{displaySaving === dayDisplayId(day) ? "Saving…" : `${trips.length} ${trips.length === 1 ? "trip" : "trips"}`}</small><ChevronDown size={17} />
            </button>
          </h2>
          {!minimized && trips
            .map((group) => {
              const collapsed = tripCollapsed(group, workspace.tripDisplay || [], now);
              return (
              <LiveFlightProvider key={group.id} group={group} workspace={workspace}>
              <article className={`card transport-journey${group.method === "Flight" ? " transport-journey--flight" : ""}`}>
                <div className="transport-journey-head">
                  <div className="transport-time">
                    <Clock size={16} />
                    <FlightTime group={group} />
                    <span>
                      {group.direction === "Arrivals" ? "Arrival" : "Departure"}
                    </span>
                  </div>
                  <div className="transport-service">
                    {group.method === "Flight" ? <AirlineLabel flight={group.flight} airport={group.airport} /> : <><span className="eyebrow">
                      {group.method} ·{" "}
                      {group.airport || "Location needed"}
                    </span><h3>{group.method} journey</h3></>}
                    {group.guests.length > 1 && <span className="transport-guest-count">{group.guests.length} guests</span>}
                  </div>
                  <span
                    className={`transport-status ${group.plan.driver && group.plan.vehicle ? "assigned" : ""}`}
                  >
                    {group.plan.driver && group.plan.vehicle
                      ? "Assigned"
                      : "Unassigned"}
                  </span>
                </div>
                <div className="transport-journey-content">
                <button className="transport-collapse" aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.flight || group.method} ${group.direction} ${group.day || "date needed"}`} disabled={!workspace.connected || !!displaySaving} onClick={() => toggleTrip(group, collapsed)}>
                  <span>{collapsed ? group.guests.map(guest => guest.name).join(", ") : "Trip details"}</span><ChevronDown size={18} /><small>{displaySaving === group.id ? "Saving…" : collapsed ? "Expand" : "Collapse"}</small>
                </button>
                {!collapsed && group.timeMismatch && (
                  <p className="transport-review">
                    Guests have different recorded times for this service.
                    Verify their travel details.
                  </p>
                )}
                {!collapsed && <div className="transport-journey-body">
                  <div>
                    <ul className="transport-guest-names">
                      {group.guests.map((guest) => (
                        <li key={guest.id}>
                          <strong>{guest.name}</strong>{" "}
                          {guest.city && <small>({guest.city})</small>}{" "}
                          {guest.phone && (
                            <a
                              href={`tel:${guest.phone.replace(/[\s().-]/g, "")}`}
                              aria-label={`Call ${guest.name} at ${guest.phone}`}
                            >
                              {guest.phone}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                    {group.method === "Flight" && group.flight && <FlightStatus group={group} />}
                  </div>
                  <div className="transport-plan">
                    {[
                      {
                        field: "driver",
                        label: "Sevak driver",
                        options: workspace.transport.drivers,
                      },
                      {
                        field: "vehicle",
                        label: "Vehicle",
                        options: workspace.transport.vehicles,
                      },
                    ].map(({ field, label, options }) => (
                      <label className="field" key={field}>
                        {label}
                        {readOnly ? <span className="transport-read-value">{group.plan[field] || "Not assigned"}</span> : <select
                          aria-label={`${label} for ${group.flight || group.method} ${group.direction} ${group.day}`}
                          value={
                            inlineDraft?.id === group.id
                              ? inlineDraft.plan[field]
                              : group.plan[field]
                          }
                          disabled={
                            !workspace.connected ||
                            workspace.saving ||
                            !group.day ||
                            group.guests.some((guest) => !guest.sourceWritable)
                          }
                          onChange={(event) =>
                            saveInline(group, field, event.target.value)
                          }
                        >
                          <option value="">Not assigned</option>
                          {[
                            ...new Set([
                              ...options,
                              ...(group.plan[field] ? [group.plan[field]] : []),
                            ]),
                          ].map((name) => (
                            <option key={name}>{name}</option>
                          ))}
                        </select>}
                      </label>
                    ))}
                    {saveState?.id === group.id && (
                      <small
                        role={saveState.error ? "alert" : "status"}
                        className={
                          saveState.error
                            ? "transport-save-error"
                            : "transport-save-status"
                        }
                      >
                        {saveState.error || saveState.message}
                      </small>
                    )}
                    {!group.day && !readOnly && (
                      <small>
                        Add the travel date in the source sheet before
                        assigning.
                      </small>
                    )}
                  </div>
                </div>}
                </div>
              </article>
              </LiveFlightProvider>
            ); })}
        </section>
      ); })}
      {resources && !readOnly && (
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
