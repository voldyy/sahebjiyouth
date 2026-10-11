import { useEffect, useRef, useState } from "react";
import { ExternalLink, Plane, PlaneLanding } from "lucide-react";
import { flightAwareUrl } from "../lib/airlines";
import { allentownDay } from "../lib/housekeeping";
import { airportTimeLabel, flightPresentation } from "../lib/flightStatus";

const REFRESH_MS = 5 * 60 * 1000;

export default function FlightStatus({ group, workspace }) {
  const [flight, setFlight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [travelDay, setTravelDay] = useState(() => group.day === allentownDay());
  const request = useRef(workspace.flightStatus);
  request.current = workspace.flightStatus;

  useEffect(() => {
    let disposed = false, pending = false, lastAttempt = 0;
    setFlight(null);
    setLoading(false);
    const check = async () => {
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
    // A minute tick also notices midnight and resumes due updates after sleep.
    const timer = setInterval(check, 60 * 1000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [group.id, group.day]);

  const status = travelDay ? flightPresentation(flight) : null;
  const updatedTime = status?.delayed ? airportTimeLabel(flight?.estimated) : "";
  const PhaseIcon = status?.phase === "Landed" ? PlaneLanding : Plane;
  return <div className="transport-flight-status">
    <div className={`flight-glance flight-glance--${status?.tone || "unknown"}`} aria-live="polite" aria-atomic="true">
      <div className="flight-glance-heading"><span className="flight-status-dot" aria-hidden="true" /><strong>Status: {status?.label || (!travelDay ? "Not available yet" : loading ? "Checking…" : "Unavailable")}</strong></div>
      {status?.phase && <span className="flight-phase"><PhaseIcon size={14} />{status.phase}</span>}
      {status?.delayed && <span className="flight-updated-time">{updatedTime ? `Updated ${group.direction === "Arrivals" ? "arrival" : "departure"}: ${updatedTime}` : "Updated time not yet available"}</span>}
    </div>
    {!status && <small>{!travelDay ? "Live status is available on the travel day." : flight?.reason || "Checking the latest flight details…"}</small>}
    <a href={flightAwareUrl(group.flight)} target="_blank" rel="noreferrer">Flight tracker <ExternalLink size={12} /></a>
  </div>;
}
