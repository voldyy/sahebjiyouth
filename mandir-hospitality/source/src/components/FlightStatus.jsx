import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ExternalLink, Plane, PlaneLanding } from "lucide-react";
import { flightAwareUrl } from "../lib/airlines";
import { allentownDay } from "../lib/housekeeping";
import { airportTimeLabel, flightPresentation } from "../lib/flightStatus";

const REFRESH_MS = 5 * 60 * 1000;
const LiveFlightContext = createContext({ flight: null, status: null, loading: false, travelDay: false });
const rosterTime = (value) => value ? new Date(`2000-01-01T${value}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Time needed";

// The header time and status badge share one lookup and update together.
export function LiveFlightProvider({ group, workspace, children }) {
  const [flight, setFlight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [travelDay, setTravelDay] = useState(() => group.day === allentownDay());
  const request = useRef(workspace.flightStatus);
  request.current = workspace.flightStatus;

  useEffect(() => {
    let disposed = false, pending = false, lastAttempt = 0;
    setFlight(null);
    setLoading(false);
    if (group.method !== "Flight" || !group.flight) return;
    const check = async () => {
      if (disposed) return;
      const isTravelDay = group.day === allentownDay();
      setTravelDay(isTravelDay);
      if (!isTravelDay) { setFlight(null); return; }
      if (document.hidden || pending || Date.now() - lastAttempt < REFRESH_MS) return;
      pending = true;
      lastAttempt = Date.now();
      setLoading(true);
      try {
        const response = await request.current(group);
        if (!disposed) setFlight(response.flight);
      } catch (error) {
        if (!disposed) setFlight({ available: false, reason: error.message });
      } finally {
        pending = false;
        if (!disposed) setLoading(false);
      }
    };
    check();
    const timer = setInterval(check, 60 * 1000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [group.id, group.day, group.method, group.flight]);

  const status = travelDay ? flightPresentation(flight) : null;
  return <LiveFlightContext.Provider value={{ flight, status, loading, travelDay }}>{children}</LiveFlightContext.Provider>;
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
  const { flight, status, loading, travelDay } = useContext(LiveFlightContext);
  const PhaseIcon = status?.phase === "Landed" ? PlaneLanding : Plane;
  return <div className="transport-flight-status">
    <div className={`flight-glance flight-glance--${status?.tone || "unknown"}`} aria-live="polite" aria-atomic="true">
      <div className="flight-glance-heading"><span className="flight-status-dot" aria-hidden="true" /><strong>Status: {status?.label || (!travelDay ? "Not available yet" : loading ? "Checking…" : "Unavailable")}</strong></div>
      {status?.phase && <span className="flight-phase"><PhaseIcon size={14} />{status.phase}</span>}
    </div>
    {!status && <small>{!travelDay ? "Live status is available on the travel day." : flight?.reason || "Checking the latest flight details…"}</small>}
    <a href={flightAwareUrl(group.flight)} target="_blank" rel="noreferrer">Flight tracker <ExternalLink size={12} /></a>
  </div>;
}
