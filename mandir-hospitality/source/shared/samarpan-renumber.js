// One-time correction. The caller must record completion before allowing a rerun.
export const SAMARPAN_ROOM_RENUMBER = { "100": "101", "101": "102", "102": "103", "103": "104", "104": "105" };
const previousCapacity = { "100": 7, "101": 12, "102": 14, "103": 13, "104": 15 };
const text = value => String(value ?? "").trim();

export function renumberSamarpanCode(code) {
  const match = text(code).match(/^S(100|101|102|103|104)B([1-9]\d*)$/);
  if (!match) return code;
  if (Number(match[2]) > previousCapacity[match[1]]) throw new Error("A Samarpan bed code exceeds its original room capacity.");
  return `S${SAMARPAN_ROOM_RENUMBER[match[1]]}B${match[2]}`;
}

export function renumberSamarpanTables(attendees, housekeeping) {
  if (attendees.slice(1).some(row => text(row[29]) === "Samarpan" && text(row[30]) === "105")) throw new Error("Room 105 already has assignments. Review whether this correction already ran.");
  const counts = Object.fromEntries(Object.keys(SAMARPAN_ROOM_RENUMBER).map(room => [room, 0]));
  const updatedAttendees = attendees.map((row, index) => {
    const next = [...row], oldRoom = text(row[30]);
    if (!index || text(row[29]) !== "Samarpan" || !SAMARPAN_ROOM_RENUMBER[oldRoom]) return next;
    if (!new RegExp(`^S${oldRoom}B[1-9]\\d*$`).test(text(row[31]))) throw new Error("A Samarpan room and bed code disagree. Correct that entry before renumbering.");
    next[30] = typeof row[30] === "number" ? Number(SAMARPAN_ROOM_RENUMBER[oldRoom]) : SAMARPAN_ROOM_RENUMBER[oldRoom];
    next[31] = renumberSamarpanCode(row[31]);
    counts[oldRoom]++;
    return next;
  });
  let housekeepingCount = 0;
  const updatedHousekeeping = housekeeping.map((row, index) => {
    const next = [...row], code = text(row[3]);
    if (!index || !/^S10[0-4]B/.test(code)) return next;
    const newCode = renumberSamarpanCode(code);
    if (newCode === code || !SAMARPAN_ROOM_RENUMBER[text(row[1])]) throw new Error("A housekeeping room and bed code disagree.");
    const oldRoom = code.match(/^S(\d+)B/)[1];
    if (text(row[1]) !== oldRoom) throw new Error("A housekeeping room and bed code disagree.");
    const id = JSON.parse(text(row[0]));
    if (!Array.isArray(id) || id.length !== 4 || id[1] !== code) throw new Error("A housekeeping checkout identity needs review.");
    id[1] = newCode;
    next[0] = JSON.stringify(id);
    next[1] = typeof row[1] === "number" ? Number(SAMARPAN_ROOM_RENUMBER[oldRoom]) : SAMARPAN_ROOM_RENUMBER[oldRoom];
    next[3] = newCode;
    housekeepingCount++;
    return next;
  });
  const ids = updatedHousekeeping.slice(1).map(row => text(row[0])).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate housekeeping checkout records need review.");
  return { attendees: updatedAttendees, housekeeping: updatedHousekeeping, counts, housekeepingCount };
}
