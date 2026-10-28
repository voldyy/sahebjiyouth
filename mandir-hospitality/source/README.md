# Mandir Hospitality

Transport and lodging WhatsApp notifications run in the existing Azure backend. Accommodations includes an admin-only **Send room details** preview/send action, with one message per attendee. See [notification setup and operations](notifications/HOSPITALITY.md).

A responsive hospitality dashboard for Allentown Shri Swaminarayan Mandirji, backed by SQLite with background Google Sheets synchronization. Admins have Main, Transport, Accommodations, and Yogi Prasad. Anyone with a dashboard link can edit shared dining lists and meal counts when shared meal editing is enabled; other assignments remain admin-only. The interface uses the supplied Anoopam Mission logo, sky blue, and soft orange.

## Development and release

```sh
npm install
npm run dev -- --port 5174
npm run build:backend
npm run test:unit
npm run test:database
npm run test:database-ui
npm run test:sheets
npm run build
```

Production is `https://www.sahebjiyouth.org/mandir-hospitality/`. Vite builds to `dist/` with that subdirectory as its base. Development serves `/`; preview serves `/mandir-hospitality/`. Hash navigation works on static GitHub Pages hosting.

Publish editable source to `voldyy/sahebjiyouth`, `mandir-hospitality/source/`, and `dist/` contents to `mandir-hospitality/`. Preserve older hashed assets for existing tabs. Never publish `.env.local`, admin links, private credentials, guest exports, browser traces, or the old reference export. The registration application and its separate Apps Script project are unrelated to this dashboard's deployment.

## Access

The shareable team link is `https://www.sahebjiyouth.org/mandir-hospitality/#kitchen?team=yogi-prasad`. An admin can copy it from Workspace settings. It starts on Yogi Prasad, but the special team parameter is not required to add, remove or restore diners: ordinary dashboard links have the same meal-only editing access. Admins can disable shared meal editing in Meal settings. Main, Transport and Accommodations stay view-only on the team link, including when opened in an existing admin tab. The team flag persists across navigation and driver filters. Search, filters, dates, guest/stay details, and flight lookups remain available. A forged role or hash cannot authorize assignment writes.

Full access uses a private link with an `admin` parameter in the URL fragment. The key is generated on the backend and stored in the Apps Script property `ADMIN_ACCESS_KEY`; its digest is synchronized to SQLite for authorization. The frontend consumes it into this tab's session storage and removes it from the address bar. It is never bundled in source or production assets. Possession grants admin access, so share this link only with admins. Rotating the script property invalidates old links after the next synchronization. No Google sign-in is required for dashboard users.

The backend checks the key on every lodging, transport, resource, offsite, and linen write. Viewer snapshots return the normalized guest display records, transport assignments, room inventory, and housekeeping needed by all four tabs, without the raw source rows. Viewer snapshots do not create or update sheet records; due linen tasks can be derived in memory. Snapshot and flight lookup are permitted read actions. Source-sheet link sharing must remain **Viewer**, with named editors retained. Anonymous source-sheet editing would bypass dashboard restrictions.

Yogi Prasad dining-list overrides, numeric adjustments, preparation buffers and family questionnaire responses are shared SQLite records. The red minus excludes one attendee from one meal/date; Restore returns them to automatic planning, and Add can make an explicit exception to an arrival/fasting rule. All overrides remain bounded by active stay dates. The editable dining count stores an adjustment to the computed guest count, so later roster changes still update the total. See [WhatsApp meal questions](notifications/MEAL_QUESTIONS.md).

## Source data

Registrations come from Google Sheets document `1YvVz4DyPZYTYtKC9qiDlEXsPd7Xz4DPNJIoe3NBkYMA`, attendee tab `gid=0`, and are imported into SQLite every minute. Dashboard reads and operational saves use SQLite directly. Each row is one attendee. Registration ID + attendee name + relationship identifies a row independently of sorting. Removed or duplicate identities and stale edits are rejected. Conflicting direct Sheet edits to fields with pending database writes are surfaced for review rather than silently overwritten.

Lodging uses **AD = location**, **AE = hotel/room number**, **AF = bed code**. Assignment writes preserve literal text and leading zeroes. Guest data is persisted in the backend database, kept only in memory by the browser, and never embedded in the static build. Other registration edits remain in Sheets. Explicit RSVP values `Departed` and `Checked out` are recognized; changing scheduled checkout dates is necessary for date-driven linen tracking.

Travel choices include `CAR`, `FLIGHT`, `BUS`, and `Bus (arrival)`. The last applies only to arrivals; it does not infer a bus return. Location ABE is supported for bus pickup. Bus journeys do not invoke flight lookup or display flight trackers.

## Accommodations

The top selector switches between **Samarpan**, **Sadhak**, **Offsite**, and **Housekeeping**.

Samarpan has rooms 201–202 (2 beds each), rooms 203–207 (4 beds each), 100 (7 beds), 101 (12 beds), 102 (14 beds), 103 (13 beds), and 104 (15 beds), totaling 85 beds. Generated codes are `S{room}B{bed}`. Room planning covers four Sunday–Saturday weeks from October 25 through November 21, 2026; guests whose stay ended before the week of October 25 are hidden from the Accommodations views (checkout on October 25 counts as before the week, and guests with missing dates stay visible so they can be corrected). Main, Transport and Yogi Prasad still show everyone, and bed conflicts are still checked against every stay. The unassigned list is filtered to the selected week or day; choose the guest's stay dates or use Guest list to see future arrivals. Daily view displays every room in the selected location. Weekly and daily views open to the current week/day in Allentown time, bounded by the event dates; date navigation remains available. Guest list uses compact responsive cards with unassigned guests first, without displaying registration IDs. Search and assignment editing remain available.

A small green WhatsApp/check icon next to an accommodation guest means the message for their current room was confirmed sent by Twilio. Queued, failed or old-assignment messages do not show it. The existing Azure notification claims are checked through a function-key-protected status endpoint; the Worker imports the status in the background. No notification is sent by the status check.

Sadhak has rooms 101, 102 and 202 (3 beds each), 104, 203 and 204 (2 beds each), and 201 (1 bed), totaling 16 beds across 7 rooms. Its codes use `SD{room}B{bed}` and reservations remain separate from identically numbered Samarpan rooms.

Main defaults to newest submission timestamp first (column B). ISO timestamps and Allentown-formatted Sheet timestamps are normalized together; missing timestamps follow dated entries, with later source rows first among undated entries.

Admins can use Main's Add guest button to append one attendee to Sheets. Optional details remain blank; each save uses a stable request ID to prevent duplicate rows on retry. This action does not send registration emails or assign a room.

Accommodations includes Day at a glance: a compact daily overview of all Samarpan, Sadhak and offsite beds. Tapping Empty or + opens the same unassigned-guest picker as Daily view. When a bed is already selected, a compact location summary replaces the lodging, room, bed and generated-code controls; Change reveals those controls when needed. New walk-in guest remains available inside the picker and carries over the selected bed and date. Add walk-in accepts a name, check-in, checkout, room and bed, plus optional phone. The guest and full-stay reservation are saved together after conflict checks, so a rejected assignment does not create a guest row. Main displays both arrival and departure dates; absent times stay omitted.

Transport cards and date groups share their expanded/collapsed state through Transport Display. All users may change this presentation setting; operational assignments and guest creation remain admin-only. Cards automatically collapse six elapsed hours after their recorded arrival/departure time. At 8 AM America/New_York each morning, every earlier date minimizes to a compact row with a smaller gray heading. Date-only trips use the morning rule. Earlier saved expansions expire at these cutoffs; users can reopen a trip or day afterward, shared with everyone until the next cutoff. Display revisions include the server timestamp without changing the Sheet's columns. Visible pages refresh shared presentation every five seconds; a separate local clock applies cutoffs even when a request is slow. Hidden pages resume correctly on focus. No flight-status lookups are triggered by these rules.

Offsite offers **Hawthorn**, with the same weekly, daily, and guest-list views. Admins add a provisional planning room and its planned bed count; no inventory is invented. The hotel room number is optional. Until confirmed, AE stays blank and AF uses a stable internal bed code. Editing the planning room to add its actual number updates its assigned guests' AE values while retaining bed codes and stay dates. Assigned beds cannot be removed from inventory.

Drag an unassigned guest card onto a bed row to assign their entire stay, regardless of the drop date. Feedback previews the stay and flags conflicts. Tapping a guest or empty bed opens the assignment form as an alternative for touch and keyboard use. Both frontend and backend check the entire stay using fresh dates. Check-in is inclusive and checkout exclusive. Missing dates or unknown bed codes are flagged instead of advertising affected beds as empty.

Housekeeping records linen tasks for assigned Samarpan beds when the accommodation checkout date arrives in **America/New_York**. Accommodation dates take precedence, with arrival/departure fallback. This uses scheduled dates, not physical checkout detection. Correct an early departure or extension in the source sheet. Each checkout has its own record. Outstanding tasks survive clearing or moving the lodging assignment; a corrected stay supersedes its old pending scheduled checkout. **Linens refreshed** records completion in the sheet, survives reloads, and rejects stale checkout lists. The next guest's checkout creates a new task.

## Transport and Yogi Prasad

Airport Trips combines arrivals and departures chronologically. Groups use direction, date, airport and flight/service. Unknown services remain separated by registration. Names include supplied city/state and phone links. Flight prefixes display the carrier name and a small locally bundled airline logo; unknown prefixes use a neutral fallback. IATA and common ICAO prefixes are supported, and bus labels remain unchanged. Inline driver/vehicle selectors save on selection. Driver URLs such as `#transport?driver=Driver+Name` filter the admin view and still require admin access.

FlightStats dashboard lookups are manual through **Check flight status** on the travel day, with a short server cache shared across viewers. There is no automatic flight-status polling. Pickup notifications use at most one schedule lookup plus one status check 15 minutes after departure; failures and delays do not trigger repeated requests. Status uses scheduled versus actual/estimated times: On Time (green), Delayed (orange), Canceled (red), and Early (purple, only while in transit). Diverted remains an explicit urgent warning; In transit and Landed appear as phase indicators. For live flights, the trip header strikes through the smaller scheduled time and emphasizes the latest airport-local arrival/departure time, including Early and On Time. Missing estimates are explicitly marked ETA pending; canceled/diverted flights do not show an old estimate as a valid ETA. The header and status badge share a single lookup. Status badges use a stronger colored pulse while respecting reduced-motion preferences. The manual check control requests an update only when clicked. UTC time pairs are preferred for delay comparisons, with a fallback for older backend responses. Flight tracker links use FlightAware ICAO identifiers, for example UA308 maps to UAL308. Keep `FLIGHTSTATS_APP_ID` and `FLIGHTSTATS_APP_KEY` in private Apps Script properties. No guest data is sent to the provider.

Yogi Prasad serves breakfast 8–10 AM, lunch 12–2 PM, and dinner 6–8 PM. On arrival day, arrivals before 11 AM count for all three meals, 11 AM–before 3 PM count for lunch and dinner, and 3 PM–11:59 PM count for dinner. Guests staying from earlier days count for all meals. Undated attendees are excluded with a warning. The service card shows combined headcount and preparation target without category breakdowns, plus a compact alphabetical list of diners for the selected meal and date. Home city/state appears in smaller muted text in parentheses. This list uses the exact attendance selection used by the meal count; unnamed extra headcount is noted separately. Kitchen updates and plan export have been removed. Headcount adjustments and preparation buffers remain saved per day on the current device.

## Local mandal meals form

`local-meals-form/index.html` is a single static mobile page for the local Allentown mandal, served at **https://www.anoopam.us/diwali**. The page carries no event name, so it can be reused. A person enters their name, optional family members, and the exact days for each meal. Breakfast, lunch and dinner each have a compact card that opens into its own calendar, so lunch can be for one stretch of days and dinner for another. Days are picked on a phone-friendly calendar: tap a day, or slide a finger across days to select a stretch, so days need not be consecutive. The calendar starts in the week of the current day and ends on Nov 14 (`LAST` in the page; the Worker itself accepts days up to 120 ahead). After Nov 14 the page says registration has closed. One phone can hold several registrations (for example, family members coming on other days), each editable or cancellable from that phone. It posts to the Worker's public `local-meals-submit`, `local-meals-lookup` and `local-meals-cancel` actions, which are rate limited per visitor and only answer the anoopam.us origins, with a hidden decoy field against bots. A registration lives in `meal_records` (kind `local`) and never creates a registration-sheet row.

Each person becomes a **Local** diner for each meal on that meal's chosen days (`localMealDays`, a map of meal to days, which the meal forecast checks). The Worker stores `mealDays`; older registrations stored one set of days (or a From–To range) for every chosen meal and are read as per-meal days. They appear in Yogi Prasad's counts and diner lists and in the 9 PM nightly count, and the red minus removes one person from one meal like any other diner. They do not appear in Main, Transport or Accommodations. The browser keeps an edit key (derived from the registration id with the Worker's `SYNC_KEY`, never stored) so the same phone can edit or cancel its own registration. The team has no whole-registration delete yet; a duplicate can be removed meal by meal with the red minus.

Hosting: Azure Front Door profile `anoopam-events` (resource group `email1`), route `diwali-local-meals` for `/diwali` and `/diwali/*`, custom domains `www.anoopam.us` and `anoopam.us` (the bare domain is an ALIAS record in Spaceship pointing at the Front Door endpoint), origin the storage static site `$web/diwali/`. Publish a change by uploading `index.html` (and `logo.png`) to `$web/diwali/` with `no-cache` for the page. The existing `events.anoopam.us` registration route is separate. Browser checks: `npm run test:form`.

## Shared backend

The default API is `https://mandir-hospitality-api.usayouth.workers.dev/api`. A Cloudflare Durable Object stores each event's coordinated room inventory in SQLite. Validated changes, audit receipts, and a synchronization outbox commit atomically; the browser receives the result without waiting for Google. An alarm pushes pending field patches after about one second, and imports source changes every minute. Actual Sheet visibility depends on Google's response time. Failed syncs retain the saved database state and retry. A small header indicator shows connection and pending-sync status. Updates are automatic; a compact alert and retry option appear only when a connection error needs attention. See [database operations and rollback](worker/README.md).

The existing **Mandir Hospitality Shared Editing** Apps Script project executes as the owner and serves Anyone. Update this project, not the registration project. `npm run build:backend` generates `apps-script/Code.gs`. Update the existing Web app deployment to a new version to preserve its URL; the static website release does not update Apps Script automatically.

For first-time setup, invoke the private `setupHospitality_` helper from an editor-only temporary wrapper. It creates shared tabs and generates `ADMIN_ACCESS_KEY` only if absent. The private `showAdminLink_` helper logs the admin URL in the owner's editor. Remove any temporary wrapper before deploying. Apps Script hides underscore helpers from the public RPC interface and the normal function picker. Existing deployments retain the key when code is updated. Never return the key through `hospitalityRequest`.

Shared tabs are `Transport Assignments`, `Transport Resources`, `Transport Display`, `Assignment History`, `Offsite Rooms`, and `Housekeeping`. Request IDs, transactional SQLite writes, a script lock, stale checks, literal writes and readback confirmation protect the database and its Sheet mirror. History records changes, not verified personal identities. The browser refreshes from SQLite every ten seconds while visible and on returning to the tab.

The current browser uses HTTPS directly and does not load a Google iframe. `VITE_WORKSPACE_API_URL` overrides the default API; an explicit empty value selects the legacy iframe client for rollback/testing. Already-open legacy clients are forwarded by Apps Script through `DATABASE_API_URL`. The private `DATABASE_SYNC_KEY` property must match the Worker secret `SYNC_KEY`; neither belongs in browser code. `VITE_APPS_SCRIPT_URL` only applies to the legacy client. Rollback requires reconciling pending changes before removing the forwarding property.

## Verification

Unit tests cover backend permissions, stale writes, room conflicts, provisional numbering, successive checkout/linen cycles, date corrections, Allentown day boundaries and bus travel. Sheets Playwright tests exercise Chromium and WebKit with synthetic records and a mocked backend, including real pointer drags, responsive views, persistent saves and team restrictions. They never change real guest assignments.

`VITE_DEMO_MODE=true` and `npm test` use the separate original sample-data workspace. Its registration, check-in, dispatch and housekeeping behavior is device-local and is not the live system of record.

The initial page includes a minimal loading indicator before React starts and while the first database snapshot loads. It respects reduced-motion preferences, keeps normal background refreshes unobtrusive, and displays a retry action on initial connection errors.
