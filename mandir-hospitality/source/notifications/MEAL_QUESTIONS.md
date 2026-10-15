# Family meal questionnaire

The Cloudflare hospitality workspace sends two WhatsApp quick-reply questions to
manual registrants. Manual means Primary Email (E) or Zip Code (G) is blank.
The normalized roster exposes only that boolean, not the raw email/ZIP values.
Active, uniquely identified attendees with complete stay dates and a valid
WhatsApp phone are eligible. Completed stays, duplicate identities and missing
contact/stay information do not generate messages.

Families group by normalized WhatsApp number and arrival date, including manual
attendees with separate MAN registration IDs. The message names the covered
attendees. Each captured member keeps their own inclusive departure date.
Different arrival dates require separate questions. One outstanding question per
number prevents several unrelated button prompts appearing together.

## Questions and counts

1. `mandir_family_arrival_meals` (`HXe3e2531896492283d3ed0b5c56f912c2`):
   “On your registered arrival date of {{date}}, when do you plan to reach the
   mandir?” Buttons: Morning / Before noon / Before evening. They respectively
   include breakfast+lunch+dinner, lunch+dinner, or dinner on arrival day only.
2. `mandir_family_chaturmas_meals` (`HX6ca41bc36d7a6b992b86275bd0cda576`):
   “Are you doing upvas (fasting) for Chaturmas?” The body displays the exact
   options “No”, “Yes (I eat once only, for lunch)” and “Yes (I eat once only, for
   dinner)”. WhatsApp's 20-character button limit requires the labels No /
   Yes, lunch only / Yes, dinner only. Lunch/dinner answers exclude every other
   meal throughout each attendee's stay.

Fasting follows the arrival answer. If the arrival date is already past, the
system asks only about fasting. A before-evening arrival plus lunch-only fasting
means no meal on arrival day and lunch on subsequent days. Existing source-time
rules remain while answers are missing. An old arrival answer is ignored if its
registered date changes. A manual override affects only its exact meal/date and
is never silently undone by a survey response.

## Delivery and response logging

Both templates must be approved before a send claim is created. Pending/error
approval checks retry after five minutes; approved checks cache for one day.
The automatic setting can be enabled while approval is pending. New eligible
families are picked up by the existing minute alarm without a browser or Mac.
Each pass is bounded to ten attempts and twenty seconds before starting another
attempt. A Sheet snapshot older than ten minutes pauses new invitations.

SQLite `meal_records` contains durable invitations, response logs, preferences,
per-meal overrides, plans and audit records. Sends are claimed before Twilio is
called. `sending`/`review` states prevent automatic resends after an uncertain
outcome; review Twilio before repairing them. `accepted` means Twilio accepted
the message, not that it was delivered. No real-recipient messages are used by
tests or preview commands.

Template variables 1/2 are family names/arrival date; 3/4/5 are random
invitation-bound payloads. Only authenticated `ButtonPayload` values can change
counts. Free text is forwarded to Chatwoot but never interpreted as a meal
answer. Duplicate inbound MessageSid values are no-ops. An intentional later
selection on the same valid invitation can correct the recorded answer. Changed
family membership, contact information or dates invalidates an old invitation.
STOP and equivalent Twilio opt-out words suppress subsequent survey sends.

The Messaging Service `MG88f1fc4ecdb340549c259343d48d7f54` routes incoming replies
to `https://mandir-hospitality-api.usayouth.workers.dev/twilio/whatsapp`. That
endpoint verifies the account Auth Token signature, records matching selections,
then forwards the original form to `https://app.chatwoot.com/twilio/callback`
with a newly computed signature for that URL. Ordinary Chatwoot messages remain
visible in its inbox. The response log in Yogi Prasad → Meal settings displays
the family answer applied to each attendee.

The existing Twilio account identifier and API credentials are encrypted Cloudflare secrets. The Auth
Token is used only for webhook verification/forwarding signatures; outbound
messages use the API key. Never place any credential in source or browser code.
Pause new questions in Meal settings. Pausing sends still permits replies to
existing questions to be recorded and forwarded.

`node scripts/setup-meal-templates.mjs` checks definitions and approval status.
`--create --approve` creates only missing matching templates and submits them as
Utility. The helper reads existing Azure credentials in memory and prints no
credentials. It never sends a recipient message.
