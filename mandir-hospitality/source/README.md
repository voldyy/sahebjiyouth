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

This version is an interactive frontend with sample data. It stores changes in this browser's localStorage; it has no authentication, shared database, or live Google Sheets connection. The `DEMO` label and workspace settings make this explicit. Clearing browser storage resets the sample workspace. Other devices have their own copies.

`src/lib/data.js` contains sample guests, `src/lib/rooms.js` the room inventory, and `src/lib/storage.js` browser persistence. `src/App.jsx` coordinates guest changes and housekeeping. Replace this persistence layer with an authenticated API for multi-user production use. Do not use localStorage as the system of record for real guest data.

The original Stitch HTML, PNGs, and design document are preserved in their existing folders.

## Verification

```sh
npx playwright install chromium webkit
npm test
```

Playwright exercises mobile navigation, responsive widths, registration, persistence, check-in, checkout-to-housekeeping, onsite/offsite assignment, dispatch, and kitchen day planning on Chromium and WebKit. Kitchen checks cover future dates, year boundaries, day visitors, arrival/departure cutoffs and isolated per-day adjustments. It starts a local server automatically if needed.
