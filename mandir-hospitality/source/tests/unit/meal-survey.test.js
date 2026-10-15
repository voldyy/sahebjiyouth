import test from "node:test";
import assert from "node:assert/strict";
import { createMealSurvey, mealSurveyConstants } from "../../worker/meal-survey.js";

const ACCOUNT = `AC${"1".repeat(32)}`;
const ARRIVAL_SID = `HX${"2".repeat(32)}`;
const FASTING_SID = `HX${"3".repeat(32)}`;
const ENV = {
  TWILIO_ACCOUNT_SID: ACCOUNT,
  TWILIO_API_KEY: `SK${"4".repeat(32)}`,
  TWILIO_API_SECRET: "test-only-secret",
  TWILIO_WHATSAPP_FROM: mealSurveyConstants.SENDER,
  MEAL_ARRIVAL_CONTENT_SID: ARRIVAL_SID,
  MEAL_FASTING_CONTENT_SID: FASTING_SID,
};
const PHONE = "whatsapp:+12025550123";

function guest(identity, overrides = {}) {
  return {
    sourceIdentity: identity,
    sourceWritable: true,
    registrationId: "R1",
    name: identity,
    primaryContact: "Alex Patel",
    isPrimaryContact: identity === "Alex Patel",
    phone: "+1 (202) 555-0123",
    arrivalDate: "2026-10-20",
    departureDate: "2026-10-24",
    status: "Registered",
    isManualRegistration: true,
    ...overrides,
  };
}

function webhook(invite, overrides = {}) {
  return new URLSearchParams({
    MessageSid: `SM${"9".repeat(32)}`,
    AccountSid: ACCOUNT,
    From: PHONE,
    To: mealSurveyConstants.SENDER,
    Body: "Before noon",
    ButtonText: "Before noon",
    ButtonPayload: invite.variables["4"],
    ...overrides,
  });
}

function fixture(options = {}) {
  let current = options.now || "2026-10-15T16:00:00Z";
  const guests = options.guests || [guest("Alex Patel"), guest("Sam Patel", { isPrimaryContact: false })];
  const stores = new Map(Object.values(mealSurveyConstants).filter(value => typeof value === "string" && value.startsWith("survey-")).map(kind => [kind, new Map()]));
  const answers = [], requests = [], approvalRequests = [];
  let schedules = 0;
  const bucket = kind => {
    if (!stores.has(kind)) stores.set(kind, new Map());
    return stores.get(kind);
  };
  const fetchImpl = async (url, request) => {
    if (new URL(url).hostname === "content.twilio.com") {
      approvalRequests.push({ url, ...request });
      if (options.approvalFetchImpl) return options.approvalFetchImpl(url, request);
      const sid = new URL(url).pathname.split("/")[3];
      return Response.json({ account_sid: ACCOUNT, sid, whatsapp: { status: options.approvalStatus || "approved" } });
    }
    if (options.fetchImpl) return options.fetchImpl(url, request);
    requests.push(request);
    return Response.json({ sid: `MM${String(requests.length).padStart(32, "a")}`, status: "queued" });
  };
  const survey = createMealSurvey({
    env: { ...ENV, ...options.env },
    getGuests: () => guests,
    getSettings: options.getSettings || (() => ({ automaticQuestionsEnabled: options.enabled !== false })),
    records: kind => [...bucket(kind)].map(([id, data]) => ({ id, data })),
    get: (kind, id) => { options.onGet?.(kind, id); return bucket(kind).get(id); },
    put: (kind, id, data) => bucket(kind).set(id, structuredClone(data)),
    transaction: fn => fn(),
    saveAnswer: (identity, question, value, arrivalDate, messageSid) => answers.push({ identity, question, value, arrivalDate, messageSid }),
    schedule: () => { schedules++; },
    now: () => new Date(current),
    fetchImpl,
  });
  return {
    survey, guests, stores, answers, requests, approvalRequests,
    schedules: () => schedules,
    setNow: value => { current = value; },
    invites: () => [...bucket("survey-invite").values()],
    replies: () => [...bucket("survey-reply").values()],
    optouts: () => [...bucket("survey-optout").values()],
    templates: () => bucket("survey-config").get("templates"),
  };
}

test("both WhatsApp templates must be approved before any invitation is claimed", async () => {
  for (const pendingSid of [ARRIVAL_SID, FASTING_SID]) {
    const f = fixture({ approvalFetchImpl: async url => {
      const sid = new URL(url).pathname.split("/")[3];
      return Response.json({ account_sid: ACCOUNT, sid, whatsapp: { status: sid === pendingSid ? "pending" : "approved" } });
    } });
    const result = await f.survey.process();
    assert.equal(result.status, "awaiting_template_approval");
    assert.equal(result.sent, 0);
    assert.equal(result.review, 0);
    assert.equal(result.templates.status, "pending");
    assert.equal(f.invites().length, 0, "pending approval must not consume a family invitation");
    assert.equal(f.requests.length, 0);
    assert.equal(f.approvalRequests.length, 2);
    assert.deepEqual(f.approvalRequests.map(request => request.url).sort(), [ARRIVAL_SID, FASTING_SID].map(sid => `https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`).sort());
    for (const request of f.approvalRequests) {
      assert.equal(request.method, "GET");
      assert.equal(request.headers.Authorization, `Basic ${btoa(`${ENV.TWILIO_API_KEY}:${ENV.TWILIO_API_SECRET}`)}`);
      assert.equal(request.redirect, "manual");
    }
    assert.equal(f.templates().accountSid, ACCOUNT);
    assert.equal(f.survey.summary().templates.status, "pending");
    assert.equal(f.survey.summary().templates.accountSid, undefined, "summary only exposes template status fields");
  }
});

test("pending approvals retry after five minutes and approved templates are cached for one day", async () => {
  let status = "pending";
  const f = fixture({ approvalFetchImpl: async url => Response.json({
    account_sid: ACCOUNT, sid: new URL(url).pathname.split("/")[3], whatsapp: { status },
  }) });
  assert.equal((await f.survey.process()).status, "awaiting_template_approval");
  status = "approved";
  f.setNow("2026-10-15T16:04:59Z");
  assert.equal((await f.survey.process()).status, "awaiting_template_approval");
  assert.equal(f.approvalRequests.length, 2);
  assert.equal(f.invites().length, 0);
  f.setNow("2026-10-15T16:05:00Z");
  assert.equal((await f.survey.process()).sent, 1);
  assert.equal(f.approvalRequests.length, 4);
  assert.equal(f.templates().nextCheckAt, "2026-10-16T16:05:00.000Z");
  status = "paused";
  f.setNow("2026-10-16T16:04:59Z");
  await f.survey.process();
  assert.equal(f.approvalRequests.length, 4);
  await f.survey.receive(webhook(f.invites()[0]));
  f.setNow("2026-10-16T16:05:00Z");
  const paused = await f.survey.process();
  assert.equal(paused.status, "awaiting_template_approval");
  assert.equal(paused.templates.arrival.status, "paused");
  assert.equal(f.approvalRequests.length, 6);
  assert.equal(f.invites().length, 1, "a revoked template cannot claim the next question");
  assert.equal(f.requests.length, 1);
});

test("approval failures and malformed responses skip claims and retry without trusting expired approval", async () => {
  const responses = [
    () => { throw new Error("network timeout"); },
    () => new Response("Unavailable", { status: 503 }),
    () => new Response("not JSON"),
    () => Response.json({}),
    url => Response.json({ account_sid: ACCOUNT, sid: new URL(url).pathname.split("/")[3], whatsapp: { status: "not_a_status" } }),
    () => Response.json({ account_sid: ACCOUNT, sid: `HX${"0".repeat(32)}`, whatsapp: { status: "approved" } }),
    url => Response.json({ account_sid: `AC${"0".repeat(32)}`, sid: new URL(url).pathname.split("/")[3], whatsapp: { status: "approved" } }),
  ];
  for (const approvalFetchImpl of responses) {
    const f = fixture({ approvalFetchImpl });
    const result = await f.survey.process();
    assert.equal(result.status, "configuration_unavailable");
    assert.equal(result.templates.status, "unavailable");
    assert.equal(f.invites().length, 0);
    assert.equal(f.requests.length, 0);
    await f.survey.process();
    assert.equal(f.approvalRequests.length, 2, "failures also use the retry interval");
    f.setNow("2026-10-15T16:05:00Z");
    await f.survey.process();
    assert.equal(f.approvalRequests.length, 4);
  }

  let failing = false;
  const f = fixture({ guests: [], approvalFetchImpl: async url => {
    if (failing) throw new Error("network timeout");
    return Response.json({ account_sid: ACCOUNT, sid: new URL(url).pathname.split("/")[3], whatsapp: { status: "approved" } });
  } });
  await f.survey.process();
  f.guests.push(guest("New Family"));
  f.setNow("2026-10-16T16:00:00Z");
  failing = true;
  assert.equal((await f.survey.process()).status, "configuration_unavailable");
  assert.equal(f.invites().length, 0);
  assert.equal(f.requests.length, 0);
});

test("missing or changed configuration cannot reuse an approved template cache", async () => {
  const missing = fixture({ env: { MEAL_FASTING_CONTENT_SID: "" } });
  assert.equal((await missing.survey.process()).status, "configuration_unavailable");
  assert.equal(missing.approvalRequests.length, 0);
  assert.equal(missing.invites().length, 0);
  assert.equal(missing.requests.length, 0);

  const f = fixture({ guests: [] });
  await f.survey.process();
  f.templates().arrival.contentSid = `HX${"0".repeat(32)}`;
  assert.equal(f.survey.summary().templates.status, "unchecked");
  await f.survey.process();
  assert.equal(f.approvalRequests.length, 4);
});

test("one invitation covers the whole family and one phone cannot have two outstanding questions", async () => {
  let f;
  const fetchImpl = async (_url, request) => {
    const sending = f.invites();
    assert.equal(sending.length, 1);
    assert.equal(sending[0].status, "sending", "claim is durable before Twilio I/O");
    f.requests.push(request);
    return Response.json({ sid: `MM${"a".repeat(32)}`, status: "queued" });
  };
  f = fixture({
    guests: [
      guest("Alex Patel"),
      guest("Sam Patel", { isPrimaryContact: false }),
      guest("Later Patel", { registrationId: "R2", arrivalDate: "2026-10-22", departureDate: "2026-10-25", isPrimaryContact: true, primaryContact: "Later Patel" }),
    ],
    fetchImpl,
  });
  const result = await f.survey.process();
  assert.deepEqual(result, { status: "complete", families: 2, sent: 1, review: 0, skippedOptOut: 0 });
  const [invite] = f.invites();
  assert.equal(invite.status, "accepted");
  assert.equal(invite.question, "arrival");
  assert.equal(invite.members.length, 2);
  assert.deepEqual(invite.members.map(member => member.identity), ["Alex Patel", "Sam Patel"]);
  assert.match(invite.name, /Alex Patel family: Alex Patel, Sam Patel/);
  const body = f.requests[0].body;
  assert.equal(body.get("To"), PHONE);
  assert.equal(body.get("From"), mealSurveyConstants.SENDER);
  assert.equal(body.get("MessagingServiceSid"), mealSurveyConstants.MESSAGING_SERVICE_SID);
  assert.equal(body.get("ContentSid"), ARRIVAL_SID);
  const variables = JSON.parse(body.get("ContentVariables"));
  assert.equal(variables["2"], "October 20, 2026");
  assert.match(variables["3"], /^yp:[0-9a-f]{32}:morning$/);
  assert.match(variables["4"], /^yp:[0-9a-f]{32}:before_noon$/);
  assert.match(variables["5"], /^yp:[0-9a-f]{32}:before_evening$/);
  assert.equal((await f.survey.process()).sent, 0);
  assert.equal(f.requests.length, 1);
});

test("separate manual registrations sharing a phone and arrival date receive one family question", async () => {
  const f = fixture({ guests: [
    guest("Alex Patel", { registrationId: "MAN-1" }),
    guest("Sam Patel", { registrationId: "MAN-2", phone: "2025550123", isPrimaryContact: false }),
  ] });
  const result = await f.survey.process();
  assert.equal(result.families, 1);
  assert.equal(result.sent, 1);
  assert.equal(f.invites().length, 1);
  assert.deepEqual(f.invites()[0].members.map(member => member.identity), ["Alex Patel", "Sam Patel"]);
  assert.equal((await f.survey.receive(webhook(f.invites()[0]))).answered, 2);
  assert.deepEqual(f.answers.map(answer => answer.identity), ["Alex Patel", "Sam Patel"]);
  assert.equal((await f.survey.process()).sent, 1, "the next family question is fasting");
  assert.deepEqual(f.invites().map(invite => invite.question), ["arrival", "fasting"]);
});

test("roster updates while checking approval use the current family", async () => {
  const guests = [guest("Alex Patel")];
  const f = fixture({ guests, approvalFetchImpl: async url => {
    if (guests.length === 1) guests.push(guest("New Patel", { registrationId: "MAN-2", isPrimaryContact: false }));
    return Response.json({ account_sid: ACCOUNT, sid: new URL(url).pathname.split("/")[3], whatsapp: { status: "approved" } });
  } });
  assert.equal((await f.survey.process()).sent, 1);
  assert.deepEqual(f.invites()[0].members.map(member => member.identity), ["Alex Patel", "New Patel"]);
});

test("roster changes during invite hashing cannot claim or send a stale family question", async () => {
  let f, changed = false;
  f = fixture({ onGet: kind => {
    if (kind === "survey-invite" && !changed) {
      changed = true;
      queueMicrotask(() => f.guests.push(guest("New Patel", { registrationId: "MAN-3", isPrimaryContact: false })));
    }
  } });
  assert.equal((await f.survey.process()).sent, 0);
  assert.equal(f.invites().length, 0);
  assert.equal(f.requests.length, 0);
  assert.equal((await f.survey.process()).sent, 1);
  assert.deepEqual(f.invites()[0].members.map(member => member.identity), ["Alex Patel", "New Patel", "Sam Patel"]);
});

test("a quick reply updates every captured family member atomically, is idempotent, and advances to fasting", async () => {
  const f = fixture();
  await f.survey.process();
  const arrival = f.invites()[0];
  const params = webhook(arrival);
  assert.deepEqual(await f.survey.receive(params), { status: "accepted", question: "arrival", value: "before_noon", answered: 2 });
  assert.deepEqual(f.answers.map(answer => [answer.identity, answer.question, answer.value]), [
    ["Alex Patel", "arrival", "before_noon"],
    ["Sam Patel", "arrival", "before_noon"],
  ]);
  assert.equal(f.invites()[0].status, "answered");
  assert.equal(f.schedules(), 1);
  assert.deepEqual(await f.survey.receive(params), { status: "duplicate", outcome: "accepted" });
  assert.equal(f.answers.length, 2);

  const next = await f.survey.process();
  assert.equal(next.sent, 1);
  const fasting = f.invites().find(invite => invite.question === "fasting");
  assert.equal(fasting.contentSid, FASTING_SID);
  assert.match(fasting.variables["3"], /:no$/);
  assert.match(fasting.variables["4"], /:lunch$/);
  assert.match(fasting.variables["5"], /:dinner$/);
  const fastingParams = webhook(fasting, { MessageSid: `SM${"8".repeat(32)}`, ButtonPayload: fasting.variables["5"], ButtonText: "Yes (dinner)" });
  assert.equal((await f.survey.receive(fastingParams)).value, "dinner");
  assert.equal(f.answers.filter(answer => answer.question === "fasting").length, 2);
  const summary = f.survey.summary();
  assert.equal(typeof summary?.then, "undefined", "dashboard summaries are synchronous");
  assert.deepEqual(summary, {
    families: 1,
    invitations: { answered: 2 },
    responses: { total: 2, arrival: 1, fasting: 1, ignored: 0 },
    optouts: 0,
    templates: {
      status: "approved",
      checkedAt: "2026-10-15T16:00:00.000Z",
      nextCheckAt: "2026-10-16T16:00:00.000Z",
      arrival: { contentSid: ARRIVAL_SID, status: "approved" },
      fasting: { contentSid: FASTING_SID, status: "approved" },
    },
  });
});

test("changed family membership stales the old invitation and never applies its answer to new members", async () => {
  const f = fixture();
  await f.survey.process();
  const old = f.invites()[0];
  f.guests.push(guest("New Patel", { isPrimaryContact: false }));
  const result = await f.survey.receive(webhook(old));
  assert.deepEqual(result, { status: "ignored", reason: "stale" });
  assert.equal(f.answers.length, 0);
  assert.equal(f.invites()[0].status, "stale");
  assert.equal(f.replies()[0].outcome, "ignored_stale");
  assert.equal((await f.survey.process()).sent, 1);
  const fresh = f.invites().find(invite => invite.status === "accepted");
  assert.notEqual(fresh.id, old.id);
  assert.deepEqual(fresh.members.map(member => member.identity), ["Alex Patel", "New Patel", "Sam Patel"]);
});

test("past arrival dates skip the arrival question while fasting remains eligible through the inclusive departure date", async () => {
  const f = fixture({ guests: [guest("Today Guest", { arrivalDate: "2026-10-14", departureDate: "2026-10-15" }), guest("Departed Guest", { registrationId: "R2", arrivalDate: "2026-10-13", departureDate: "2026-10-14" })] });
  const result = await f.survey.process();
  assert.equal(result.families, 1);
  assert.equal(result.sent, 1);
  assert.deepEqual(f.invites().map(invite => invite.question), ["fasting"]);
  f.setNow("2026-10-16T16:00:00Z");
  assert.equal((await f.survey.process()).families, 0);
  assert.equal(f.invites()[0].status, "expired");
  assert.deepEqual((await f.survey.summary()).families, 0);
});

test("ambiguous Twilio outcomes enter review and can never auto-resend", async () => {
  let calls = 0;
  const f = fixture({ fetchImpl: async () => { calls++; throw new Error("timeout"); } });
  assert.deepEqual(await f.survey.process(), { status: "attention", families: 1, sent: 0, review: 1, skippedOptOut: 0 });
  assert.equal(f.invites()[0].status, "review");
  assert.equal((await f.survey.process()).sent, 0);
  assert.equal(calls, 1);
});

test("STOP suppresses all future family invitations for the phone", async () => {
  const f = fixture();
  await f.survey.process();
  const stop = webhook(f.invites()[0], { MessageSid: `SM${"7".repeat(32)}`, Body: "STOP", ButtonPayload: "", ButtonText: "" });
  assert.deepEqual(await f.survey.receive(stop), { status: "opted_out" });
  assert.equal(f.optouts().length, 1);
  assert.equal(f.invites()[0].status, "opted_out");
  assert.equal(f.replies()[0].outcome, "opted_out");
  f.guests.push(guest("Later Guest", { registrationId: "R2", arrivalDate: "2026-10-22", departureDate: "2026-10-25" }));
  const next = await f.survey.process();
  assert.equal(next.sent, 0);
  assert.ok(next.skippedOptOut >= 1);
  assert.equal((await f.survey.summary()).optouts, 1);
});

test("route authentication and ButtonPayload validation reject free text and mismatched senders", async () => {
  const f = fixture();
  await f.survey.process();
  const invite = f.invites()[0];
  const wrongAccount = webhook(invite, { AccountSid: `AC${"0".repeat(32)}` });
  assert.deepEqual(await f.survey.receive(wrongAccount), { status: "rejected", reason: "invalid_route" });
  assert.equal(f.replies().length, 0);
  const freeText = webhook(invite, { MessageSid: `SM${"6".repeat(32)}`, Body: invite.variables["4"], ButtonPayload: "" });
  assert.deepEqual(await f.survey.receive(freeText), { status: "ignored", reason: "payload" });
  assert.equal(f.answers.length, 0);
  assert.equal(f.replies().length, 0, "ordinary Chatwoot/free-text traffic is not copied into survey storage");
  for (const [index, overrides] of [
    { From: "whatsapp:+12025550124" },
    { ButtonPayload: `yp:${"0".repeat(32)}:before_noon` },
    { ButtonPayload: `yp:${invite.token}:dinner` },
    { ButtonPayload: `${invite.variables["4"]}:extra` },
  ].entries()) {
    const params = webhook(invite, { MessageSid: `SM${String(index).repeat(32)}`, ...overrides });
    assert.deepEqual(await f.survey.receive(params), { status: "ignored", reason: "payload" });
  }
  assert.equal(f.answers.length, 0, "only a matching sender and an exact invitation choice can update meals");
});

test("a later exact-token button response can correct an answered family response", async () => {
  const f = fixture();
  await f.survey.process();
  const invite = f.invites()[0];
  await f.survey.receive(webhook(invite));
  const correction = webhook(invite, { MessageSid: `SM${"5".repeat(32)}`, ButtonPayload: invite.variables["3"], ButtonText: "Morning" });
  assert.deepEqual(await f.survey.receive(correction), { status: "accepted", question: "arrival", value: "morning", answered: 2 });
  assert.deepEqual(f.answers.slice(-2).map(answer => [answer.identity, answer.value]), [["Alex Patel", "morning"], ["Sam Patel", "morning"]]);
  assert.equal(f.invites()[0].answer, "morning");
  assert.equal(f.replies().length, 2);
});

test("alarm work sends at most ten invitations and rechecks the admin setting immediately before claims", async () => {
  const many = Array.from({ length: 12 }, (_, index) => guest(`Guest ${index}`, {
    registrationId: `R${index}`,
    primaryContact: `Guest ${index}`,
    phone: `+1202555${String(index).padStart(4, "0")}`,
  }));
  const bounded = fixture({ guests: many });
  const result = await bounded.survey.process();
  assert.equal(result.families, 12);
  assert.equal(result.sent, 10);
  assert.equal(bounded.requests.length, 10);

  let checks = 0;
  const switchedOff = fixture({ getSettings: () => ({ automaticQuestionsEnabled: ++checks === 1 }) });
  assert.equal((await switchedOff.survey.process()).sent, 0);
  assert.equal(switchedOff.requests.length, 0);
  assert.equal(switchedOff.invites().length, 0);
});

test("the explicit admin setting and complete unique manual records gate all sends", async () => {
  const disabled = fixture({ enabled: false });
  assert.deepEqual(await disabled.survey.process(), { status: "disabled", sent: 0, review: 0 });
  const invalid = fixture({ guests: [
    guest("online", { isManualRegistration: false }),
    guest("duplicate"), guest("duplicate"),
    guest("undated", { departureDate: "" }),
    guest("invalid date", { arrivalDate: "9999-99-99", departureDate: "9999-99-99" }),
    guest("bad phone", { phone: "unknown" }),
    guest("cancelled", { status: "Cancelled" }),
  ] });
  assert.equal((await invalid.survey.process()).families, 0);
  assert.equal(invalid.requests.length, 0);
});
