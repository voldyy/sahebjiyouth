import test from "node:test";
import assert from "node:assert/strict";
import { createLodgingStatusHandler } from "../../notifications/lodging-status.js";
import { lodgingCandidates } from "../../notifications/hospitality-model.js";
import { lodgingNoticeSignature, hasSentLodgingNotice, withLodgingNotices } from "../../src/lib/lodgingNotifications.js";

const guest = { sourceIdentity: "synthetic", sourceWritable: true, registrationId: "R1", name: "Synthetic Guest", rsvpStatus: "Confirmed", status: "Registered", lodging: "Samarpan", roomNo: "202", arrivalDate: "2026-10-15", arrivalTime: "10:00", arrivalTimeKnown: true, phone: "+12025550123" };
test("room checkmark needs a sent receipt for the current room, contact and stay", () => {
  const notice = { identity: guest.sourceIdentity, signature: lodgingNoticeSignature(guest), sent: true, status: "delivered" };
  assert.equal(hasSentLodgingNotice(withLodgingNotices([guest], [notice])[0]), true);
  for (const patch of [{ roomNo: "203" }, { phone: "+12025550124" }, { arrivalDate: "2026-10-16" }]) assert.equal(hasSentLodgingNotice(withLodgingNotices([{ ...guest, ...patch }], [notice])[0]), false);
  for (const status of ["queued", "accepted", "undelivered", "failed"]) assert.equal(hasSentLodgingNotice({ ...guest, lodgingNotification: { sent: true, status } }), false);
  assert.equal(hasSentLodgingNotice(withLodgingNotices([guest], [notice, notice])[0]), false);
});
test("status reader verifies existing Twilio messages without sending and caches terminal delivery", async () => {
  const candidate = lodgingCandidates({ guests: [guest] }, 0, true)[0];
  const claim = { partitionKey: "hospitality-notifications", rowKey: candidate.key, status: "accepted", type: "accommodation", messageSid: "SM" + "1".repeat(32), twilioStatus: "queued" };
  const table = { async *listEntities() { yield claim; }, async updateEntity(patch) { Object.assign(claim, patch); } };
  let reads = 0;
  const handler = createLodgingStatusHandler({ table, env: { TWILIO_ACCOUNT_SID: "test", TWILIO_API_KEY: "test", TWILIO_API_SECRET: "test", TWILIO_WHATSAPP_FROM: "whatsapp:+16105021100" }, getGuests: async () => [guest], fetchImpl: async (url, options) => {
    assert.match(url, /Messages\/SM[0-9]+\.json$/);
    assert.equal(options.method, undefined);
    reads++;
    return Response.json({ sid: claim.messageSid, status: "delivered", to: candidate.recipient, from: "whatsapp:+16105021100", error_code: null });
  } });
  const first = await handler();
  assert.equal(first.jsonBody.notifications[0].sent, true);
  assert.equal(first.jsonBody.notifications[0].signature, lodgingNoticeSignature(guest));
  await handler(); assert.equal(reads, 1);
  claim.twilioStatus = "undelivered"; claim.deliveryError = 63024;
  assert.equal((await handler()).jsonBody.notifications[0].sent, false);
});
