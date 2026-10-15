const ZONE = "America/New_York";
const SENDER = "whatsapp:+16105021100";
const MESSAGING_SERVICE_SID = "MG88f1fc4ecdb340549c259343d48d7f54";
const INVITES = "survey-invite";
const REPLIES = "survey-reply";
const OPTOUTS = "survey-optout";
const CONFIG = "survey-config";
const APPROVAL_RETRY_MS = 5 * 60 * 1000;
const APPROVAL_CACHE_MS = 24 * 60 * 60 * 1000;
const APPROVAL_STATUSES = new Set(["unsubmitted", "received", "pending", "approved", "rejected", "paused", "disabled", "deleted", "in_appeal"]);
const OUTSTANDING = new Set(["sending", "accepted", "review"]);
const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const QUESTIONS = {
  arrival: {
    sid: "MEAL_ARRIVAL_CONTENT_SID",
    choices: ["morning", "before_noon", "before_evening"],
  },
  fasting: {
    sid: "MEAL_FASTING_CONTENT_SID",
    choices: ["no", "lunch", "dinner"],
  },
};

const encoder = new TextEncoder();
const text = value => String(value ?? "").trim();
const isoDay = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const identityOf = guest => text(guest.sourceIdentity || guest.identity || guest.id);
const activeStatus = guest => !["Cancelled", "Departed"].includes(guest.status);

function parameter(params, name) {
  if (typeof params?.get === "function") return text(params.get(name));
  return text(params?.[name]);
}

function storedRecords(value) {
  if (value instanceof Map) return [...value].map(([id, data]) => ({ id, data }));
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    if (Array.isArray(entry) && entry.length >= 2) return [{ id: text(entry[0]), data: entry[1] }];
    if (!entry || typeof entry !== "object") return [];
    if (Object.hasOwn(entry, "data")) return [{ id: text(entry.id || entry.key), data: entry.data }];
    return [{ id: text(entry.id || entry.key || entry.rowKey || entry.messageSid), data: entry }];
  }).filter(entry => entry.id && entry.data && typeof entry.data === "object");
}

function todayEastern(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatDay(day) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));
}

export function whatsappAddress(value) {
  const raw = text(value).replace(/^whatsapp:/i, "");
  if (!raw || !/^[+\d ().-]+$/.test(raw)) return "";
  let digits = raw.replace(/\D/g, "");
  if (!raw.startsWith("+") && digits.length === 10) digits = `1${digits}`;
  if (!raw.startsWith("+") && !(digits.length === 11 && digits.startsWith("1"))) return "";
  return /^[1-9]\d{7,14}$/.test(digits) ? `whatsapp:+${digits}` : "";
}

async function hash(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function familyName(members) {
  const primary = members.find(member => member.isPrimaryContact) || members.find(member => text(member.primaryContact));
  const primaryName = text(primary?.primaryContact || primary?.name);
  const names = members.map(member => text(member.name)).filter(Boolean);
  if (primaryName && members.length > 1) return `${primaryName} family: ${names.join(", ")}`.slice(0, 1000);
  return names.join(", ").slice(0, 1000);
}

function memberSnapshot(guest, phone) {
  return {
    identity: identityOf(guest),
    name: text(guest.name),
    arrivalDate: text(guest.arrivalDate),
    departureDate: text(guest.departureDate),
    phone,
  };
}

function memberFingerprint(members) {
  return JSON.stringify(members.map(member => [member.identity, member.name, member.arrivalDate, member.departureDate, member.phone]));
}

function validGuests(guests, day) {
  const identities = new Map();
  for (const guest of guests || []) {
    const identity = identityOf(guest);
    if (identity) identities.set(identity, (identities.get(identity) || 0) + 1);
  }
  return (guests || []).filter(guest => {
    const identity = identityOf(guest);
    const arrivalDate = text(guest.arrivalDate), departureDate = text(guest.departureDate);
    return guest.isManualRegistration === true && guest.sourceWritable !== false && identities.get(identity) === 1 &&
      identity && text(guest.registrationId) && text(guest.name) && activeStatus(guest) &&
      isoDay(arrivalDate) && isoDay(departureDate) && departureDate >= arrivalDate && departureDate >= day &&
      !!whatsappAddress(guest.phone);
  });
}

function familyGroups(guests, day) {
  const groups = new Map();
  for (const guest of validGuests(guests, day)) {
    const phone = whatsappAddress(guest.phone);
    const arrivalDate = text(guest.arrivalDate);
    const key = JSON.stringify([phone, arrivalDate]);
    if (!groups.has(key)) groups.set(key, { key, phone, arrivalDate, guests: [] });
    groups.get(key).guests.push(guest);
  }
  return [...groups.values()].map(group => {
    group.guests.sort((a, b) => identityOf(a).localeCompare(identityOf(b)));
    group.registrationId = JSON.stringify([...new Set(group.guests.map(guest => text(guest.registrationId)))].sort());
    group.members = group.guests.map(guest => memberSnapshot(guest, group.phone));
    group.memberFingerprint = memberFingerprint(group.members);
    group.name = familyName(group.guests);
    group.lastDeparture = group.members.reduce((latest, member) => member.departureDate > latest ? member.departureDate : latest, "");
    return group;
  }).filter(group => group.name).sort((a, b) => a.phone.localeCompare(b.phone) || a.arrivalDate.localeCompare(b.arrivalDate) || a.registrationId.localeCompare(b.registrationId) || a.memberFingerprint.localeCompare(b.memberFingerprint));
}

async function inviteId(group, question) {
  return `yp-${await hash(JSON.stringify([group.registrationId, group.phone, group.arrivalDate, group.memberFingerprint, question]))}`;
}

async function optoutId(phone) {
  return `phone-${await hash(phone)}`;
}

function sameCapturedGroup(invite, group) {
  return !!group && invite.registrationId === group.registrationId && invite.phone === group.phone &&
    invite.arrivalDate === group.arrivalDate && invite.memberFingerprint === group.memberFingerprint;
}

function basicConfig(env) {
  if (!/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID || "") ||
      !/^SK[0-9a-f]{32}$/i.test(env.TWILIO_API_KEY || "") || !env.TWILIO_API_SECRET ||
      env.TWILIO_WHATSAPP_FROM !== SENDER) throw new Error("Meal survey Twilio configuration is invalid.");
  for (const question of Object.values(QUESTIONS)) {
    if (!/^HX[0-9a-f]{32}$/i.test(env[question.sid] || "")) throw new Error("Meal survey templates are not configured.");
  }
}

function messageAccepted(result) {
  return /^(SM|MM)[0-9a-f]{32}$/i.test(result?.sid || "") && ["accepted", "queued", "sending", "sent", "delivered", "read"].includes(result?.status);
}

async function templateApproval(env, contentSid, fetchImpl) {
  const response = await fetchImpl(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`, {
    method: "GET",
    headers: { Authorization: `Basic ${btoa(`${env.TWILIO_API_KEY}:${env.TWILIO_API_SECRET}`)}` },
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Template approval is unavailable.");
  const result = await response.json();
  const status = result?.whatsapp?.status;
  if (result?.sid !== contentSid || result?.account_sid !== env.TWILIO_ACCOUNT_SID || !APPROVAL_STATUSES.has(status)) {
    throw new Error("Template approval is unavailable.");
  }
  return { contentSid, status };
}

async function sendInvite(env, invite, fetchImpl) {
  const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${env.TWILIO_API_KEY}:${env.TWILIO_API_SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      From: SENDER,
      To: invite.phone,
      MessagingServiceSid: MESSAGING_SERVICE_SID,
      ContentSid: invite.contentSid,
      ContentVariables: JSON.stringify(invite.variables),
      ValidityPeriod: "3600",
    }),
    signal: AbortSignal.timeout(15000),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error("Twilio outcome is uncertain."); }
  if (!response.ok || !messageAccepted(result)) throw new Error("Twilio did not confirm the meal survey invitation.");
  return result;
}

function logData(params, outcome, extra = {}) {
  const messageSid = parameter(params, "MessageSid");
  return {
    id: messageSid,
    messageSid,
    accountSid: parameter(params, "AccountSid"),
    from: whatsappAddress(parameter(params, "From")),
    to: whatsappAddress(parameter(params, "To")),
    buttonPayload: parameter(params, "ButtonPayload").slice(0, 200),
    buttonText: parameter(params, "ButtonText").slice(0, 100),
    outcome,
    ...extra,
  };
}

export function createMealSurvey({
  env,
  getGuests,
  getSettings,
  records,
  get,
  put,
  transaction,
  saveAnswer,
  schedule,
  now = () => new Date(),
  fetchImpl = fetch,
}) {
  const inviteRecords = () => storedRecords(records(INVITES));
  const replyRecords = () => storedRecords(records(REPLIES));
  const optoutRecords = () => storedRecords(records(OPTOUTS));

  function templateSummary() {
    const templates = { status: "unchecked", checkedAt: null, nextCheckAt: null };
    for (const [question, config] of Object.entries(QUESTIONS)) {
      templates[question] = { contentSid: text(env[config.sid]), status: "unchecked" };
    }
    try { basicConfig(env); } catch {
      templates.status = "unavailable";
      return templates;
    }
    const cached = get(CONFIG, "templates");
    if (cached?.accountSid !== env.TWILIO_ACCOUNT_SID ||
        !Number.isFinite(Date.parse(cached.checkedAt)) || !Number.isFinite(Date.parse(cached.nextCheckAt)) ||
        Object.keys(QUESTIONS).some(question => cached[question]?.contentSid !== templates[question].contentSid ||
          !(APPROVAL_STATUSES.has(cached[question]?.status) || cached[question]?.status === "unavailable"))) return templates;
    for (const question of Object.keys(QUESTIONS)) templates[question].status = cached[question].status;
    templates.status = Object.keys(QUESTIONS).some(question => templates[question].status === "unavailable") ? "unavailable" :
      Object.keys(QUESTIONS).every(question => templates[question].status === "approved") ? "approved" : "pending";
    templates.checkedAt = cached.checkedAt;
    templates.nextCheckAt = cached.nextCheckAt;
    return templates;
  }

  function approvalFresh(templates) {
    const checkedAt = Date.parse(templates.checkedAt), nextCheckAt = Date.parse(templates.nextCheckAt);
    const time = now().getTime();
    const maxAge = templates.status === "approved" ? APPROVAL_CACHE_MS : APPROVAL_RETRY_MS;
    return checkedAt <= time && time - checkedAt < maxAge && time < nextCheckAt;
  }

  async function checkTemplates() {
    const cached = templateSummary();
    if (approvalFresh(cached)) return cached;
    const questions = Object.entries(QUESTIONS);
    // Both checks finish before a status is stored or any message can be claimed.
    const results = await Promise.allSettled(questions.map(([, config]) => templateApproval(env, env[config.sid], fetchImpl)));
    const templates = { accountSid: env.TWILIO_ACCOUNT_SID, checkedAt: now().toISOString() };
    results.forEach((result, index) => {
      const [question, config] = questions[index];
      templates[question] = result.status === "fulfilled" ? result.value : { contentSid: env[config.sid], status: "unavailable" };
    });
    const approved = questions.every(([question]) => templates[question].status === "approved");
    templates.nextCheckAt = new Date(Date.parse(templates.checkedAt) + (approved ? APPROVAL_CACHE_MS : APPROVAL_RETRY_MS)).toISOString();
    transaction(() => put(CONFIG, "templates", templates));
    return templateSummary();
  }

  function currentState() {
    const day = todayEastern(now());
    const groups = familyGroups(getGuests(), day);
    return { day, groups, byKey: new Map(groups.map(group => [group.key, group])) };
  }

  async function cleanupInvites(state) {
    for (const { id, data: invite } of inviteRecords()) {
      if (!OUTSTANDING.has(invite.status)) continue;
      const group = state.byKey.get(invite.groupKey);
      let status = "";
      if (invite.question === "arrival" && state.day > invite.arrivalDate) status = "expired";
      else if (invite.question === "fasting" && state.day > text(invite.lastDeparture)) status = "expired";
      else if (!sameCapturedGroup(invite, group)) status = "stale";
      if (status) transaction(() => put(INVITES, id, { ...invite, status, closedAt: now().toISOString() }));
    }
  }

  async function nextQuestion(group, state) {
    for (const question of ["arrival", "fasting"]) {
      if (question === "arrival" && state.day > group.arrivalDate) continue;
      if (question === "fasting" && state.day > group.lastDeparture) continue;
      const id = await inviteId(group, question);
      const invite = get(INVITES, id);
      if (!invite) return { id, question };
      if (OUTSTANDING.has(invite.status)) return null;
      if (invite.status !== "answered" && invite.status !== "expired") return { id, question };
    }
    return null;
  }

  function claim(capturedGroup, id, question, phoneOptoutId) {
    let invite = null;
    transaction(() => {
      // External I/O and hashing yield to roster updates. Revalidate immediately
      // before the durable claim, with no await between these reads and the send.
      if (getSettings()?.automaticQuestionsEnabled !== true || get(OPTOUTS, phoneOptoutId)) return;
      const templates = templateSummary();
      if (templates.status !== "approved" || !approvalFresh(templates)) return;
      const state = currentState(), group = state.byKey.get(capturedGroup.key);
      if (!sameCapturedGroup(capturedGroup, group) ||
          (question === "arrival" ? state.day > group.arrivalDate : state.day > group.lastDeparture)) return;
      if (get(INVITES, id)) return;
      if (inviteRecords().some(record => record.data.phone === group.phone && OUTSTANDING.has(record.data.status))) return;
      const token = randomToken();
      const choices = QUESTIONS[question].choices;
      const createdAt = now().toISOString();
      invite = {
        id,
        groupKey: group.key,
        registrationId: group.registrationId,
        phone: group.phone,
        name: group.name,
        question,
        arrivalDate: group.arrivalDate,
        lastDeparture: group.lastDeparture,
        members: group.members,
        memberFingerprint: group.memberFingerprint,
        token,
        choices,
        contentSid: env[QUESTIONS[question].sid],
        variables: {
          "1": group.name,
          "2": formatDay(group.arrivalDate),
          "3": `yp:${token}:${choices[0]}`,
          "4": `yp:${token}:${choices[1]}`,
          "5": `yp:${token}:${choices[2]}`,
        },
        status: "sending",
        createdAt,
      };
      put(INVITES, id, invite);
    });
    return invite;
  }

  async function process() {
    if (getSettings()?.automaticQuestionsEnabled !== true) return { status: "disabled", sent: 0, review: 0 };
    try { basicConfig(env); } catch {
      return { status: "configuration_unavailable", sent: 0, review: 0, templates: templateSummary() };
    }
    const startedAt = Date.now();
    const templates = await checkTemplates();
    if (templates.status !== "approved") {
      return { status: templates.status === "unavailable" ? "configuration_unavailable" : "awaiting_template_approval", sent: 0, review: 0, templates };
    }
    const state = currentState();
    await cleanupInvites(state);
    const blocked = new Set(inviteRecords().filter(record => OUTSTANDING.has(record.data.status)).map(record => record.data.phone));
    let sent = 0, review = 0, skippedOptOut = 0, attempted = 0;
    for (const group of state.groups) {
      if (attempted >= 10 || Date.now() - startedAt >= 20000) break;
      if (blocked.has(group.phone)) continue;
      const phoneOptoutId = await optoutId(group.phone);
      if (get(OPTOUTS, phoneOptoutId)) { skippedOptOut++; blocked.add(group.phone); continue; }
      const next = await nextQuestion(group, state);
      if (!next) continue;
      if (getSettings()?.automaticQuestionsEnabled !== true) break;
      const invite = claim(group, next.id, next.question, phoneOptoutId);
      if (!invite) { blocked.add(group.phone); continue; }
      attempted++;
      blocked.add(group.phone);
      try {
        const message = await sendInvite(env, invite, fetchImpl);
        transaction(() => {
          const current = get(INVITES, invite.id);
          if (current?.status === "sending") put(INVITES, invite.id, { ...current, status: "accepted", messageSid: message.sid, twilioStatus: message.status, acceptedAt: now().toISOString() });
        });
        sent++;
      } catch (error) {
        transaction(() => {
          const current = get(INVITES, invite.id);
          if (current?.status === "sending") put(INVITES, invite.id, { ...current, status: "review", error: text(error.message).slice(0, 200), reviewAt: now().toISOString() });
        });
        review++;
      }
    }
    return { status: review ? "attention" : "complete", families: state.groups.length, sent, review, skippedOptOut };
  }

  async function receive(params) {
    const messageSid = parameter(params, "MessageSid");
    const accountSid = parameter(params, "AccountSid");
    const from = whatsappAddress(parameter(params, "From"));
    const to = whatsappAddress(parameter(params, "To"));
    if (!/^(SM|MM)[0-9a-f]{32}$/i.test(messageSid)) return { status: "rejected", reason: "invalid_message" };
    if (env.TWILIO_WHATSAPP_FROM !== SENDER || accountSid !== env.TWILIO_ACCOUNT_SID || to !== SENDER || !from) return { status: "rejected", reason: "invalid_route" };
    const prior = get(REPLIES, messageSid);
    if (prior) return { status: "duplicate", outcome: prior.outcome };
    const receivedAt = now().toISOString();
    const body = parameter(params, "Body").toUpperCase().replace(/\s+/g, "");
    if (STOP_WORDS.has(body)) {
      const id = await optoutId(from);
      transaction(() => {
        if (get(REPLIES, messageSid)) return;
        put(OPTOUTS, id, { id, phone: from, messageSid, createdAt: receivedAt });
        for (const record of inviteRecords()) {
          if (record.data.phone === from && OUTSTANDING.has(record.data.status)) put(INVITES, record.id, { ...record.data, status: "opted_out", closedAt: receivedAt });
        }
        put(REPLIES, messageSid, { ...logData(params, "opted_out"), receivedAt });
      });
      await schedule();
      return { status: "opted_out" };
    }
    const payload = parameter(params, "ButtonPayload");
    if (!payload.startsWith("yp:")) return { status: "ignored", reason: "payload" };
    const match = payload.match(/^yp:([0-9a-f]{32}):([a-z_]+)$/);
    const token = match?.[1] || "", value = match?.[2] || "";
    const record = token ? inviteRecords().find(entry => entry.data.token === token) : null;
    if (!record || record.data.phone !== from || !(OUTSTANDING.has(record.data.status) || record.data.status === "answered") || !record.data.choices.includes(value)) {
      transaction(() => put(REPLIES, messageSid, { ...logData(params, "ignored_payload"), receivedAt }));
      return { status: "ignored", reason: "payload" };
    }
    const invite = record.data;
    const state = currentState();
    const group = state.byKey.get(invite.groupKey);
    const relevant = sameCapturedGroup(invite, group) &&
      (invite.question === "arrival" ? state.day <= invite.arrivalDate : state.day <= invite.lastDeparture);
    if (!relevant) {
      transaction(() => {
        const current = get(INVITES, record.id);
        if (current && OUTSTANDING.has(current.status)) put(INVITES, record.id, { ...current, status: "stale", closedAt: receivedAt });
        put(REPLIES, messageSid, { ...logData(params, "ignored_stale", { inviteId: record.id }), receivedAt });
      });
      await schedule();
      return { status: "ignored", reason: "stale" };
    }
    transaction(() => {
      if (get(REPLIES, messageSid)) return;
      const current = get(INVITES, record.id);
      if (!current || !(OUTSTANDING.has(current.status) || current.status === "answered")) return;
      for (const member of group.members) saveAnswer(member.identity, invite.question, value, member.arrivalDate, messageSid);
      put(INVITES, record.id, { ...current, status: "answered", answer: value, replySid: messageSid, answeredAt: receivedAt });
      put(REPLIES, messageSid, { ...logData(params, "accepted", { inviteId: record.id, question: invite.question, value, identities: group.members.map(member => member.identity) }), receivedAt });
    });
    await schedule();
    return { status: "accepted", question: invite.question, value, answered: group.members.length };
  }

  function summary() {
    const state = currentState();
    const statuses = {};
    for (const { data } of inviteRecords()) statuses[data.status] = (statuses[data.status] || 0) + 1;
    const responses = { total: 0, arrival: 0, fasting: 0, ignored: 0 };
    for (const { data } of replyRecords()) {
      responses.total++;
      if (data.outcome !== "accepted") responses.ignored++;
      else if (data.question === "arrival" || data.question === "fasting") responses[data.question]++;
    }
    return { families: state.groups.length, invitations: statuses, responses, optouts: optoutRecords().length, templates: templateSummary() };
  }

  return { process, receive, summary };
}

export const mealSurveyConstants = { ZONE, SENDER, MESSAGING_SERVICE_SID, QUESTIONS, INVITES, REPLIES, OPTOUTS, CONFIG };
