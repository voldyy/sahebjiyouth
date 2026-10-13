# Transport and accommodation WhatsApp notifications

The existing Azure Function App `sahebjiyouth-reg-api` runs `hospitalityNotifications` every minute. Set `HOSPITALITY_NOTIFICATIONS_ENABLED=true` to enable it or `false` to pause it. Existing Twilio application settings are reused; credentials are never included in browser code. The separate 9 PM Yogi Prasad timer is unchanged.

## Templates and recipients

All six English templates were created and submitted under Utility on October 13, 2026. `hospitality-templates.json` records the exact text, samples and Content SIDs. Approval is controlled by Twilio/WhatsApp, with no separate application-side approval guard.

| Template | Trigger | Recipient |
| --- | --- | --- |
| `mandir_driver_assignment` | Driver assignment changes, checked each minute | Assigned driver |
| `mandir_driver_pickup_airborne` | One check near departure confirms takeoff and supplies a future arrival estimate | Pickup driver |
| `mandir_driver_dropoff_reminder` | 8 hours before scheduled departure | Dropoff driver |
| `mandir_passenger_arrival_driver` | 18 hours before scheduled arrival | Registration's primary contact |
| `mandir_passenger_departure_driver` | 18 hours before scheduled departure | Registration's primary contact |
| `mandir_accommodation_assignment` | 24 hours before the attendee's recorded arrival, or the admin send button | Each attendee's registration phone |

The driver assignment includes the primary passenger's name and City/State, phone, arrival/departure, airline/flight, scheduled date/time, airport and portal link. Accompanying passenger counts include only non-primary attendees from the same registration on that trip; a solo passenger has no count label. Each registration sharing a flight receives its own driver message. A secondary-only trip cannot impersonate an absent primary passenger and needs source review before automated contact messages can be sent.

Lodging messages are **one per attendee**, including family members sharing a phone. Each is addressed to that attendee and contains that attendee's assigned lodging and literal room number. The contact text names Monica Matalia without inventing contact details.

## Required data

Blank values and placeholders (NA, N/A, N.A., N A, TBD, Unknown, Pending, None and dashes) block notifications when they occur in relevant fields. Transport validates registration/primary identity, primary name and City/State, contact phones, active driver details, travel method, RSVP status, and the applicable trip date/time, airport and recognizable airline/flight. Incomplete accompanying-attendee records also block the registration’s transport messages instead of producing an incorrect count. Unrelated return-trip columns do not affect an arrival notification.

Both timed and bulk lodging messages require the attendee name, registration identity/status, valid phone, known arrival date/time, lodging and room number. The bulk preview reports skipped incomplete attendees. Queued messages are rebuilt from fresh source data and invalidated if required details are cleared or changed; a final send-time variable check also rejects placeholders.

## Data and timing

- The worker reads fresh public-viewer data from Sheet1, Transport Assignments and Transport Resources. It validates headers and rejects duplicate assignment records. No Google sharing permissions are changed.
- Transport Resources uses its existing first four columns plus `Phone number` in column E. Active drivers must have unique names and valid phone numbers. The Apps Script header check accepts this column, and resource edits preserve its values.
- Explicit international numbers must include `+` and country code. Ten-digit North American numbers use `+1`; malformed or missing phone numbers are skipped.
- Current supported airports ABE, EWR, JFK and PHL use America/New_York. Scheduling handles EST/EDT. Unknown/missing flight times, conflicting group times, unsupported airports and ambiguous DST wall times are skipped rather than guessed.
- Timed reminders become eligible at their threshold and may catch up while the event is still in the future, such as when a driver or room is assigned late. No timed reminder is sent after its scheduled event time.
- There is no automatic flight-status polling. Per pickup flight, one schedule lookup (within 24 hours before arrival) obtains the origin departure time, followed by one status check 15 minutes after scheduled departure. If the first lookup already confirms takeoff, no second lookup is needed. Durable claims cap this at two automated lookup attempts, including failures, across restarts and driver changes. A delay or missing departure time does not start retries; consequently a delayed takeoff may have no automatic takeoff alert. Adjacent-day requests support departures the day before arrival. Dashboard checks are manual through **Check flight status**; older open clients cannot request automatic paid updates. Manual checks may incur their own API charges, with the existing short cache shared across viewers.
- On first activation, existing driver assignments are recorded as a baseline rather than replayed as new assignments. Subsequent driver changes and clear/reassign cycles trigger notices; vehicle-only changes do not. Bus/ground assignments can identify their service explicitly, but flight reminders and airborne alerts apply only to flights.

## Admin button and authorization

Accommodations has an admin-only **Send room details** button. It opens a current per-attendee preview across all assigned lodgings, shows phone endings and previous notification status, and queues the selected batch after confirmation. There is no automatic bulk send during deployment or verification. Missing phones, duplicates and attendees marked Cancelled/Departed are excluded. Already queued/sent room details are skipped. Changed room assignments require a refreshed preview.

The browser uses its existing authenticated Apps Script RPC. Apps Script verifies `ADMIN_ACCESS_KEY`, then calls the Azure `POST /api/hospitality-notifications` endpoint. Azure independently validates the supplied key against Apps Script's `notification-authorize` endpoint; it does not store the admin key. Invalid keys cannot read the bulk preview or enqueue messages. The added Apps Script POST entry point supports only authorization and validated roster-flight reads, not arbitrary shared writes.

Bulk requests only queue messages, avoiding browser timeout/resend ambiguity. The Azure timer sends queued messages and rechecks current assignment fingerprints. A changed room or removed/reassigned driver invalidates stale queued notices.

## Duplicate protection and operations

Private partitions in the existing `RegRegistrations` table:

- `hospitality-notifications`: atomic claims, Twilio acceptance/SID and review state.
- `hospitality-notification-state`: assignment baseline/epochs and durable one-shot flight checks.
- `hospitality-notification-outbox`: queued batch and assignment messages.

Each recipient/event is claimed before calling Twilio. Both SM and MM message identifiers are accepted. Network uncertainty or failed persistence leaves `sending`/`review` and blocks automatic resend. Review the original Twilio message before repairing a claim. `accepted` means Twilio accepted the request, not verified delivery. Manual and timed lodging sends share the same claim, so they cannot duplicate identical room details.

The worker sends up to 25 new messages per pass and stops before the Azure execution timeout. Remaining queued items resume on the next minute. Individual failures are logged without stopping unrelated notifications. Review claims and Azure logs if a message is missing.

The function-key-protected `GET /api/hospitality-notifications/health` endpoint reports enablement, aggregate roster readability and initialization state without returning attendee details or credentials.

## Build and release

```sh
npm run build:backend
npm run build:notifications
node --test tests/unit/hospitality-notifications.test.js tests/unit/notification-backend.test.js
npx playwright test --config playwright.sheets.config.js --grep 'accommodation WhatsApp|view-only accommodation page'
npm run build
```

Copy generated `notifications/hospitality-service.cjs` to repository `api/src/hospitality-notifications.js` before packaging/deploying the existing API. Update the existing Apps Script deployment with generated `apps-script/Code.gs`, keeping its URL and properties. Publish the dashboard source and dist assets to the existing GitHub Pages application. Do not publish live roster data, recipient exports, credentials or test traces.
