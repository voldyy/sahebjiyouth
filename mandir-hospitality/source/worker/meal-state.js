import { getForecast, MEAL_CUTOFFS } from "../src/lib/mealForecast.js";

const meals = new Set(Object.keys(MEAL_CUTOFFS));
const validDay = day => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
const activeOn = (guest, day) => validDay(guest.arrivalDate) && validDay(guest.departureDate) && guest.arrivalDate <= day && guest.departureDate >= day && !["Cancelled", "Departed"].includes(guest.status) && (guest.stay !== "Day visitor" || day === guest.arrivalDate);

// These operational records belong to SQLite. Sheet imports cannot overwrite
// a dining correction or a received answer, and no registration fields change.
export function createMealState({ sql, bumpRevision, configured, automaticDefault = false, extraGuests = () => [] }) {
  const get = (kind, id) => {
    const row = sql.exec("SELECT data FROM meal_records WHERE kind=? AND id=?", kind, id).toArray()[0];
    return row ? JSON.parse(row.data) : null;
  };
  const records = kind => sql.exec("SELECT data FROM meal_records WHERE kind=? ORDER BY id", kind).toArray().map(row => JSON.parse(row.data));
  const put = (kind, id, data) => sql.exec("INSERT INTO meal_records(kind,id,data) VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data", kind, id, JSON.stringify(data));
  const remove = (kind, id) => sql.exec("DELETE FROM meal_records WHERE kind=? AND id=?", kind, id);
  const settings = () => ({ teamEditingEnabled: true, automaticQuestionsEnabled: automaticDefault, revision: "", ...get("settings", "current") });
  const augment = guests => {
    const overrides = records("override");
    return guests.map(guest => {
      const preference = get("preference", guest.sourceIdentity);
      return { ...guest,
        mealPreference: preference ? { arrival: preference.arrival || "", arrivalDate: preference.arrivalDate || "", fasting: preference.fasting || "" } : {},
        mealOverrides: overrides.filter(row => row.identity === guest.sourceIdentity).map(({ day, meal, included, revision }) => ({ day, meal, included, revision })),
      };
    });
  };
  const snapshot = (role, guests, survey) => ({
    settings: settings(), plans: records("plan"), localDiners: augment(extraGuests()),
    ...(role === "admin" ? {
      survey: { ...survey, configured: configured(), responses: guests.filter(g => g.isManualRegistration).map(g => {
        const p = get("preference", g.sourceIdentity) || {};
        return { identity: g.sourceIdentity, name: g.name, arrivalDate: g.arrivalDate,
          arrival: p.arrivalDate === g.arrivalDate ? p.arrival || "" : "", fasting: p.fasting || "",
          arrivalAnsweredAt: p.arrivalAnsweredAt || "", fastingAnsweredAt: p.fastingAnsweredAt || "" };
      }) },
    } : {}),
  });
  function mutate(req, guests, role) {
    const currentSettings = settings();
    if (req.action === "meal-settings") {
      if (role !== "admin") throw Error("Admin access is required to change meal settings.");
      if (typeof req.teamEditingEnabled !== "boolean" || typeof req.automaticQuestionsEnabled !== "boolean") throw Error("Choose valid meal settings.");
      if (req.automaticQuestionsEnabled && !configured()) throw Error("WhatsApp templates and reply verification must be configured before automatic questions can be enabled.");
      if (req.expectedRevision !== currentSettings.revision) throw Error("Meal settings changed. Refresh before saving.");
      const next = { teamEditingEnabled: req.teamEditingEnabled, automaticQuestionsEnabled: req.automaticQuestionsEnabled, revision: crypto.randomUUID() };
      put("settings", "current", next);
      put("audit", req.requestId, { action: req.action, before: currentSettings, after: next, at: new Date().toISOString(), role });
      return;
    }
    if (role !== "admin" && !currentSettings.teamEditingEnabled) throw Error("Admin access is required to change dining counts. Team editing is disabled.");
    if (!validDay(req.day) || !meals.has(req.meal)) throw Error("Choose a valid meal and date.");
    const kind = req.action === "meal-plan" ? "plan" : "override";
    const id = JSON.stringify(kind === "plan" ? [req.day, req.meal] : [req.identity, req.day, req.meal]);
    const before = get(kind, id);
    if (req.expectedRevision !== (before?.revision || "")) throw Error("This dining record changed. Refresh before saving.");
    let next;
    if (kind === "plan") {
      if (!Number.isInteger(req.adjustment) || Math.abs(req.adjustment) > 5000 || !Number.isInteger(req.buffer) || req.buffer < 0 || req.buffer > 50) throw Error("Enter a whole headcount adjustment within 5,000 and a buffer from 0% to 50%.");
      next = { day: req.day, meal: req.meal, adjustment: req.adjustment, buffer: req.buffer };
    } else {
      const matches = [...guests, ...extraGuests()].filter(g => g.sourceIdentity === req.identity);
      if (matches.length !== 1 || !matches[0].sourceWritable || !activeOn(matches[0], req.day)) throw Error("This attendee or their stay changed. Refresh before changing their meal.");
      if (req.included !== null && typeof req.included !== "boolean") throw Error("Choose whether this attendee is dining.");
      next = { identity: req.identity, day: req.day, meal: req.meal, included: req.included };
    }
    next.revision = crypto.randomUUID();
    put(kind, id, next);
    put("audit", req.requestId, { action: req.action, before, after: next, at: new Date().toISOString(), role });
  }
  function saveAnswer(identity, question, value, arrivalDate, messageSid) {
    if (!({ arrival: ["morning", "before_noon", "before_evening"], fasting: ["no", "lunch", "dinner"] })[question]?.includes(value)) throw Error("Invalid meal answer.");
    const previous = get("preference", identity) || {};
    const next = { ...previous, identity, [question]: value, [`${question}AnsweredAt`]: new Date().toISOString(), [`${question}MessageSid`]: messageSid, revision: crypto.randomUUID() };
    if (question === "arrival") next.arrivalDate = arrivalDate;
    put("preference", identity, next);
    bumpRevision();
  }
  function counts(guests, day) {
    if (!validDay(day)) throw Error("Choose a valid meal date.");
    const decorated = augment([...guests, ...extraGuests()]), plans = records("plan");
    const counts = Object.fromEntries(Object.entries(MEAL_CUTOFFS).map(([meal, cutoff]) => {
      const plan = plans.find(p => p.day === day && p.meal === meal) || { adjustment: 0, buffer: 10 };
      return [meal, getForecast(decorated, { id: meal, cutoff }, plan, day).expected];
    }));
    return { day, counts, rosterSize: guests.length, excludedUndated: guests.filter(g => !["Cancelled", "Departed"].includes(g.status) && (!g.arrivalDate || !g.departureDate)).length };
  }
  return { get, records, put, remove, settings, augment, snapshot, mutate, saveAnswer, counts };
}
