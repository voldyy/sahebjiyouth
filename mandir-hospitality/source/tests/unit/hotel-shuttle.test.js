import test from "node:test";
import assert from "node:assert/strict";
import { hotelShuttleNeed } from "../../src/lib/hotelShuttle.js";

const guest = (name, lodging, travelMethod, start, end, status = "Registered") => ({ name, lodging, travelMethod, accommodationIn: start, accommodationOut: end, status, stay: lodging });

test("counts active offsite flight guests by hotel for shuttle planning", () => {
  const result = hotelShuttleNeed([
    guest("Hawthorn flight", "Hawthorn", "FLIGHT", "2026-11-06", "2026-11-08"),
    guest("Hilton flight", "Hilton", "flight", "2026-11-07", "2026-11-09"),
    guest("Car guest", "Hawthorn", "CAR", "2026-11-06", "2026-11-08"),
    guest("Onsite flight", "Samarpan", "FLIGHT", "2026-11-06", "2026-11-08"),
    guest("Checked out", "Hilton", "FLIGHT", "2026-11-06", "2026-11-07"),
    guest("Cancelled", "Hilton", "FLIGHT", "2026-11-06", "2026-11-08", "Cancelled"),
  ], "2026-11-07");
  assert.equal(result.total, 2);
  assert.deepEqual(result.byHotel, { Hawthorn: 1, Hilton: 1 });
  assert.deepEqual(result.riders.map((guest) => guest.name), ["Hawthorn flight", "Hilton flight"]);
  assert.deepEqual(result.ridersByHotel.Hawthorn.map((guest) => guest.name), ["Hawthorn flight"]);
  assert.deepEqual(result.ridersByHotel.Hilton.map((guest) => guest.name), ["Hilton flight"]);
});
