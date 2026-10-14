# SQLite workspace and Google Sheets mirror

The event's operational records are stored in a Cloudflare Durable Object using
SQLite. One event is one transaction boundary, so a move between rooms/hotels
cannot race another reservation. There is no server to administer and no new
Google sign-in for visitors. The existing private admin link still authorizes
edits; viewers retain their existing permissions.

## Data flow

1. A request validates against the current database records. Changed rows, an
   idempotency receipt/audit entry and a durable outbox job commit together.
2. The browser receives the saved state immediately, without contacting Google.
3. A persisted alarm wakes after about one second and pushes queued field patches
   to the existing owner-authorized Apps Script. Sheets' own latency still applies.
4. Apps Script resolves stable attendee/record identities, preflights the batch,
   writes only changed fields, verifies them and durably records its sequence.
   Retries cannot duplicate a guest, audit row, or assignment.
5. Every minute the same exchange imports direct Sheet changes and registrations.
   Changes committed in SQLite during a sync are overlaid onto its response.
6. Visible browsers refresh from SQLite every ten seconds. Hidden tabs stop polling.

The database and outbox remain usable if Google fails. Saved/pending/sync-error
states are distinct. A simultaneous direct edit to a field awaiting a database
write is flagged rather than silently overwritten. Resolve that field in Sheets
to the intended value shown in the dashboard; the next retry acknowledges it.
Removing or duplicating a record with pending changes also requires source review.

Registration fields in existing rows remain Sheet-owned. Existing attendee writes
touch only AD:AF; adding a walk-in appends a new row. Driver phone numbers in
column E are preserved. An import can reveal changed stay dates or other existing
data conflicts; the dashboard's normal full-stay warnings still apply.

## Migration

Keep the current Apps Script deployment URL and the separate registration project.
Do not rotate ADMIN_ACCESS_KEY or expose it in client code.

1. Deploy `worker/wrangler.jsonc` with private `SYNC_KEY`. Set the matching private
   `DATABASE_SYNC_KEY` property in **Mandir Hospitality Shared Editing**.
2. Build and replace that project's `Code.gs` using `npm run build:backend`.
   Update its existing Web app deployment, keeping owner execution and access.
3. Set its `DATABASE_API_URL` property to
   `https://mandir-hospitality-api.usayouth.workers.dev/api`. The bridge forwards
   already-open clients to the database; protected synchronization/service calls
   bypass forwarding. No public RPC can export the synchronization credential.
4. Verify the initial import, viewer/admin permissions, and an empty sync backlog.
   Set `VITE_WORKSPACE_API_URL` to the same API URL and publish the frontend.
5. Verify production reads, actual browser initial load time, and the Sheet sync
   timestamp. Do not use real guest assignments for test writes or send test messages.

Manual FlightStats requests continue through the private bridge and are never
automatically retried by the browser. Existing Azure notification schedules and
recipients are unchanged. Accommodation message previews/queues first require
all database changes to be synchronized. Kitchen overrides remain device-local.

## Verification and recovery

`npm run test:database` runs against real local Workers/SQLite with synthetic Sheet
data. `npm run test:unit` includes the protected Apps Script exchange and shared
assignment rules. `npm run build:database` performs a Wrangler deployment dry run.

SQLite `records` holds current rows, `receipts` preserves accepted request IDs and
audit patches, and `outbox` retains unacknowledged work. The stream ID and Sheet
acknowledgment prevent replaying a restored or unrelated database into the sheet.
Cloudflare SQLite backups/point-in-time recovery are available according to the
account plan. A restore must be reconciled with the Sheet acknowledgment before
resuming writes; do not manually reset its sequence to suppress an error.

For rollback, first stop new dashboard writes and drain/reconcile the outbox.
Only then remove `DATABASE_API_URL` and publish the legacy client configuration.
Changing the frontend alone is insufficient: old clients intentionally forward to
the database after cutover. Never discard a database with unsynchronized records.

Secrets belong in Cloudflare secret bindings and Apps Script properties. Do not
commit `.dev.vars`, private setup files, admin URLs, exported guest data, or logs
containing record values. Worker logs contain aggregate sync events only.
