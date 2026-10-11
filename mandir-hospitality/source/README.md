# Mandir Hospitality

A responsive hospitality website built from the provided Stitch designs. The four connected workspaces cover guest registrations and check-in, transport dispatch, accommodation and housekeeping, and Mahaprasad planning.

## Run locally

```sh
npm install
npm run dev
```

Open the URL printed by Vite. To test on a phone connected to the same Wi-Fi, open the printed Network URL.

```sh
npm run build
npm run preview
```

The production build is generated in `dist/` for `https://sahebjiyouth.org/mandir-hospitality/`. `npm run preview` serves it at `/mandir-hospitality/`; development remains at `/`. Navigation uses URL hashes, so hosting does not require route rewrites.

The website repository is `voldyy/sahebjiyouth`. Its `mandir-hospitality/` directory contains the compiled static release, and `mandir-hospitality/source/` contains the editable application. Build from that source directory with `npm ci && npm run build`, then publish the contents of `dist/` to the parent `mandir-hospitality/` directory. GitHub Pages publishes the repository root from `main` at `https://www.sahebjiyouth.org/mandir-hospitality/`. The Azure registration workflow is separate.

Production embeds two locally bundled WOFF2 variable fonts in the stylesheet. No external font service or server-side runtime is required. The web manifest uses relative URLs and is scoped to this subdirectory.

## What works

- Search, status/stay/date filters, sorting, CSV export, and guest registration/editing.
- Guest check-in and checkout, with onsite checkout creating housekeeping tasks.
- Driver assignment with vehicle-capacity checks, dispatch, completion, and new journeys.
- Onsite and offsite room assignments with capacity validation, bed availability, room release, and linen preparation.
- Breakfast/lunch/dinner forecasts based on guest arrival times and stay dates, with editable volunteer/walk-in estimates and preparation buffers saved independently for each day.
- Swipeable planning dates, previous/next day navigation, a Today shortcut, calendar selection, and date-specific plan exports. Future dates start with no additional volunteer/walk-in estimates until entered.
- Guest activity, browser persistence, guest backup download, keyboard-accessible dialogs, reduced-motion support, and mobile bottom navigation.

Mobile screens use compact summaries and readable cards, 44px primary touch targets, 16px form controls, safe-area spacing, and native date/time inputs. Fonts are served locally. Secondary workspaces load on demand.

## Data and production integration

The default workspace reads the guest roster from Google Sheets document `1YvVz4DyPZYTYtKC9qiDlEXsPd7Xz4DPNJIoe3NBkYMA`, tab `gid=0`. Each attendee row is one person, not a party headcount. Arrival/departure, airport needs, dietary notes and current lodging come from the sheet. Blank accommodation answers are treated as pending, not as a definite day visitor. Check-in/check-out is not recorded in this sheet and is not inferred from RSVP status. Attendees missing arrival or departure dates are excluded from date-specific kitchen forecasts with an explicit warning.

Assignments use **AD = lodging location**, **AE = room number**, and **AF = custom room code**. Choose Samarpan, Comfort Inn, or Hawthorn and enter both identifiers in Accommodation. Identifiers are written as literal text, preserving leading zeroes. All other cells are read-only. Assignment saves re-read the source, match registration ID + attendee name + relationship, reject removed/ambiguous identities and changed lodging, update only that row's AD–AF range, and read back to confirm the values. Assignment edits and clearing use the same path. No real guest data is embedded in the static build or automatically cached in localStorage.

### Shared assignment editing (no Google sign-in)

The live dashboard uses a dedicated Google Apps Script web app that executes as the owner. Visitors do not need a Google account. The endpoint is deliberately public: anyone who can access the dashboard can change room and transport assignments. The server fixes the spreadsheet ID, limits supported actions, validates inputs, checks stale edits, and serializes dashboard saves with a script lock. Direct edits and sorting in the sheet bypass this lock; avoid rearranging source rows during active saves.

Samarpan has rooms 204–207 (4 beds each), then room 100 (7 beds), and 101–104 (12 beds each): 71 beds total. Assignments use AD–AF only. Codes are generated as `S{room}B{bed}`. Hotel room identifiers remain manual and are stored as literal text. Occupancy includes check-in and excludes checkout. A booking covers the guest's whole stay; the backend rechecks fresh dates and conflicts before writing. The six weekly calendars run October 11 through November 21, 2026.

Airport Trips combines arrivals and departures in one compact chronological list: guests are grouped by flight, airport, date, and direction, with shared driver/vehicle lists, guest names with city/state and tappable phone numbers, search and filters. Select a driver and use **Copy driver link**, or append `#transport?driver=Driver+Name` to the website URL. Driver links support spaces, special characters, case-insensitive matching, and reopening after refresh. These links filter the shared dashboard; they do not change editing permissions. Unknown flights stay separated by registration. Suggested mandir departures start three hours before the first consecutive flight sharing a driver, vehicle, airport and date. Admins can set a pickup time and mark journeys Planned, Dispatched or Completed. These times are planning suggestions, not routing estimates.

The backend creates three dedicated tabs without changing the registration workflow:

- `Transport Assignments`: service and guest details, driver, vehicle, pickup time, status, notes, revision and request ID.
- `Transport Resources`: active and archived driver/vehicle names. Resources assigned to unfinished journeys cannot be archived.
- `Assignment History`: request ID, timestamp and before/after values. Since users are anonymous, this records changes rather than verified editor identities.

The browser receives a confirmed fresh snapshot after each save, refreshes every minute while visible, and refreshes when returning to the tab. Assignment data stays in memory. Separate devices share the same sheet. Failed saves remain visible and are never retried automatically. Request IDs prevent duplicate processing of the same request.

#### Backend setup and release

1. Run `node scripts/build-apps-script.mjs` to bundle shared validation and server code into `apps-script/Code.gs`.
2. Save it in a **separate** Apps Script project. The existing registration project must remain intact.
3. Deploy as a Web app: **Execute as Me**, **Who has access: Anyone**. The owner must authorize Google Sheets access. The flight lookup also needs permission for external requests.
4. Set the public deployment URL as `VITE_APPS_SCRIPT_URL` and build the website. It must end in `/exec`.
5. For future backend changes, edit the existing deployment and select a new version to preserve the URL.

The website remains on GitHub Pages. A hidden Apps Script HTML frame uses `google.script.run`, with a source/origin-checked, random `postMessage` channel to the website. This avoids unconfirmed `no-cors` saves and keeps Google authorization out of visitors' browsers. The allowed parent origins are listed in `apps-script/server.js`; they are a browser bridge restriction, not an authentication boundary for this deliberately public backend.

FlightStats lookups run only on the flight day, with a five-minute server cache and manual refresh. Keep `FLIGHTSTATS_APP_ID` and `FLIGHTSTATS_APP_KEY` in Apps Script **Script properties**, never in source or browser configuration. The UI reports provider failures and offers an external flight tracker instead of inventing live status. No guest names or contact details are sent to FlightStats.

Kitchen adjustments remain local to each device. Attendee creation and edits outside lodging must still happen in the source sheet. CSV/JSON exports may contain guest contact information and should be handled privately.

Set `VITE_DEMO_MODE=true` to run the original sample-data workspace with its sample room inventory, device-local check-in and housekeeping. Demo and live dispatch/kitchen data use separate storage keys. Do not use the demo as the system of record for real guest data.

The original Stitch HTML, PNGs, and design document are preserved in their existing folders.

## Verification

```sh
npx playwright install chromium webkit
npm test
node --test tests/unit/*.test.js
npx playwright test --config playwright.sheets.config.js
```

Playwright exercises mobile navigation, responsive widths, registration, persistence, check-in, checkout-to-housekeeping, onsite/offsite assignment, dispatch, and kitchen day planning on Chromium and WebKit. Kitchen checks cover future dates, year boundaries, day visitors, arrival/departure cutoffs and isolated per-day adjustments. It starts a local server automatically if needed.

The Sheets tests execute the bundled Apps Script backend against synthetic sheets and connect it to mocked browser frames. They exercise anonymous room saves and shared transport updates across independent browser contexts. They never modify real guest records. Verify the deployed bridge and a reversible resource save before publishing a backend release.
