// UTC pairs are preferred. Older backend responses supply two airport-local
// wall-clock times; append Z to compare them without the viewer's time zone.
function timestamp(value) {
  if (!value || typeof value !== "string") return null;
  const iso = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

export function flightPresentation(flight) {
  if (!flight?.available) return null;
  const raw = String(flight.rawStatus || flight.status || "").toLowerCase();
  const canceled = ["c", "canceled", "cancelled"].includes(raw);
  const diverted = ["d", "diverted"].includes(raw);
  const landed = flight.landed === true || ["l", "landed", "arrived"].includes(raw);
  const inTransit = !canceled && !landed && (typeof flight.inTransit === "boolean" ? flight.inTransit : ["a", "active", "in transit", "en route"].includes(raw));
  const utcScheduled = timestamp(flight.scheduledUtc), utcLatest = timestamp(flight.estimatedUtc);
  const scheduled = utcScheduled !== null && utcLatest !== null ? utcScheduled : timestamp(flight.scheduled);
  const latest = utcScheduled !== null && utcLatest !== null ? utcLatest : timestamp(flight.estimated);
  const difference = scheduled !== null && latest !== null
    ? Math.round((latest - scheduled) / 60000)
    : typeof flight.delayMinutes === "number" && Number.isFinite(flight.delayMinutes) ? flight.delayMinutes : null;
  const phase = canceled ? "" : landed ? "Landed" : inTransit ? "In transit" : "";
  if (canceled) return { label: "Canceled", tone: "canceled", phase: "", delayed: false };
  if (diverted) return { label: "Diverted", tone: "canceled", phase, delayed: false };
  if (raw === "delayed" || (difference !== null && difference > 0)) return { label: "Delayed", tone: "delayed", phase, delayed: true };
  if (inTransit && difference !== null && difference < 0) return { label: "Early", tone: "early", phase, delayed: false };
  if (["s", "scheduled", "a", "active", "l", "landed", "arrived", "on time", "in transit", "en route"].includes(raw)) return { label: "On Time", tone: "on-time", phase, delayed: false };
  return { label: "Unavailable", tone: "unknown", phase, delayed: false };
}

export function airportTimeLabel(value, includeDate = true) {
  // dateLocal is already the airport's wall clock. Do not convert it to the
  // driver's/device's time zone when formatting the updated pickup/drop-off time.
  const parsed = timestamp(value);
  return parsed === null ? "" : new Date(parsed).toLocaleString("en-US", {
    timeZone: "UTC", ...(includeDate ? { month: "short", day: "numeric" } : {}), hour: "numeric", minute: "2-digit",
  });
}
