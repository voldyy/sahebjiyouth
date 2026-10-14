import { SPREADSHEET_ID } from "../src/lib/sheets.js";
import { TABLES } from "../shared/workspace-engine.js";
import { overlayChanges, rowKey, same } from "../shared/workspace-sync.js";

export function assertSyncKey(req) {
  const key = PropertiesService.getScriptProperties().getProperty("DATABASE_SYNC_KEY");
  if (!key || typeof req.syncKey !== "string" || req.syncKey !== key) throw new Error("Invalid synchronization authorization.");
}
const literal = value => /^[=+\-@']/.test(String(value)) ? "'" + value : String(value);

export function databaseExchange(req, engine) {
  assertSyncKey(req);
  if (!Array.isArray(req.jobs) || req.jobs.length > 20 || !/^[a-zA-Z0-9-]{20,80}$/.test(req.stream || "")) throw new Error("Invalid synchronization batch.");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error("The source sheet is busy.");
  try {
    const props = PropertiesService.getScriptProperties();
    const stream = props.getProperty("DATABASE_SYNC_STREAM");
    if (stream && stream !== req.stream) throw new Error("The database synchronization stream changed. Review before reconnecting.");
    if (!stream) props.setProperty("DATABASE_SYNC_STREAM", req.stream);
    let ack = Number(props.getProperty("DATABASE_SYNC_ACK") || 0);
    const book = SpreadsheetApp.openById(SPREADSHEET_ID);
    const exportTables = () => {
      const tables = { Attendees: engine.roster(book).rows };
      for (const name of Object.keys(TABLES)) tables[name] = engine.table(book, name, true).rows;
      return tables;
    };
    let tables = exportTables();
    for (const job of req.jobs) {
      if (!Number.isSafeInteger(job.seq) || job.seq < 1 || !Array.isArray(job.changes)) throw new Error("Invalid synchronization sequence.");
      if (job.seq <= ack) continue;
      if (job.seq !== ack + 1) throw new Error("A synchronization batch is missing. Retry in order.");
      for (const c of job.changes) {
        if (!(c.table === "Attendees" || TABLES[c.table]) || !Array.isArray(c.after) || !Array.isArray(c.columns) || c.columns.some(col => !Number.isInteger(col) || col < 0 || col >= c.after.length)) throw new Error("Invalid field patch.");
        // Existing registration data is Sheet-owned. The database may append
        // admin-created guests; existing attendee writes are lodging only.
        if (c.table === "Attendees" && c.before && c.columns.some(col => col < 29 || col > 31)) throw new Error("Registration fields are read-only.");
      }
      overlayChanges(tables, job.changes, true); // preflight the complete transaction
      for (const change of job.changes) {
        const { table, key, after, columns } = change;
        const sheet = table === "Attendees" ? engine.roster(book).sheet : engine.table(book, table).sheet;
        const currentRows = table === "Attendees" ? engine.roster(book).rows : engine.table(book, table).rows;
        const index = currentRows.findIndex((row, i) => i > 0 && rowKey(table, row) === key);
        if (index < 0) sheet.getRange(sheet.getLastRow() + 1, 1, 1, after.length).setNumberFormat("@").setValues([after.map(literal)]);
        else {
          // Only changed fields are written; e.g. preserve driver phone column E.
          const pending = columns.filter(col => currentRows[index][col] !== after[col]);
          while (pending.length) {
            const start = pending.shift();
            let end = start;
            while (pending[0] === end + 1) end = pending.shift();
            sheet.getRange(index + 1, start + 1, 1, end - start + 1).setNumberFormat("@").setValues([after.slice(start, end + 1).map(literal)]);
          }
        }
      }
      SpreadsheetApp.flush();
      tables = exportTables();
      for (const c of job.changes) {
        const rows = tables[c.table].slice(1).filter(row => rowKey(c.table, row) === c.key);
        if (rows.length !== 1 || c.columns.some(col => rows[0][col] !== c.after[col]) || (!c.before && !same(rows[0].slice(0, c.after.length), c.after))) throw new Error("Sheet synchronization could not be confirmed. The batch will retry safely.");
      }
      ack = job.seq;
      props.setProperty("DATABASE_SYNC_ACK", String(ack));
    }
    // The audit log grows independently; do not download it with every roster.
    tables["Assignment History"] = [TABLES["Assignment History"]];
    const adminKey = props.getProperty("ADMIN_ACCESS_KEY");
    if (!adminKey) throw new Error("Admin access is not configured.");
    const adminDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, adminKey, Utilities.Charset.UTF_8).map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, "0")).join("");
    return { ok: true, tables, ack, adminDigest };
  } finally { lock.releaseLock(); }
}
