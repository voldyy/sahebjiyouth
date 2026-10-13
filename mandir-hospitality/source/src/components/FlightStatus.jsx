import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ExternalLink, Plane, PlaneLanding, RefreshCw } from "lucide-react";
import { flightAwareUrl } from "../lib/airlines";
import { allentownDay } from "../lib/housekeeping";
import { airportTimeLabel, flightPresentation } from "../lib/flightStatus";

const LiveFlightContext = createContext({ flight: null, status: null, loading: false, travelDay: false });
const rosterTime = (value) => value ? new Date(`2000-01-01T${value}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Time needed";

// The header time and status badge share one lookup and update together.
export function LiveFlightProvider({ group, workspace, children }) {
  const [flight, setFlight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [travelDay, setTravelDay] = useState(() => group.day === allentownDay());
  const request = useRef(workspace.flightStatus);
  request.current = workspace.flightStatus;

  const pending = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setFlight(null);
    setLoading(false);
    setTravelDay(group.day === allentownDay());
    return () => { generation.current++; };
  }, [group.id, group.day, group.method, group.flight]);
  const check = async () => {
    if (pending.current || group.method !== "Flight" || !group.flight) return;
    const isTravelDay = group.day === allentownDay();
    setTravelDay(isTravelDay);
    if (!isTravelDay) return;
    pending.current = true;
    const version = generation.current;
    setLoading(true);
    try {
      const response = await request.current(group);
      if (version === generation.current) setFlight(response.flight);
    } catch (error) {
      if (version === generation.current) setFlight({ available: false, reason: error.message });
    } finally {
      pending.current = false;
      if (version === generation.current) setLoading(false);
    }
  };

  const status = travelDay ? flightPresentation(flight) : null;
  return <LiveFlightContext.Provider value={{ flight, status, loading, travelDay, check }}>{children}</LiveFlightContext.Provider>;
}

export function FlightTime({ group }) {
  const { flight, status, travelDay } = useContext(LiveFlightContext);
  if (!travelDay || !flight?.available || !status || status.tone === "unknown") return <strong>{rosterTime(group.time)}</strong>;
  const scheduled = flight.scheduled || (group.day && group.time ? `${group.day}T${group.time}` : "");
  const scheduledLabel = airportTimeLabel(scheduled, scheduled.slice(0, 10) !== group.day);
  const latestLabel = airportTimeLabel(flight.estimated, false);
  const changedDay = latestLabel && flight.estimated.slice(0, 10) !== group.day;
  const canceled = status.label === "Canceled";
  const diverted = status.label === "Diverted";
  return <div className={`flight-time-live flight-time-live--${status.tone}`} aria-live="polite" aria-atomic="true">
    {scheduledLabel && <span className="flight-time-scheduled">Scheduled <s>{scheduledLabel}</s></span>}
    <strong className="flight-time-latest">{canceled ? "Canceled" : diverted ? "ETA pending" : latestLabel || "ETA pending"}</strong>
    {!canceled && !diverted && changedDay && <span className="flight-time-caption">{airportTimeLabel(flight.estimated).split(",")[0]}</span>}
  </div>;
}

export default function FlightStatus({ group }) {
  const { flight, status, loading, travelDay, check } = useContext(LiveFlightContext);
  const PhaseIcon = status?.phase === "Landed" ? PlaneLanding : Plane;
  return <div className="transport-flight-status">
    <div className={`flight-glance flight-glance--${status?.tone || "unknown"}`} aria-live="polite" aria-atomic="true">
      <div className="flight-glance-heading"><span className="flight-status-dot" aria-hidden="true" /><strong>Status: {status?.label || (!travelDay ? "Not available yet" : loading ? "Checking…" : "Unavailable")}</strong></div>
      {status?.phase && <span className="flight-phase"><PhaseIcon size={14} />{status.phase}</span>}
    </div>
    {!status && <small>{!travelDay ? "Live status is available on the travel day." : flight?.reason || "Check flight status when you need an update."}</small>}
    <button type="button" className="button secondary" onClick={check} disabled={loading}><RefreshCw size={14} />{loading ? "Checking…" : "Check flight status"}</button>
    <a href={flightAwareUrl(group.flight)} target="_blank" rel="noreferrer">Flight tracker <ExternalLink size={12} /></a>
  </div>;
}
