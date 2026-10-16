import { lodgingCandidates } from "./hospitality-model.js";
import { lodgingNoticeSignature } from "../src/lib/lodgingNotifications.js";

const CLAIMS = "hospitality-notifications";
const SENT = new Set(["sent", "delivered", "read"]);
const TERMINAL = new Set(["delivered", "read", "failed", "undelivered", "canceled"]);

async function currentGuests(fetchImpl) {
  const response = await fetchImpl("https://mandir-hospitality-api.usayouth.workers.dev/api", { signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!response.ok) throw Error("Workspace unavailable.");
  const result = await response.json();
  if (!result.ok || !Array.isArray(result.guests) || result.guests.length > 5000) throw Error("Invalid workspace response.");
  return result.guests;
}

// Azure's function-key authentication protects this read/status-cache endpoint.
// It never queues or sends a message; only existing accepted claims are checked.
export function createLodgingStatusHandler({ table, env, getGuests, fetchImpl = fetch, now = Date.now }) {
  return async () => {
    try {
      const guests = await (getGuests ? getGuests() : currentGuests(fetchImpl));
      const claims = new Map();
      for await (const row of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${CLAIMS}' and type eq 'accommodation' and status eq 'accepted'` } })) {
        if (claims.size >= 5000) throw Error("Notification record limit exceeded.");
        claims.set(row.rowKey, row);
      }
      let checks = 0;
      const notifications = [];
      for (const guest of guests) {
        const candidate = lodgingCandidates({ guests: [guest] }, now(), true)[0];
        const claim = candidate && claims.get(candidate.key);
        if (!claim || !/^(SM|MM)[0-9a-f]{32}$/i.test(claim.messageSid || "")) continue;
        const checked = Date.parse(claim.deliveryCheckedAt || "");
        if (checks < 25 && !TERMINAL.has(claim.twilioStatus) && (!Number.isFinite(checked) || now() - checked > 60000)) {
          checks++;
          const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages/${claim.messageSid}.json`, {
            headers: { Authorization: "Basic " + Buffer.from(`${env.TWILIO_API_KEY}:${env.TWILIO_API_SECRET}`).toString("base64") },
            signal: AbortSignal.timeout(8000), redirect: "manual",
          });
          if (response.ok) {
            const message = await response.json();
            if (message.sid === claim.messageSid && message.to === candidate.recipient && message.from === env.TWILIO_WHATSAPP_FROM && typeof message.status === "string") {
              claim.twilioStatus = message.status;
              claim.deliveryCheckedAt = new Date(now()).toISOString();
              claim.deliveryError = Number(message.error_code) || 0;
              await table.updateEntity({ partitionKey: CLAIMS, rowKey: claim.rowKey, twilioStatus: claim.twilioStatus, deliveryCheckedAt: claim.deliveryCheckedAt, deliveryError: claim.deliveryError }, "Merge");
            }
          }
        }
        notifications.push({ identity: guest.sourceIdentity, signature: lodgingNoticeSignature(guest), sent: SENT.has(claim.twilioStatus) && !claim.deliveryError, status: claim.twilioStatus || "accepted", at: claim.createdAt || "" });
      }
      return { jsonBody: { ok: true, notifications, checkedAt: new Date(now()).toISOString() }, headers: { "Cache-Control": "no-store" } };
    } catch {
      return { status: 503, jsonBody: { ok: false, error: "Room notification status is temporarily unavailable." }, headers: { "Cache-Control": "no-store" } };
    }
  };
}
