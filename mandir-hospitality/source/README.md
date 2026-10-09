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

The website repository is `voldyy/sahebjiyouth`. Its `mandir-hospitality/` directory contains the compiled static release, and `mandir-hospitality/source/` contains the editable application. Build from that source directory with `npm ci && npm run build`, then publish the contents of `dist/` to the parent `mandir-hospitality/` directory. The existing registration deployment workflow does not publish this directory; uploading the release to the live website requires a separate hosting deployment.

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

### Enable authorized assignment writes

1. In Google Cloud, enable **Google Sheets API** and configure the OAuth consent screen. If the consent app is in Testing, add the staff Google accounts as test users.
2. Create an OAuth client of type **Web application**. Add the exact hosting origins, e.g. `https://sahebjiyouth.org` and `http://localhost:5173` for local development, as Authorized JavaScript origins. Do not include `/mandir-hospitality/` in an origin. Configure production and preview origins separately if they differ.
3. Set the public client ID via `VITE_GOOGLE_CLIENT_ID` before building, or enter it in Workspace settings. Never put a client secret or access token in source, browser storage, or the public website. The client ID is safe public configuration.
4. Staff select **Sign in with Google** and authorize Sheets access using a Google account with edit permission on the source sheet. Google enforces the account's sheet permissions. Access tokens remain in memory and expire; refresh the page or sign out to discard them.

Google's `spreadsheets` OAuth scope can grant access to all spreadsheets available to the authorized account. The application itself fixes requests to this one spreadsheet. A browser app cannot keep a client secret. If this scope is unsuitable, use a staff-authenticated backend with a dedicated identity restricted to this sheet instead; do not use an anonymous write endpoint or a shared secret bundled in JavaScript.

Read-only loading uses the sheet's existing public visualization access and JSONP; signed-in loading uses the authorized Sheets API. The sheet was readable without authentication during setup. Review its sharing policy if guest data should be private. If public reading is disabled, users must sign in before the roster can load. Refresh is available manually and every minute while the tab is visible. The last successful snapshot remains visible with an error when a refresh fails.

The Sheets values API does not provide an atomic compare-and-swap. Conflict checks protect against changes already present at pre-save read, but simultaneous writers or sorting during the read/write window can still race. Do not sort or rearrange rows while saves are in progress. For concurrent multi-user room reservations, use a backend with serialization and a defined room inventory. This sheet does not specify room capacities, so the live view does not fabricate beds, availability, or codes. A network failure is never automatically retried; refresh and inspect before retrying.

Kitchen headcount adjustments remain local to each device. Live transport dispatch plans are session-only and clear on reload, so attendee identities and trip details are not persisted in browser storage. These limits are labeled in settings and the dispatch view. Neither workflow updates the guest sheet. Guest creation and unrelated field editing must happen in the source sheet. Source data lives in memory; explicit CSV/JSON exports may contain personal information and must be handled privately.

Set `VITE_DEMO_MODE=true` to run the original sample-data workspace with its sample room inventory, device-local check-in and housekeeping. Demo and live dispatch/kitchen data use separate storage keys. Do not use the demo as the system of record for real guest data.

The original Stitch HTML, PNGs, and design document are preserved in their existing folders.

## Verification

```sh
npx playwright install chromium webkit
npm test
node --test tests/unit/sheets.test.js
npx playwright test --config playwright.sheets.config.js
```

Playwright exercises mobile navigation, responsive widths, registration, persistence, check-in, checkout-to-housekeeping, onsite/offsite assignment, dispatch, and kitchen day planning on Chromium and WebKit. Kitchen checks cover future dates, year boundaries, day visitors, arrival/departure cutoffs and isolated per-day adjustments. It starts a local server automatically if needed.

The Sheets tests use synthetic rows and mocked Google services. They never modify the real sheet. A real OAuth sign-in and authorized assignment write must be verified after configuring the Google client ID.
