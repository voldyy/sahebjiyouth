import { attendeeKey } from "../src/lib/sheets.js";
import { TABLES } from "./workspace-engine.js";

export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const rowKey = (table, row) => table === "Attendees" ? attendeeKey(row) : table === "Transport Resources" ? JSON.stringify([row[0], row[1]?.toLowerCase()]) : row[0];

// Store field patches, not row numbers: sorting the sheet cannot redirect a save.
export function changesBetween(before, after) {
  const changes = [];
  for (const [table, rows] of Object.entries(after)) {
    const oldRows = before[table] || [TABLES[table]];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (same(row, oldRows[i])) continue;
      const key = rowKey(table, row);
      const matches = oldRows.slice(1).filter(r => rowKey(table, r) === key);
      if (matches.length > 1) throw new Error("Duplicate records need review before saving.");
      const previous = matches[0] || null;
      if (same(row, previous)) continue;
      const columns = row.map((value, col) => value !== (previous?.[col] ?? "") ? col : -1).filter(col => col >= 0);
      if (!previous || columns.length) changes.push({ table, key, before: previous, after: row, columns });
    }
  }
  return changes;
}

// Used after a network round trip: incoming sheet data must not erase newer
// database writes committed while the synchronization request was in flight.
export function overlayChanges(tables, changes, checkConflicts = false) {
  const next = JSON.parse(JSON.stringify(tables));
  for (const change of changes) {
    const { table, key, before, after, columns } = change;
    const rows = next[table] ||= [TABLES[table]];
    const matches = rows.map((r, i) => ({ r, i })).filter(x => x.i && rowKey(table, x.r) === key);
    if (matches.length > 1) throw new Error(`Duplicate records in ${table}.`);
    if (!matches.length) {
      if (before) throw new Error(`A record awaiting synchronization was removed from ${table}.`);
      rows.push([...after]);
      continue;
    }
    const current = matches[0].r;
    if (!before && checkConflicts && !same(current.slice(0, after.length), after)) throw new Error(`A new record conflicts with an existing ${table} record.`);
    for (const col of columns) {
      if (checkConflicts && current[col] !== (before?.[col] ?? "") && current[col] !== after[col]) throw new Error(`A direct edit in ${table} conflicts with a saved dashboard change. Review synchronization.`);
      current[col] = after[col];
    }
  }
  return next;
}
