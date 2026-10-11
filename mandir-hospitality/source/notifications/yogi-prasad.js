import { SPREADSHEET_ID, guestsFromRows } from "../src/lib/sheets.js";
import { rosterMealCounts } from "../src/lib/mealForecast.js";

export const CONTENT_SID = "HX7323dade1f484b504c551f0ecc262c07";
export const SENDER = "whatsapp:+16105021100";
export const MESSAGING_SERVICE_SID = "MG88f1fc4ecdb340549c259343d48d7f54";
// Azure Linux timers use UTC. The local-time guard selects EDT or EST.
// Later checks retry read failures; the durable daily claim prevents resends.
export const TIMER_SCHEDULE = "0 0,5,10,15 1,2 * * *";
export const TIME_ZONE = "America/New_York";
const PARTITION = "yogi-prasad-whatsapp";

export function recipientFromEnv(env) {
  const recipient = env.YOGI_PRASAD_WHATSAPP_TO || "";
  if (!/^whatsapp:\+[1-9]\d{7,14}$/.test(recipient)) throw Error("YOGI_PRASAD_WHATSAPP_TO must be a WhatsApp E.164 address");
  return recipient;
}

export function easternDate(now = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
}

export function tomorrowEastern(now = new Date()) {
  const p = easternDate(now);
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1)).toISOString().slice(0, 10);
}

export function isSendWindow(now) {
  const p = easternDate(now);
  return p.hour === "21" && Number(p.minute) < 20;
}

export function parseRoster(text) {
  // Parse Google's JSONP envelope without executing remote code.
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) throw Error("Google Sheets returned an invalid roster response");
  const data = JSON.parse(match[1]);
  if (data.status !== "ok" || !Array.isArray(data.table?.cols) || !Array.isArray(data.table?.rows)) {
    throw Error("Google Sheets roster is unavailable");
  }
  const headers = data.table.cols.map(c => c.label);
  for (const [index, name] of Object.entries({
    9: "Relationship to Primary", 12: "Arrival Date Time", 13: "Departure Date Time",
    20: "Overnight Accommodation Needed?", 24: "RSVP Status",
  })) {
    if (headers[index] !== name) throw Error("The roster column layout changed; no message was sent");
  }
  const rows = [headers, ...data.table.rows.map(row => headers.map((_, i) =>
    [0, 5, 29, 30, 31].includes(i) ? row.c[i]?.f ?? row.c[i]?.v ?? "" : row.c[i]?.v ?? ""
  ))];
  return guestsFromRows(rows);
}

export async function fetchMealCounts(day, fetchImpl = fetch) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`);
  url.search = new URLSearchParams({ gid: "0", headers: "1", tqx: "out:json", range: "A:AF", _: String(Date.now()) });
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000), cache: "no-store" });
  if (!response.ok) throw Error(`Roster read failed (HTTP ${response.status})`);
  const text = await response.text();
  if (text.length > 5 * 1024 * 1024) throw Error("Roster response is too large");
  const guests = parseRoster(text);
  const counts = rosterMealCounts(guests, day);
  if (!Object.values(counts).every(n => Number.isSafeInteger(n) && n >= 0)) throw Error("Invalid meal headcounts");
  return {
    day, counts, rosterSize: guests.length,
    excludedUndated: guests.filter(g => g.status !== "Cancelled" && (!g.arrivalDate || !g.departureDate)).length,
  };
}

export function contentVariables(counts) {
  return { "1": String(counts.breakfast), "2": String(counts.lunch), "3": String(counts.dinner) };
}

export function createTwilioClient(env, fetchImpl = fetch) {
  const recipient = recipientFromEnv(env);
  const accountSid = env.TWILIO_ACCOUNT_SID;
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid || "") || env.TWILIO_WHATSAPP_FROM !== SENDER ||
      !/^SK[0-9a-f]{32}$/i.test(env.TWILIO_API_KEY || "") || !env.TWILIO_API_SECRET) {
    throw Error("Yogi Prasad Twilio configuration is missing or does not match the approved sender");
  }
  const authorization = "Basic " + Buffer.from(`${env.TWILIO_API_KEY}:${env.TWILIO_API_SECRET}`).toString("base64");
  return {
    async send(counts) {
      const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST", signal: AbortSignal.timeout(20000),
        headers: { Authorization: authorization, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          From: SENDER, To: recipient, MessagingServiceSid: MESSAGING_SERVICE_SID,
          ContentSid: CONTENT_SID, ContentVariables: JSON.stringify(contentVariables(counts)),
          ValidityPeriod: "3600",
        }),
      });
      if (!response.ok) throw Error(`Twilio send failed (HTTP ${response.status}); inspect the daily claim before retrying`);
      const result = await response.json();
      if (!/^(SM|MM)[0-9a-f]{32}$/i.test(result.sid || "") || !["accepted", "queued", "sending", "sent", "delivered", "read"].includes(result.status)) {
        throw Error("Twilio did not confirm acceptance; inspect its message logs before retrying");
      }
      return { sid: result.sid, status: result.status };
    },
  };
}

export function createYogiPrasadHandler({ table, env, now = () => new Date(), getCounts = fetchMealCounts, twilio }) {
  return async function yogiPrasadDaily(_timer, context) {
    if (env.YOGI_PRASAD_WHATSAPP_ENABLED !== "true") return { status: "disabled" };
    const started = now();
    if (!isSendWindow(started)) return { status: "outside_send_window" };
    const day = tomorrowEastern(started);
    const recipient = recipientFromEnv(env);
    const rowKey = `${day}-${recipient.replace(/\D/g, "")}`;
    const log = value => { context?.log?.(JSON.stringify({ task: "yogi-prasad", day, ...value })); return value; };
    try {
      const existing = await table.getEntity(PARTITION, rowKey);
      if (existing.status === "sending" || existing.status === "review") {
        throw Error(`Yogi Prasad ${day} has an uncertain send; inspect Twilio and the daily claim before any retry`);
      }
      return log({ status: "already_claimed", messageSid: existing.messageSid || "", recordedStatus: existing.status });
    } catch (error) {
      if (error.statusCode !== 404) throw error;
    }
    const client = twilio || createTwilioClient(env);
    const snapshot = await getCounts(day);
    // Do not send a stale "tomorrow" message if fetching was severely delayed.
    if (!isSendWindow(now()) || tomorrowEastern(now()) !== day) return log({ status: "window_expired" });
    const claim = {
      partitionKey: PARTITION, rowKey, status: "sending", day,
      recipient, contentSid: CONTENT_SID,
      createdAt: started.toISOString(), countsJson: JSON.stringify(snapshot.counts),
      excludedUndated: snapshot.excludedUndated,
    };
    try { await table.createEntity(claim); }
    catch (error) {
      if (error.statusCode === 409) return log({ status: "already_claimed" });
      throw error;
    }
    // Claim precedes the external side effect. Ambiguous failures never resend.
    // If even the status write fails, the durable "sending" claim remains.
    try {
      const message = await client.send(snapshot.counts);
      await table.updateEntity({ partitionKey: PARTITION, rowKey, status: "accepted", messageSid: message.sid, twilioStatus: message.status, acceptedAt: now().toISOString() }, "Merge");
      return log({ status: "accepted", messageSid: message.sid, counts: snapshot.counts, excludedUndated: snapshot.excludedUndated });
    } catch (error) {
      try { await table.updateEntity({ partitionKey: PARTITION, rowKey, status: "review", lastError: "Send outcome requires review in Twilio; automatic resend blocked" }, "Merge"); } catch {}
      throw Error(`Yogi Prasad ${day} requires review; automatic resend blocked. ${error.message}`);
    }
  };
}
