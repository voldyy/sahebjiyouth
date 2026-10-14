// Presentation cutoffs always use the mandir's clock, not the visitor's zone.
const HOUR = 60 * 60 * 1000;
const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const parts = instant => Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
const dayOf = p => `${p.year}-${p.month}-${p.day}`;
const shiftDay = (day, amount) => new Date(Date.parse(`${day}T12:00:00Z`) + amount * 24 * HOUR).toISOString().slice(0, 10);

export function allentownInstant(day, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || "")) return null;
  const wall = Date.parse(`${day}T${time}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 10) !== day) return null;
  // Probe either side of a DST transition. If a clock time occurs twice,
  // choose its later occurrence so a trip is never collapsed an hour early.
  const candidates = [-24, 0, 24].map(hours => {
    const probe = wall + hours * HOUR, p = parts(probe);
    const offset = Date.parse(`${dayOf(p)}T${p.hour}:${p.minute}:00Z`) - probe;
    return wall - offset;
  }).filter(instant => {
    const p = parts(instant);
    return dayOf(p) === day && `${p.hour}:${p.minute}` === time;
  });
  return candidates.length ? Math.max(...candidates) : null;
}

export const dayDisplayId = day => JSON.stringify(["Day", day]);
export function dayCollapseAt(day, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) return null;
  const p = parts(now), today = dayOf(p);
  const morning = Number(p.hour) >= 8 ? today : shiftDay(today, -1);
  return day < morning ? allentownInstant(morning, "08:00") : null;
}
export function tripCollapseAt(group) {
  if (group.timeKnown === false) return null;
  const instant = allentownInstant(group.day, group.latestTime || group.time);
  return instant === null ? null : instant + 6 * HOUR;
}
export function displayChangedAt(revision) {
  const stamp = String(revision || "").split("|")[0];
  return /^\d{4}-\d{2}-\d{2}T/.test(stamp) && Number.isFinite(Date.parse(stamp)) ? stamp : "";
}
function collapsedAt(id, display, cutoff, now, fallback = false) {
  const saved = display.find(entry => entry.id === id);
  if (cutoff !== null && Number(now) >= cutoff) {
    // A saved expansion before the cutoff expires when that cutoff is reached.
    // A deliberate reopening afterward remains shared until the next cutoff.
    const changedAt = Date.parse(saved?.updatedAt || displayChangedAt(saved?.revision));
    if (!saved || !Number.isFinite(changedAt) || changedAt < cutoff) return true;
  }
  return saved ? saved.collapsed : fallback;
}
export function dayCollapsed(day, display, now = Date.now()) {
  return collapsedAt(dayDisplayId(day), display, dayCollapseAt(day, now), now);
}
export function tripCollapsed(group, display, now = Date.now()) {
  const cutoffs = [tripCollapseAt(group), dayCollapseAt(group.day, now)].filter(value => value !== null && value <= Number(now));
  return collapsedAt(group.id, display, cutoffs.length ? Math.max(...cutoffs) : null, now, group.plan?.status === "Completed");
}
