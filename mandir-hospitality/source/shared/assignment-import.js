const text = value => String(value ?? "").trim();
const key = value => text(value).normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]/gu, "");
const start = guest => guest.accommodationIn || guest.arrivalDate || "";
const end = guest => guest.accommodationOut || guest.departureDate || "";

// Registration IDs in edited/sorted worksheets may no longer follow the names.
// Match the attendee and city, then distinguish multiple visits by stay dates.
export function matchAssignmentEntries(entries, guests) {
  const matches = [], additions = [], used = new Set();
  for (const entry of entries) {
    const named = guests.filter(guest => key(guest.name) === key(entry.name));
    let candidates = named.filter(guest => key(guest.city) === key(entry.city));
    if (!candidates.length) candidates = named.filter(guest => !text(guest.city) && start(guest) === entry.start && end(guest) === entry.end);
    if (candidates.length > 1) candidates = candidates.filter(guest => start(guest) === entry.start && end(guest) === entry.end);
    if (!candidates.length && !named.length && !text(entry.registrationId)) { additions.push(entry); continue; }
    if (candidates.length !== 1 || !candidates[0].sourceWritable) throw Error(`Unable to uniquely match ${entry.name} (${entry.city}).`);
    const guest = candidates[0];
    if (used.has(guest.sourceIdentity)) throw Error(`Multiple worksheet rows match the same stay for ${entry.name}.`);
    used.add(guest.sourceIdentity); matches.push({ entry, guest });
  }
  return { matches, additions };
}

export function importedAssignment(entry, guest = null) {
  const lodging = entry.lodging === "Parmita" ? "Sadhak" : text(entry.lodging);
  const roomNo = text(entry.roomNo);
  let roomCode = text(entry.roomCode);
  if (["Hawthorn", "Hilton"].includes(lodging)) {
    const prefix = lodging === "Hawthorn" ? "HR" : "HL";
    if (!new RegExp(`^${prefix}[0-9]+$`).test(roomNo)) throw Error(`Invalid ${lodging} room slot for ${entry.name}.`);
    // Hilton moves can retain the old Hawthorn code in the edited workbook.
    // The selected room supplies the address; preserve the recorded guest place.
    const bed = roomCode.match(/B([1-9]\d*)$/)?.[1] || (!roomCode ? String(guest?.roomCode || "").match(/B([1-9]\d*)$/)?.[1] : "");
    if (roomCode && !bed) throw Error(`Invalid bed code for ${entry.name}.`);
    roomCode = bed ? `${roomNo}B${bed}` : "";
  }
  return { lodging, roomNo, roomCode };
}
