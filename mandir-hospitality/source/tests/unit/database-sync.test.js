import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createHarness } from "../helpers/apps-script-harness.js";
import { changesBetween } from "../../shared/workspace-sync.js";

function fixture() {
  const header = Array(32).fill(""); Object.assign(header, { 0: "Registration ID", 8: "Attendee Full Name", 29: "Lodging", 30: "Room No.", 31: "Room Code" });
  const row = Array(32).fill(""); Object.assign(row, { 0: "SYNTHETIC-A", 8: "Synthetic Guest", 9: "Self", 12: "2026-10-18", 13: "2026-10-20", 20: "YES" });
  const h = createHarness([header, row]);
  h.properties.set("DATABASE_SYNC_KEY", "test-sync-key");
  const stream = randomUUID();
  return { h, exchange: jobs => h.post({ action: "database-sync", syncKey: "test-sync-key", stream, jobs }) };
}
test("protected Sheet synchronization preserves unrelated fields and confirms only one application of a retry", () => {
  const { h, exchange } = fixture();
  const initial = exchange([]);
  assert.equal(initial.ok, true, initial.error);
  assert.match(initial.adminDigest, /^[a-f0-9]{64}$/);
  const after = structuredClone(initial.tables);
  after.Attendees[1].splice(29, 3, "Comfort Inn", "001", "001-B1");
  const changes = changesBetween(initial.tables, after);
  h.rows[1][7] = "New city";
  const saved = exchange([{ seq: 1, changes }]);
  assert.equal(saved.ok, true, saved.error);
  assert.equal(saved.ack, 1);
  assert.equal(h.rows[1][7], "New city");
  assert.equal(h.rows[1][30], "001");
  const writes = h.writes.length;
  assert.equal(exchange([{ seq: 1, changes }]).ok, true);
  assert.equal(h.writes.length, writes);
});
test("sync rejects unauthorized callers, changed streams and registration edits", () => {
  const { h, exchange } = fixture();
  assert.equal(h.post({ action: "database-sync", syncKey: "bad", jobs: [] }).ok, false);
  const initial = exchange([]);
  assert.equal(h.post({ action: "database-sync", syncKey: "test-sync-key", stream: randomUUID(), jobs: [] }).ok, false);
  const after = structuredClone(initial.tables); after.Attendees[1][8] = "Changed name";
  // Matching the original identity cannot be used to smuggle registration edits.
  const c = { table: "Attendees", key: JSON.stringify(["SYNTHETIC-A", "Synthetic Guest", "Self"]), before: initial.tables.Attendees[1], after: after.Attendees[1], columns: [8] };
  const denied = exchange([{ seq: 1, changes: [c] }]);
  assert.equal(denied.ok, false); assert.match(denied.error, /read-only/);
});
test("a direct edit conflict retains the batch and does not acknowledge or overwrite it", () => {
  const { h, exchange } = fixture();
  const initial = exchange([]);
  const after = structuredClone(initial.tables); after.Attendees[1].splice(29, 3, "Samarpan", "204", "S204B1");
  const changes = changesBetween(initial.tables, after);
  h.rows[1][29] = "Comfort Inn";
  const result = exchange([{ seq: 1, changes }]);
  assert.equal(result.ok, false); assert.match(result.error, /conflict/);
  assert.equal(h.rows[1][29], "Comfort Inn");
  assert.equal(h.properties.get("DATABASE_SYNC_ACK"), undefined);
});
