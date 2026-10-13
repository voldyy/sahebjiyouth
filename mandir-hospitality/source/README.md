# Mandir Hospitality

A responsive Google Sheets dashboard for Allentown Shri Swaminarayan Mandirji. Admins have Main, Transport, Accommodations, and Yogi Prasad. The Yogi Prasad team link opens an overall view-only version of all four tabs. The interface uses the supplied Anoopam Mission logo, sky blue, and soft orange.

## Development and release

```sh
npm install
npm run dev -- --port 5174
npm run build:backend
npm run test:unit
npm run test:sheets
npm run build
```

Production is `https://www.sahebjiyouth.org/mandir-hospitality/`. Vite builds to `dist/` with that subdirectory as its base. Development serves `/`; preview serves `/mandir-hospitality/`. Hash navigation works on static GitHub Pages hosting.

Publish editable source to `voldyy/sahebjiyouth`, `mandir-hospitality/source/`, and `dist/` contents to `mandir-hospitality/`. Preserve older hashed assets for existing tabs. Never publish `.env.local`, admin links, private credentials, guest exports, browser traces, or the old reference export. The registration application and its separate Apps Script project are unrelated to this dashboard's deployment.

## Access

The shareable team link is `https://www.sahebjiyouth.org/mandir-hospitality/#kitchen?team=yogi-prasad`. An admin can copy it from Workspace settings. It starts on Yogi Prasad and shows Main, Transport, Accommodations, and Yogi Prasad in view-only mode, including when opened in an existing admin tab. The team flag persists across navigation and driver filters. Search, filters, dates, guest/stay details, and flight lookups remain available. Editing controls and headcount adjustments are unavailable; a forged role or hash cannot authorize writes.

Full access uses a private link with an `admin` parameter in the URL fragment. The key is generated on the backend and stored in the Apps Script property `ADMIN_ACCESS_KEY`. The frontend consumes it into this tab's session storage and removes it from the address bar. It is never bundled in source or production assets. Possession grants admin access, so share this link only with admins. Rotating the script property invalidates old links. No Google sign-in is required for dashboard users.

The backend checks the key on every lodging, transport, resource, offsite, and linen write. Viewer snapshots return the normalized guest display records, transport assignments, room inventory, and housekeeping needed by all four tabs, without the raw source rows. Viewer snapshots do not create or update sheet records; due linen tasks can be derived in memory. Snapshot and flight lookup are permitted read actions. Source-sheet link sharing must remain **Viewer**, with named editors retained. Anonymous source-sheet editing would bypass dashboard restrictions.

Yogi Prasad headcount adjustments remain device-local and are now available only to admins. Guest views cannot change headcounts or any shared assignments.

## Source data

The roster is Google Sheets document `1YvVz4DyPZYTYtKC9qiDlEXsPd7Xz4DPNJIoe3NBkYMA`, attendee tab `gid=0`. Each row is one attendee. Registration ID + attendee name + relationship identifies a row independently of sorting. Removed or duplicate identities and stale edits are rejected. Direct sheet edits bypass the app's lock, so avoid rearranging rows while saving.

Lodging uses **AD = location**, **AE = hotel/room number**, **AF = bed code**. Assignment writes preserve literal text and leading zeroes. Guest data stays in memory and is not embedded in the static build. Other registration edits remain in Sheets. Explicit RSVP values `Departed` and `Checked out` are recognized; changing scheduled checkout dates is necessary for date-driven linen tracking.

Travel choices include `CAR`, `FLIGHT`, `BUS`, and `Bus (arrival)`. The last applies only to arrivals; it does not infer a bus return. Location ABE is supported for bus pickup. Bus journeys do not invoke flight lookup or display flight trackers.

## Accommodations

The top selector switches between **Samarpan**, **Offsite**, and **Housekeeping**.

Samarpan has room 204 (3 beds), rooms 203 and 205–207 (4 beds each), 100 (7 beds), and 101–104 (12 beds each), totaling 74 beds. Generated codes are `S{room}B{bed}`. Weekly view covers six Sunday–Saturday weeks from October 11 through November 21, 2026. The unassigned list is filtered to the selected week or day; choose the guest's stay dates or use Guest list to see future arrivals. Daily view displays every room in the selected location. Guest list supports search and assignment editing.

Admins can use Main's Add guest button to append one attendee to Sheets. Optional details remain blank; each save uses a stable request ID to prevent duplicate rows on retry. This action does not send registration emails or assign a room.

Accommodations includes Day at a glance: a compact daily overview of all Samarpan and offsite beds. Add walk-in accepts a name, check-in, checkout, room and bed, plus optional phone. The guest and full-stay reservation are saved together after conflict checks, so a rejected assignment does not create a guest row. Empty beds also offer the walk-in shortcut with the selected bed and date filled in. Main displays both arrival and departure dates; absent times stay omitted.

Transport cards share their expanded/collapsed state through Transport Display. All users may change this presentation setting; operational assignments and guest creation remain admin-only. Past-date and Completed trips default to collapsed until someone saves an explicit preference. Visible Transport pages refresh shared presentation every five seconds and on focus; hidden pages stop polling. These settings are separate from driver/vehicle assignment records.

Offsite offers **Comfort Inn** and **Hilton Garden Inn**, with the same weekly, daily, and guest-list views. Admins add a provisional planning room and its planned bed count; no inventory is invented. The hotel room number is optional. Until confirmed, AE stays blank and AF uses a stable internal bed code. Editing the planning room to add its actual number updates its assigned guests' AE values while retaining bed codes and stay dates. Assigned beds cannot be removed from inventory.

Drag an unassigned guest card onto a bed row to assign their entire stay, regardless of the drop date. Feedback previews the stay and flags conflicts. Tapping a guest or empty bed opens the assignment form as an alternative for touch and keyboard use. Both frontend and backend check the entire stay using fresh dates. Check-in is inclusive and checkout exclusive. Missing dates or unknown bed codes are flagged instead of advertising affected beds as empty.

Housekeeping records linen tasks for assigned Samarpan beds when the accommodation checkout date arrives in **America/New_York**. Accommodation dates take precedence, with arrival/departure fallback. This uses scheduled dates, not physical checkout detection. Correct an early departure or extension in the source sheet. Each checkout has its own record. Outstanding tasks survive clearing or moving the lodging assignment; a corrected stay supersedes its old pending scheduled checkout. **Linens refreshed** records completion in the sheet, survives reloads, and rejects stale checkout lists. The next guest's checkout creates a new task.

## Transport and Yogi Prasad

Airport Trips combines arrivals and departures chronologically. Groups use direction, date, airport and flight/service. Unknown services remain separated by registration. Names include supplied city/state and phone links. Flight prefixes display the carrier name and a small locally bundled airline logo; unknown prefixes use a neutral fallback. IATA and common ICAO prefixes are supported, and bus labels remain unchanged. Inline driver/vehicle selectors save on selection. Driver URLs such as `#transport?driver=Driver+Name` filter the admin view and still require admin access.

FlightStats lookups run on flight day and refresh automatically every five minutes while the page is visible, with a five-minute server cache. Status uses scheduled versus actual/estimated times: On Time (green), Delayed (orange), Canceled (red), and Early (purple, only while in transit). Diverted remains an explicit urgent warning; In transit and Landed appear as phase indicators. For live flights, the trip header strikes through the smaller scheduled time and emphasizes the latest airport-local arrival/departure time, including Early and On Time. Missing estimates are explicitly marked ETA pending; canceled/diverted flights do not show an old estimate as a valid ETA. The header and status badge share a single lookup. Status badges use a stronger colored pulse while respecting reduced-motion preferences. There is no manual refresh control or checked timestamp. UTC time pairs are preferred for delay comparisons, with a fallback for older backend responses. Flight tracker links use FlightAware ICAO identifiers, for example UA308 maps to UAL308. Keep `FLIGHTSTATS_APP_ID` and `FLIGHTSTATS_APP_KEY` in private Apps Script properties. No guest data is sent to the provider.

Yogi Prasad serves breakfast 8–10 AM, lunch 12–2 PM, and dinner 6–8 PM. On arrival day, arrivals before 11 AM count for all three meals, 11 AM–before 3 PM count for lunch and dinner, and 3 PM–11:59 PM count for dinner. Guests staying from earlier days count for all meals. Undated attendees are excluded with a warning. The service card shows combined headcount and preparation target without category breakdowns, plus a compact alphabetical list of diners for the selected meal and date. Home city/state appears in smaller muted text in parentheses. This list uses the exact attendance selection used by the meal count; unnamed extra headcount is noted separately. Kitchen updates and plan export have been removed. Headcount adjustments and preparation buffers remain saved per day on the current device.

## Shared backend

The existing **Mandir Hospitality Shared Editing** Apps Script project executes as the owner and serves Anyone. Update this project, not the registration project. `npm run build:backend` generates `apps-script/Code.gs`. Update the existing Web app deployment to a new version to preserve its URL; the static website release does not update Apps Script automatically.

For first-time setup, invoke the private `setupHospitality_` helper from an editor-only temporary wrapper. It creates shared tabs and generates `ADMIN_ACCESS_KEY` only if absent. The private `showAdminLink_` helper logs the admin URL in the owner's editor. Remove any temporary wrapper before deploying. Apps Script hides underscore helpers from the public RPC interface and the normal function picker. Existing deployments retain the key when code is updated. Never return the key through `hospitalityRequest`.

Shared tabs are `Transport Assignments`, `Transport Resources`, `Assignment History`, `Offsite Rooms`, and `Housekeeping`. Request IDs, a script lock, stale checks, literal writes and readback confirmation protect saves. History records changes, not verified personal identities. The browser refreshes every minute while visible and on returning to the tab.

The browser uses an Apps Script iframe with nonce/source/origin-checked postMessage RPC. These checks protect message transport; the server's access-key check supplies authorization. `VITE_APPS_SCRIPT_URL` can override the public `/exec` endpoint. Local bridge origins are localhost/127.0.0.1 on port 5174.

## Verification

Unit tests cover backend permissions, stale writes, room conflicts, provisional numbering, successive checkout/linen cycles, date corrections, Allentown day boundaries and bus travel. Sheets Playwright tests exercise Chromium and WebKit with synthetic records and a mocked backend, including real pointer drags, responsive views, persistent saves and team restrictions. They never change real guest assignments.

`VITE_DEMO_MODE=true` and `npm test` use the separate original sample-data workspace. Its registration, check-in, dispatch and housekeeping behavior is device-local and is not the live system of record.

The initial page includes a minimal loading indicator before React starts and while the first Sheets snapshot loads. It respects reduced-motion preferences, keeps normal background refreshes unobtrusive, and displays a retry action on initial connection errors.
