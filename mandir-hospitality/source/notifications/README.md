# Yogi Prasad nightly WhatsApp

The `yogiPrasadDaily` timer in the existing Azure Function App `sahebjiyouth-reg-api` sends tomorrow's registered-guest meal headcounts at **9:00 PM America/New_York**. It runs in Azure without a browser, Mac, or Codex session. Twilio account and API-key credentials remain in the existing Azure application settings.

## Template

- Name: `yogi_prasad_daily_headcount`
- Content SID: `HX7323dade1f484b504c551f0ecc262c07`
- English (`en`), submitted as **Utility** on October 11, 2026.
- The job submits the Content SID directly; Twilio enforces WhatsApp eligibility. There is no application-side approval guard.
- Variables: `1` breakfast headcount, `2` lunch headcount, `3` dinner headcount.

```text
Jai Swaminarayan. Here are tomorrow's Yogi Prasad meal headcounts:

Breakfast: {{1}}
Lunch: {{2}}
Dinner: {{3}}

Please use these counts for meal planning.
```

## Counts

The job reads the live shared roster, validates its column layout, and uses `src/lib/mealForecast.js`, the same calculation as the dashboard. Arrivals before 11 AM get all three meals, 11 AM through before 3 PM get lunch and dinner, and later arrivals get dinner. Earlier arrivals count for all meals. Departure date is inclusive, matching the dashboard. Cancelled/departed attendees, out-of-range stays, earlier day visits, and attendees missing arrival/departure dates are excluded. Zero is a valid headcount.

These are registered-guest headcounts. Browser-local volunteer/walk-in adjustments and preparation buffers are not shared with the server and are not included. No guest names or roster rows are stored by this job or sent in WhatsApp.

## Schedule and duplicate prevention

The UTC trigger checks at 01:00, 01:05, 01:10, 01:15, 02:00, 02:05, 02:10, and 02:15. Its America/New_York guard permits only 9:00–9:19 PM, selecting the correct hour in both EST and EDT. First attempt is 9:00 PM; later checks can recover a roster read failure. It does not send late catch-up messages after the window. Cloud scheduling and WhatsApp delivery can have normal latency.

An atomic daily claim in the existing `RegRegistrations` table uses partition `yogi-prasad-whatsapp`, with row key `<meal-date>-<recipient-digits>`. The claim is created before sending. Once claimed, subsequent runs cannot send again. Accepted responses retain the Twilio SID (`SM` and `MM` supported). `accepted` is not a delivery receipt; inspect Twilio for delivery/read status.

Network uncertainty or a failed status write leaves the claim in `review` or `sending`; automatic resend is blocked. Inspect the original message in Twilio before any manual recovery. The handler throws on unresolved claims so the failure remains visible in Azure. It never silently substitutes zero when a source read fails.

## Configuration

- `YOGI_PRASAD_WHATSAPP_ENABLED=true` enables the job. Set `false` to pause it.
- `YOGI_PRASAD_WHATSAPP_TO` holds the authorized recipient as `whatsapp:+...` in private Azure settings. Do not publish recipient contact details.
- Existing `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`, and `TWILIO_WHATSAPP_FROM` are reused. The registration template setting `TWILIO_CONTENT_SID` is unchanged; this job uses its own compiled Content SID.
- The existing WhatsApp Messaging Service is supplied on the send, preserving its configured reply routing.

## Build and preview

From the dashboard source directory:

```sh
npm run build:notifications
npm run preview:whatsapp -- 2026-10-12
node --test tests/unit/yogi-prasad-notification.test.js
```

Preview reads live data and prints aggregate counts only. It never sends a message or creates a claim. Copy the generated `notifications/yogi-prasad.cjs` to repository `api/src/yogi-prasad.js` when deploying. Package the existing API as documented in `api/README.md`; deploy that separately from GitHub Pages. `api/host.json` includes the Azure extension bundle required for timer bindings. The Apps Script backend does not need redeployment for this job.
