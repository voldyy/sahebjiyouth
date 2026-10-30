// Cloudflare stops retrying an alarm whose handler keeps failing, yet still reports it as set, so an alarm this far
// overdue will never run. On October 29, 2026 a day of blocked Durable Object reads left the synchronization alarm in
// that state, and the Sheet stopped synchronizing until the alarm was replaced.
export const STALE_ALARM_MS = 5 * 60_000;

/** Whether to set the alarm for `due`: none is set, `due` is sooner, or the current one was abandoned. */
export const shouldSetAlarm = (existing, due, now = Date.now()) =>
  !existing || due < existing || existing < now - STALE_ALARM_MS;

/** Whether synchronization has stopped: no alarm is set or it was abandoned. A pending alarm is never moved. */
export const alarmStopped = (existing, now = Date.now()) => !existing || existing < now - STALE_ALARM_MS;
