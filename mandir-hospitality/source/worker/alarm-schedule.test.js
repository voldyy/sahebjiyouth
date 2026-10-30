import { expect, test } from "vitest";
import { STALE_ALARM_MS, alarmStopped, shouldSetAlarm } from "./alarm-schedule.js";

test("scheduling keeps a sooner pending alarm and replaces a missing or abandoned one", () => {
  const now = Date.UTC(2026, 9, 30, 12);
  expect(shouldSetAlarm(null, now + 1000, now)).toBe(true);
  expect(shouldSetAlarm(now + 60_000, now + 1000, now)).toBe(true);
  expect(shouldSetAlarm(now + 1000, now + 60_000, now)).toBe(false);
  // Recently overdue: Cloudflare may still be retrying it.
  expect(shouldSetAlarm(now - 30_000, now + 60_000, now)).toBe(false);
  expect(shouldSetAlarm(now - STALE_ALARM_MS - 1, now + 60_000, now)).toBe(true);
  expect(alarmStopped(null, now)).toBe(true);
  expect(alarmStopped(now + 60_000, now)).toBe(false);
  expect(alarmStopped(now - 30_000, now)).toBe(false);
  expect(alarmStopped(now - STALE_ALARM_MS - 1, now)).toBe(true);
});
