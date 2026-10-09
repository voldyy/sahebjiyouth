export const SPREADSHEET_ID = "1YvVz4DyPZYTYtKC9qiDlEXsPd7Xz4DPNJIoe3NBkYMA";
export const SHEET_GID = 0;
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${SHEET_GID}`;
export const LODGING_LOCATIONS = ["Samarpan", "Comfort Inn", "Hawthorn"];
const API = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
const HEADERS = { 0: "Registration ID", 8: "Attendee Full Name", 29: "Lodging", 30: "Room No.", 31: "Room Code" };
const text = (value) => String(value ?? "").trim();

export function validateHeaders(headers) {
  for (const [index, expected] of Object.entries(HEADERS)) {
    if (text(headers[index]).toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`The source sheet column ${Number(index) + 1} must be “${expected}”. Nothing was written.`);
    }
  }
}

// The key is independent of row position. Ambiguous identities are never writable.
export const attendeeKey = (row) => JSON.stringify([text(row[0]), text(row[8]), text(row[9])]);
export const lodgingValues = (row) => [29, 30, 31].map((index) => text(row[index]));

export function sheetDate(value) {
  const raw = text(value);
  if (!raw) return { date: "", time: "" };
  const serial = typeof value === "number" ? value : null;
  let year, month, day, hours = 0, minutes = 0;
  if (serial !== null) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000));
    [year, month, day, hours, minutes] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes()];
  } else {
    const googleDate = raw.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+)(?:,\d+)?)?\)$/);
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i);
    if (googleDate) [year, month, day, hours, minutes] = [Number(googleDate[1]), Number(googleDate[2]) + 1, Number(googleDate[3]), Number(googleDate[4] || 0), Number(googleDate[5] || 0)];
    else if (iso) [year, month, day, hours, minutes] = [Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4] || 0), Number(iso[5] || 0)];
    else if (us) {
      [year, month, day, hours, minutes] = [Number(us[3]), Number(us[1]), Number(us[2]), Number(us[4] || 0), Number(us[5] || 0)];
      if (us[6]) hours = (hours % 12) + (us[6].toUpperCase() === "PM" ? 12 : 0);
    } else return { date: "", time: "" };
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day || hours > 23 || minutes > 59) return { date: "", time: "" };
  const pad = (n) => String(n).padStart(2, "0");
  return { date: `${year}-${pad(month)}-${pad(day)}`, time: `${pad(hours)}:${pad(minutes)}` };
}

export function guestsFromRows(rows) {
  validateHeaders(rows[0] || []);
  const attendees = rows.slice(1).filter((row) => text(row[0]) && text(row[8]));
  const counts = new Map();
  attendees.forEach((row) => counts.set(attendeeKey(row), (counts.get(attendeeKey(row)) || 0) + 1));
  return attendees.map((row, index) => {
    const identity = attendeeKey(row);
    const lodging = lodgingValues(row);
    const arrival = sheetDate(row[12]);
    const departure = sheetDate(row[13]);
    const lodgingIn = sheetDate(row[21]);
    const lodgingOut = sheetDate(row[22]);
    const name = text(row[8]);
    const overnight = text(row[20]).toUpperCase();
    const rsvp = text(row[24]);
    return {
      id: counts.get(identity) === 1 ? identity : `${identity}:${index}`, sourceIdentity: identity, registrationId: text(row[0]),
      sourceWritable: counts.get(identity) === 1, sourceLodging: lodging,
      name, initials: name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase(),
      group: "Individual", primaryContact: text(row[3]), relationship: text(row[9]),
      city: text(row[7]), phone: text(row[5]), count: 1,
      arrivalDate: arrival.date, arrivalTime: arrival.time,
      departureDate: departure.date, accommodationIn: lodgingIn.date, accommodationOut: lodgingOut.date,
      status: /^cancel/i.test(rsvp) ? "Cancelled" : "Registered", rsvpStatus: rsvp,
      stay: lodging[0] || (/^(NO|N|FALSE)$/.test(overnight) ? "Day visitor" : "Pending lodging"),
      lodging: lodging[0], roomNo: lodging[1], roomCode: lodging[2], room: lodging[2] || lodging[1],
      transport: /^(YES|Y|TRUE)$/i.test(text(row[18])) ? "Needed" : "Not needed",
      travel: [text(row[11]), text(row[14]), text(row[15])].filter(Boolean).join(" · "),
      diet: text(row[23]), notes: [text(row[19]), text(row[23])].filter(Boolean).join("\n"), color: "sage",
    };
  });
}

// Sheets' public visualization endpoint uses JSONP, not cross-origin fetch.
// No attendee data is bundled in the app or persisted in browser storage.
export function readPublicRows() {
  return new Promise((resolve, reject) => {
    const callback = `__mandirSheet${crypto.randomUUID().replaceAll("-", "")}`;
    const script = document.createElement("script");
    const cleanup = () => { clearTimeout(timer); script.remove(); delete window[callback]; };
    const timer = setTimeout(() => { cleanup(); reject(new Error("The sheet could not be loaded. Sign in with Google or retry.")); }, 15000);
    window[callback] = (response) => {
      cleanup();
      if (response.status !== "ok" || !response.table) return reject(new Error("The sheet is not readable. Sign in with a permitted Google account."));
      const columns = response.table.cols;
      resolve([columns.map((col) => col.label), ...response.table.rows.map((row) => columns.map((_, index) => {
        const cell = row.c[index];
        return [0, 5, 29, 30, 31].includes(index) ? (cell?.f ?? cell?.v ?? "") : (cell?.v ?? "");
      }))]);
    };
    script.onerror = () => { cleanup(); reject(new Error("Unable to reach Google Sheets. Check your connection and retry.")); };
    const params = new URLSearchParams({ gid: String(SHEET_GID), headers: "1", tqx: `out:json;responseHandler:${callback}` });
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?${params}`;
    document.head.appendChild(script);
  });
}

let googleLoader;
export function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!googleLoader) googleLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => { script.remove(); googleLoader = null; reject(new Error("Google sign-in did not load. Retry.")); }, 15000);
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); googleLoader = null; reject(new Error("Google sign-in is unavailable. Retry.")); };
    document.head.appendChild(script);
  });
  return googleLoader;
}

export async function sheetsRequest(path, token, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options, cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const error = new Error(response.status === 401 ? "Google sign-in expired. Sign in again." : response.status === 403 ? "This Google account cannot edit the sheet, or the Sheets API is not enabled for the OAuth project." : "Google Sheets could not complete the request. Refresh before retrying.");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function readAuthorizedRows(token) {
  const metadata = await sheetsRequest("?fields=sheets.properties", token);
  const sheet = metadata.sheets.find((entry) => entry.properties.sheetId === SHEET_GID);
  if (!sheet) throw new Error("The source sheet tab (gid 0) was not found.");
  const title = `'${sheet.properties.title.replaceAll("'", "''")}'`;
  // Display values preserve identifiers formatted with leading zeroes. Date parsing
  // accepts ISO and the source's verified US date layout without timezone conversion.
  const result = await sheetsRequest(`/values/${encodeURIComponent(`${title}!A1:AF`)}?valueRenderOption=FORMATTED_VALUE`, token);
  return { rows: result.values || [], title };
}

export function validateAssignment(assignment) {
  const values = [text(assignment.lodging), text(assignment.roomNo), text(assignment.roomCode)];
  if (values.every((v) => v === "")) return values;
  if (!LODGING_LOCATIONS.includes(values[0]) || !values[1] || !values[2]) throw new Error("Choose a lodging location and enter both the room number and custom room code.");
  if (values.some((v) => v.length > 100 || /[\r\n\x00]/.test(v))) throw new Error("Room details must be single-line text, up to 100 characters each.");
  return values;
}

export async function writeLodging(guest, assignment, token) {
  const values = validateAssignment(assignment);
  const snapshot = await readAuthorizedRows(token);
  validateHeaders(snapshot.rows[0] || []);
  const matches = snapshot.rows.map((row, index) => ({ row, index })).filter(({ row, index }) => index > 0 && attendeeKey(row) === guest.sourceIdentity);
  if (matches.length !== 1) throw new Error("The attendee was removed, changed, or duplicated in the sheet. Refresh before assigning a room.");
  const match = matches[0];
  if (JSON.stringify(lodgingValues(match.row)) !== JSON.stringify(guest.sourceLodging)) throw new Error("Someone changed this attendee’s lodging in the sheet. Refresh and review their assignment first.");
  const range = `${snapshot.title}!AD${match.index + 1}:AF${match.index + 1}`;
  // RAW stores identifiers literally (including leading zeroes) and never formulas.
  await sheetsRequest(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, token, {
    method: "PUT", body: JSON.stringify({ range, majorDimension: "ROWS", values: [values] }),
  });
  const confirmed = await readAuthorizedRows(token);
  const confirmedMatches = confirmed.rows.slice(1).filter((row) => attendeeKey(row) === guest.sourceIdentity);
  if (confirmedMatches.length !== 1 || JSON.stringify(lodgingValues(confirmedMatches[0])) !== JSON.stringify(values)) {
    throw new Error("The saved assignment could not be confirmed. Review the source sheet before retrying.");
  }
  return values;
}
