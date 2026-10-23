// Registrations from the public "local mandal" meals form (www.anoopam.us/diwali). They live in SQLite next to the other
// meal records and become lightweight "Local" diners for the Yogi Prasad counts; no registration sheet rows are created.
import { MEAL_CUTOFFS } from "../src/lib/mealForecast.js";

// The form is reusable, so it accepts any day from today up to this many days ahead.
export const HORIZON_DAYS = 120;
export const MAX_REGISTRATIONS = 800;
export const MAX_NAMES = 12;
const MEALS = Object.keys(MEAL_CUTOFFS);
const NAME = /^[\p{L}\p{M}][\p{L}\p{M}\p{N} .'’-]*$/u;
const WRITE_LIMIT = { perClient: 12, global: 300, windowMs: 3600000 };
const READ_LIMIT = { perClient: 60, windowMs: 3600000 };

// Errors that are safe and useful to show to the person filling in the form.
export class FormError extends Error {}

const validDay = day => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
const shiftDay = (day, amount) => new Date(Date.parse(`${day}T12:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
const daysBetween = (from, to) => { const days = []; for (let day = from; day <= to && days.length <= HORIZON_DAYS + 1; day = shiftDay(day, 1)) days.push(day); return days; };
// Older registrations stored a single From-To range; newer ones store the exact days.
export const daysOf = record => Array.isArray(record.days) ? record.days : daysBetween(record.from, record.to);
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
const sha256 = async value => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
// Short synchronous hash so a person keeps the same identity (and any dining override) when the list is edited.
const fnv = text => { let h = 0x811c9dc5; for (const c of text) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
const safeEqual = (a, b) => { if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

export function cleanName(value) {
  const name = String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60 || !NAME.test(name)) throw new FormError("Enter each name using letters only.");
  return name;
}

export function normalize(input, today, previous = []) {
  if (!Array.isArray(input.names) || input.names.length < 1 || input.names.length > MAX_NAMES) throw new FormError(`Enter 1 to ${MAX_NAMES} names.`);
  const names = [], seen = new Set();
  for (const raw of input.names) {
    const name = cleanName(raw), key = name.toLowerCase();
    if (seen.has(key)) throw new FormError("Each name should appear once.");
    seen.add(key); names.push(name);
  }
  let days;
  if (Array.isArray(input.days)) days = input.days;
  else if (validDay(input.from) && validDay(input.to)) {
    if (input.from > input.to) throw new FormError("The last day is before the first day.");
    days = daysBetween(input.from, input.to);
  } else throw new FormError("Choose your days.");
  if (!days.length || days.length > HORIZON_DAYS + 1 || days.some(day => !validDay(day))) throw new FormError("Choose your days.");
  days = [...new Set(days)].sort();
  if (days.at(-1) > shiftDay(today, HORIZON_DAYS)) throw new FormError("Choose days within the next four months.");
  // Days that already passed can stay on an existing registration, but cannot be added.
  if (days.some(day => day < today && !previous.includes(day))) throw new FormError("Those dates have passed.");
  if (!Array.isArray(input.meals) || !input.meals.length || input.meals.some(m => !MEALS.includes(m))) throw new FormError("Choose at least one meal.");
  return { names, days, from: days[0], to: days.at(-1), meals: MEALS.filter(m => input.meals.includes(m)) };
}

export function createLocalMeals({ get, put, remove, records, bumpRevision, secret, today, now = Date.now }) {
  const buckets = new Map();
  const hit = (key, limit, windowMs) => {
    const t = now(), entry = buckets.get(key);
    if (!entry || t - entry.start >= windowMs) { buckets.set(key, { start: t, count: 1 }); if (buckets.size > 5000) for (const [k, v] of buckets) if (t - v.start >= windowMs) buckets.delete(k); return true; }
    return ++entry.count <= limit;
  };
  const tooMany = () => new FormError("Too many attempts. Please try again later.");
  const limitWrite = client => { if (!hit(`w:${client}`, WRITE_LIMIT.perClient, WRITE_LIMIT.windowMs) || !hit("w:all", WRITE_LIMIT.global, WRITE_LIMIT.windowMs)) throw tooMany(); };
  const limitRead = client => { if (!hit(`r:${client}`, READ_LIMIT.perClient, READ_LIMIT.windowMs)) throw tooMany(); };
  // The edit key is derived from the registration id, so a repeated request returns the same key and none is stored.
  const keyFor = async id => {
    if (!secret()) throw new Error("Local meal registration is not configured.");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`local-meals:${id}`)));
  };
  const authorize = async req => {
    const id = typeof req.id === "string" && /^[0-9a-f]{24}$/.test(req.id) ? req.id : "";
    const record = id ? get("local", id) : null;
    if (!record || !safeEqual(await keyFor(id), String(req.editKey || ""))) throw new FormError("This registration could not be found.");
    return record;
  };
  const view = record => ({ id: record.id, names: record.names, days: daysOf(record), from: record.from, to: record.to, meals: record.meals });

  async function submit(req, client = "") {
    limitWrite(client);
    // A filled-in hidden field means a bot: report success without storing anything.
    if (req.website) return { ok: true, ignored: true };
    if (!/^[a-zA-Z0-9-]{20,80}$/.test(req.requestId || "")) throw new FormError("Please try again.");
    const updating = !!req.id;
    const current = updating ? await authorize(req) : null;
    const data = normalize(req, today(), current ? daysOf(current) : []);
    const id = updating ? current.id : (await sha256(`local:${req.requestId}`)).slice(0, 24);
    const existing = get("local", id);
    if (!updating && existing) {
      // The same request repeated (a double tap or retry) returns the original registration.
      if (JSON.stringify([existing.names, daysOf(existing), existing.meals]) !== JSON.stringify([data.names, data.days, data.meals])) throw new FormError("Please try again.");
      return { ok: true, id, editKey: await keyFor(id), registration: view(existing) };
    }
    if (!updating && records("local").length >= MAX_REGISTRATIONS) throw new FormError("Registration is full.");
    const at = new Date(now()).toISOString();
    const record = { id, ...data, createdAt: existing?.createdAt || at, updatedAt: at, revision: crypto.randomUUID() };
    put("local", id, record);
    bumpRevision();
    return { ok: true, id, editKey: await keyFor(id), registration: view(record) };
  }
  async function lookup(req, client = "") {
    limitRead(client);
    return { ok: true, registration: view(await authorize(req)) };
  }
  async function cancel(req, client = "") {
    limitWrite(client);
    const record = await authorize(req);
    remove("local", record.id);
    bumpRevision();
    return { ok: true };
  }
  async function handle(req, client = "") {
    try {
      if (req.action === "local-meals-submit") return await submit(req, client);
      if (req.action === "local-meals-lookup") return await lookup(req, client);
      if (req.action === "local-meals-cancel") return await cancel(req, client);
      throw new FormError("Unknown action.");
    } catch (error) {
      if (error instanceof FormError) return { ok: false, error: error.message };
      console.error(JSON.stringify({ event: "local_meals_failed" }));
      return { ok: false, error: "Please try again." };
    }
  }
  // Each person becomes a diner for every selected meal on each of the chosen days.
  const diners = () => records("local").flatMap(record => record.names.map(name => ({
    sourceIdentity: `local:${record.id}:${fnv(name.toLowerCase())}`, registrationId: `LOCAL-${record.id}`, name, city: "Local",
    status: "Registered", stay: "Local", arrivalDate: daysOf(record)[0], departureDate: daysOf(record).at(-1), arrivalTime: "", departureTime: "",
    sourceWritable: true, count: 1, isLocalDiner: true, localMeals: record.meals, localDays: daysOf(record),
  })));
  return { handle, diners, submit, lookup, cancel };
}
