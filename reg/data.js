const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzrAMK1RkE19-yRxQ6_oORVL2Icltyh8PPiChyd12TE8X4_o-XdloQLB8BsrDvOCLol/exec";

const initialForm = {
  phone: "",
  name: "",
  email: "",
  zipCode: "",
  cityState: "",
  yajmanType: "",
  whatsappOptIn: false,
};

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.slice(0, 10);
}

function formatPhone(value) {
  const digits = normalizePhone(value);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function digitsForDisplay(phone) {
  const digits = normalizePhone(phone);
  if (digits.length !== 10) return digits;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Loaded with the page; no server request is needed for suggestions or details.
const contactDatabase = (() => {
  try {
    const database = window.REG_CONTACTS_DB;
    if (database?.version !== 1 || !Array.isArray(database.contacts)) throw Error("Invalid database");
    const byPhone = new Map();
    const ids = new Set();
    const contacts = database.contacts.map(record => {
      if (!["id", "phone", "name", "email", "zipCode", "cityState"].every(key => typeof record?.[key] === "string") ||
          !/^[0-9]{10}$/.test(record.phone) || !record.name.trim() || ids.has(record.id)) throw Error("Invalid contact");
      ids.add(record.id);
      const contact = Object.freeze({...record});
      if (!byPhone.has(contact.phone)) byPhone.set(contact.phone, []);
      byPhone.get(contact.phone).push(contact);
      return contact;
    });
    return {contacts, byPhone, error: null};
  } catch {
    return {contacts: [], byPhone: new Map(), error: new Error("Contact lookup is unavailable. Please enter your details manually.")};
  }
})();

function filterContacts(contacts, prefix) {
  if (prefix.length < 2) return [];
  const matches = [];
  for (const contact of contacts) {
    if (contact.phone.startsWith(prefix)) matches.push(contact);
    if (matches.length === 8) break;
  }
  return matches;
}

function loadContact(phone) {
  if (contactDatabase.error) throw contactDatabase.error;
  const digits = normalizePhone(phone);
  if (digits.length !== 10) throw new Error("Enter a 10 digit phone number.");
  const contacts = contactDatabase.byPhone.get(digits) || [];
  return {found: contacts.length > 0, contacts, contact: contacts.length === 1 ? contacts[0] : null};
}

// Submit through Azure so Twilio credentials never reach the browser.
const REGISTRATION_API_URL = "https://sahebjiyouth-reg-api.azurewebsites.net/api/register";
const registrationRequestIds = new Map();
async function submitRsvp(payload) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  const key = "mahapuja-request-v1:" + Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  let requestId = registrationRequestIds.get(key);
  try { requestId = requestId || window.sessionStorage.getItem(key); } catch (_) {}
  if (!requestId) requestId = crypto.randomUUID();
  registrationRequestIds.set(key, requestId);
  // Persist only a payload hash and random ID, not the person's form fields.
  try { window.sessionStorage.setItem(key, requestId); } catch (_) {}
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(REGISTRATION_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, requestId }),
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "The RSVP service could not process the request.");
    return data;
  } catch (error) {
    if (error.name === "AbortError" || error instanceof TypeError) {
      throw new Error("We could not confirm the result. Keep this page open and retry with the same details to avoid a duplicate registration.");
    }
    throw error;
  } finally { clearTimeout(timer); }
}
