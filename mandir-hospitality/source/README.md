# Mandir Hospitality

A responsive Google Sheets dashboard for Allentown Shri Swaminarayan Mandirji. Admins have Main, Transport, Accommodations, and Yogi Prasad. The Yogi Prasad team has its own restricted meal-planning link. The interface uses the supplied Anoopam Mission logo, sky blue, and soft orange.

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

The shareable team link is `https://www.sahebjiyouth.org/mandir-hospitality/#kitchen?team=yogi-prasad`. An admin can copy it from Workspace settings. It opens only Yogi Prasad, even in an existing admin tab. Without valid admin access, changing the hash or forging a role cannot unlock other sections.

Full access uses a private link with an `admin` parameter in the URL fragment. The key is generated on the backend and stored in the Apps Script property `ADMIN_ACCESS_KEY`. The frontend consumes it into this tab's session storage and removes it from the address bar. It is never bundled in source or production assets. Possession grants admin access, so share this link only with admins. Rotating the script property invalidates old links. No Google sign-in is required for dashboard users.

The backend checks the key on every lodging, transport, resource, flight, offsite, and linen action. Anonymous snapshots contain only the dates/counts needed for meal forecasts, not the guest roster, contact information, transport plans, room inventory, or housekeeping records. Source-sheet link sharing must remain **Viewer**, with named editors retained. Anonymous source-sheet editing would bypass dashboard restrictions.

Yogi Prasad headcount adjustments remain device-local; they do not change other dashboard sections or the source sheet.

## Source data

The roster is Google Sheets document `1YvVz4DyPZYTYtKC9qiDlEXsPd7Xz4DPNJIoe3NBkYMA`, attendee tab `gid=0`. Each row is one attendee. Registration ID + attendee name + relationship identifies a row independently of sorting. Removed or duplicate identities and stale edits are rejected. Direct sheet edits bypass the app's lock, so avoid rearranging rows while saving.

Lodging uses **AD = location**, **AE = hotel/room number**, **AF = bed code**. Assignment writes preserve literal text and leading zeroes. Guest data stays in memory and is not embedded in the static build. Other registration edits remain in Sheets. Explicit RSVP values `Departed` and `Checked out` are recognized; changing scheduled checkout dates is necessary for date-driven linen tracking.

Travel choices include `CAR`, `FLIGHT`, `BUS`, and `Bus (arrival)`. The last applies only to arrivals; it does not infer a bus return. Location ABE is supported for bus pickup. Bus journeys do not invoke flight lookup or display flight trackers.

## Accommodations

The top selector switches between **Samarpan**, **Offsite**, and **Housekeeping**.

Samarpan has rooms 204–207 (4 beds each), 100 (7 beds), and 101–104 (12 beds each), totaling 71 beds. Generated codes are `S{room}B{bed}`. Weekly view covers six Sunday–Saturday weeks from October 11 through November 21, 2026. Daily view displays every room in the selected location. Guest list supports search and assignment editing.

Offsite offers **Comfort Inn** and **Hilton Garden Inn**, with the same weekly, daily, and guest-list views. Admins add a provisional planning room and its planned bed count; no inventory is invented. The hotel room number is optional. Until confirmed, AE stays blank and AF uses a stable internal bed code. Editing the planning room to add its actual number updates its assigned guests' AE values while retaining bed codes and stay dates. Assigned beds cannot be removed from inventory.

Drag an unassigned guest card onto a bed row to assign their entire stay, regardless of the drop date. Feedback previews the stay and flags conflicts. Tapping a guest or empty bed opens the assignment form as an alternative for touch and keyboard use. Both frontend and backend check the entire stay using fresh dates. Check-in is inclusive and checkout exclusive. Missing dates or unknown bed codes are flagged instead of advertising affected beds as empty.

Housekeeping records linen tasks for assigned Samarpan beds when the accommodation checkout date arrives in **America/New_York**. Accommodation dates take precedence, with arrival/departure fallback. This uses scheduled dates, not physical checkout detection. Correct an early departure or extension in the source sheet. Each checkout has its own record. Outstanding tasks survive clearing or moving the lodging assignment; a corrected stay supersedes its old pending scheduled checkout. **Linens refreshed** records completion in the sheet, survives reloads, and rejects stale checkout lists. The next guest's checkout creates a new task.

## Transport and Yogi Prasad

Airport Trips combines arrivals and departures chronologically. Groups use direction, date, airport and flight/service. Unknown services remain separated by registration. Names include supplied city/state and phone links. Inline driver/vehicle selectors save on selection. Driver URLs such as `#transport?driver=Driver+Name` filter the admin view and still require admin access.

FlightStats lookups run only on flight day, with a five-minute server cache. Keep `FLIGHTSTATS_APP_ID` and `FLIGHTSTATS_APP_KEY` in private Apps Script properties. No guest data is sent to the provider.

Yogi Prasad serves breakfast 8–10 AM, lunch 12–2 PM, and dinner 6–8 PM. On arrival day, arrivals before 11 AM count for all three meals, 11 AM–before 3 PM count for lunch and dinner, and 3 PM–11:59 PM count for dinner. Guests staying from earlier days count for all meals. Undated attendees are excluded with a warning. The service card shows combined headcount and preparation target without category breakdowns. Kitchen updates and plan export have been removed. Headcount adjustments and preparation buffers remain saved per day on the current device.

## Shared backend

The existing **Mandir Hospitality Shared Editing** Apps Script project executes as the owner and serves Anyone. Update this project, not the registration project. `npm run build:backend` generates `apps-script/Code.gs`. Update the existing Web app deployment to a new version to preserve its URL; the static website release does not update Apps Script automatically.

For first-time setup, invoke the private `setupHospitality_` helper from an editor-only temporary wrapper. It creates shared tabs and generates `ADMIN_ACCESS_KEY` only if absent. The private `showAdminLink_` helper logs the admin URL in the owner's editor. Remove any temporary wrapper before deploying. Apps Script hides underscore helpers from the public RPC interface and the normal function picker. Existing deployments retain the key when code is updated. Never return the key through `hospitalityRequest`.

Shared tabs are `Transport Assignments`, `Transport Resources`, `Assignment History`, `Offsite Rooms`, and `Housekeeping`. Request IDs, a script lock, stale checks, literal writes and readback confirmation protect saves. History records changes, not verified personal identities. The browser refreshes every minute while visible and on returning to the tab.

The browser uses an Apps Script iframe with nonce/source/origin-checked postMessage RPC. These checks protect message transport; the server's access-key check supplies authorization. `VITE_APPS_SCRIPT_URL` can override the public `/exec` endpoint. Local bridge origins are localhost/127.0.0.1 on port 5174.

## Verification

Unit tests cover backend permissions, stale writes, room conflicts, provisional numbering, successive checkout/linen cycles, date corrections, Allentown day boundaries and bus travel. Sheets Playwright tests exercise Chromium and WebKit with synthetic records and a mocked backend, including real pointer drags, responsive views, persistent saves and team restrictions. They never change real guest assignments.

`VITE_DEMO_MODE=true` and `npm test` use the separate original sample-data workspace. Its registration, check-in, dispatch and housekeeping behavior is device-local and is not the live system of record.
