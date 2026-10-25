var Hospitality = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // apps-script/server.js
  var server_exports = {};
  __export(server_exports, {
    doGet: () => doGet,
    doPost: () => doPost,
    hospitalityRequest: () => hospitalityRequest,
    setupHospitality: () => setupHospitality,
    showAdminLink: () => showAdminLink
  });

  // src/lib/offsite.js
  var OFFSITE_HOTELS = ["Hawthorn"];
  var LEGACY_OFFSITE_HOTELS = { "Comfort Inn": "Hawthorn", "Hilton Garden Inn": "" };
  var normalizeOffsiteHotel = (hotel) => LEGACY_OFFSITE_HOTELS[hotel] ?? hotel;
  var SLOT_COUNTS = { Hawthorn: 15 };
  var slotId = (hotel, number) => `hawthorn-r${String(number).padStart(2, "0")}`;
  var DEFAULT_OFFSITE_ROOMS = OFFSITE_HOTELS.flatMap(
    (lodging) => Array.from({ length: SLOT_COUNTS[lodging] }, (_, index) => {
      const slot = `R${String(index + 1).padStart(2, "0")}`;
      return {
        id: slotId(lodging, index + 1),
        number: slotId(lodging, index + 1),
        lodging,
        roomNo: "",
        beds: 4,
        physicalBeds: 2,
        peoplePerBed: 2,
        label: slot,
        revision: `default-${slot.toLowerCase()}-v1`,
        isDefaultSlot: true
      };
    })
  );
  var defaultOffsiteRoom = (id) => DEFAULT_OFFSITE_ROOMS.find((room) => room.id === id) || null;
  function withDefaultOffsiteRooms(rooms) {
    const saved = new Map(rooms.filter((room) => normalizeOffsiteHotel(room.lodging)).map((room) => [room.id, { ...room, lodging: normalizeOffsiteHotel(room.lodging) }]));
    const defaults = DEFAULT_OFFSITE_ROOMS.map((room) => ({ ...room, ...saved.get(room.id) || {} }));
    const custom = rooms.filter((room) => !defaultOffsiteRoom(room.id) && normalizeOffsiteHotel(room.lodging)).map((room) => ({ ...room, lodging: normalizeOffsiteHotel(room.lodging) }));
    return [...defaults, ...custom];
  }
  var offsiteBedCode = (room, bed) => `O${room.id}B${bed}`;
  function offsiteRoomFor(guest, rooms) {
    return rooms.find((room) => room.lodging === guest.lodging && new RegExp(`^O${room.id}B[1-9]\\d*$`).test(guest.roomCode || ""));
  }

  // src/lib/lodgingRooms.js
  var samarpanRooms = [
    { number: "202", beds: 2 },
    { number: "203", beds: 4 },
    { number: "204", beds: 3 },
    { number: "205", beds: 4 },
    { number: "206", beds: 4 },
    { number: "207", beds: 4 },
    { number: "100", beds: 7 },
    { number: "101", beds: 12 },
    { number: "102", beds: 12 },
    { number: "103", beds: 12 },
    { number: "104", beds: 12 }
  ];
  var samarpanBedCount = samarpanRooms.reduce((sum, room) => sum + room.beds, 0);
  var sadhakRooms = [
    { number: "101", beds: 3 },
    { number: "102", beds: 3 },
    { number: "104", beds: 2 },
    { number: "201", beds: 1 },
    { number: "202", beds: 3 },
    { number: "203", beds: 2 },
    { number: "204", beds: 2 }
  ].map((room) => ({ ...room, lodging: "Sadhak" }));
  var FIXED_LODGINGS = ["Samarpan", "Sadhak"];
  var fixedRoomsFor = (lodging) => lodging === "Samarpan" ? samarpanRooms : lodging === "Sadhak" ? sadhakRooms : [];
  var isFixedLodging = (lodging) => FIXED_LODGINGS.includes(lodging);
  function fixedRoomCode(lodging, roomNo, bedNo) {
    const room = fixedRoomsFor(lodging).find((r) => r.number === String(roomNo));
    const bed = Number(bedNo);
    if (!room || !Number.isInteger(bed) || bed < 1 || bed > room.beds) return "";
    return `${lodging === "Samarpan" ? "S" : "SD"}${room.number}B${bed}`;
  }

  // src/lib/transportDisplay.js
  var HOUR = 60 * 60 * 1e3;
  var formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  var parts = (instant) => Object.fromEntries(formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  var dayOf = (p) => `${p.year}-${p.month}-${p.day}`;
  function allentownInstant(day, time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || "")) return null;
    const wall = Date.parse(`${day}T${time}:00Z`);
    if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 10) !== day) return null;
    const candidates = [-24, 0, 24].map((hours) => {
      const probe = wall + hours * HOUR, p = parts(probe);
      const offset = Date.parse(`${dayOf(p)}T${p.hour}:${p.minute}:00Z`) - probe;
      return wall - offset;
    }).filter((instant) => {
      const p = parts(instant);
      return dayOf(p) === day && `${p.hour}:${p.minute}` === time;
    });
    return candidates.length ? Math.max(...candidates) : null;
  }
  var dayDisplayId = (day) => JSON.stringify(["Day", day]);
  function displayChangedAt(revision) {
    const stamp = String(revision || "").split("|")[0];
    return /^\d{4}-\d{2}-\d{2}T/.test(stamp) && Number.isFinite(Date.parse(stamp)) ? stamp : "";
  }

  // src/lib/occupancy.js
  var FIRST_STAY_DAY = "2026-10-11";
  var localDay = (iso) => /* @__PURE__ */ new Date(`${iso}T12:00:00`);
  function moveDay(iso, days) {
    const date = localDay(iso);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  var WEEK_STARTS = Array.from({ length: 6 }, (_, i) => moveDay(FIRST_STAY_DAY, i * 7));
  var PLANNING_START_DAY = "2026-10-25";
  var PLANNING_WEEK_STARTS = WEEK_STARTS.filter((start) => start >= PLANNING_START_DAY);
  function needsLodging(guest) {
    return guest.stay !== "Day visitor" && !["Cancelled", "Departed"].includes(guest.status);
  }
  function stayRange(guest) {
    const start = guest.accommodationIn || guest.arrivalDate || "";
    const end = guest.accommodationOut || guest.departureDate || "";
    const valid = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(localDay(day).getTime()) && moveDay(day, 0) === day;
    return valid(start) && valid(end) && end > start ? { start, end } : null;
  }
  function overlaps(a, b) {
    return !!a && !!b && a.start < b.end && b.start < a.end;
  }
  function bedForGuest(guest, rooms = []) {
    if (!isFixedLodging(guest.lodging)) {
      const room = offsiteRoomFor(guest, rooms);
      const bed2 = Number(String(guest.roomCode || "").match(/B([1-9]\d*)$/)?.[1]);
      return room && bed2 >= 1 && bed2 <= room.beds ? bed2 : null;
    }
    const bed = String(guest.roomCode || "").match(/^SD?\d+B([1-9]\d*)$/)?.[1];
    return bed && fixedRoomCode(guest.lodging, guest.roomNo, bed) === guest.roomCode ? Number(bed) : null;
  }
  var sameGuest = (a, b) => (a.sourceIdentity || a.id) === (b.sourceIdentity || b.id);
  function bedState(guests, roomNo, bedNo, range, exceptGuest = null, lodging = "Samarpan", rooms = []) {
    const occupants = [];
    const uncertain = [];
    for (const guest of guests) {
      if (!needsLodging(guest) || guest.lodging !== lodging || exceptGuest && sameGuest(guest, exceptGuest)) continue;
      if (isFixedLodging(lodging)) {
        if (String(guest.roomNo) !== String(roomNo)) continue;
      } else {
        const target = rooms.find((r) => r.id === roomNo && r.lodging === lodging);
        const assigned = offsiteRoomFor(guest, rooms);
        if (!target || (assigned ? assigned.id !== target.id : !target.roomNo || guest.roomNo !== target.roomNo)) continue;
      }
      const stay = stayRange(guest);
      if (stay && !overlaps(stay, range)) continue;
      const bed = bedForGuest(guest, rooms);
      if (bed !== null && bed !== Number(bedNo)) continue;
      if (!stay || bed === null) uncertain.push(guest);
      else occupants.push(guest);
    }
    return { occupants, uncertain, free: occupants.length === 0 && uncertain.length === 0 };
  }
  function assignmentIssue(guests, guest, assignment, rooms = []) {
    if (!isFixedLodging(assignment.lodging) && !OFFSITE_HOTELS.includes(assignment.lodging)) return "";
    const hotelRoom = offsiteRoomFor(assignment, rooms);
    if (!isFixedLodging(assignment.lodging) && !hotelRoom) return "Choose a hotel room and bed from the Offsite inventory.";
    const range = stayRange(guest);
    if (!range) return "Add valid accommodation or arrival/departure dates in the source sheet before assigning a bed.";
    const bed = bedForGuest(assignment, rooms);
    if (!bed) return "Choose a valid room and bed.";
    if (hotelRoom && (assignment.roomNo !== hotelRoom.roomNo || assignment.roomCode !== offsiteBedCode(hotelRoom, bed))) return "The hotel room changed. Refresh before assigning.";
    const state = bedState(guests, hotelRoom?.id || assignment.roomNo, bed, range, guest, assignment.lodging, rooms);
    if (state.uncertain.length) return `Room ${assignment.roomNo} has an assignment with missing dates or an unrecognized bed code. Review it before assigning this bed.`;
    if (state.occupants.length) return `${assignment.roomCode} is occupied during this guest\u2019s stay. Choose another bed.`;
    return "";
  }

  // src/lib/sheets.js
  var SPREADSHEET_ID = "1YvVz4DyPZYTYtKC9qiDlEXsPd7Xz4DPNJIoe3NBkYMA";
  var SHEET_GID = 0;
  var SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${SHEET_GID}`;
  var LODGING_LOCATIONS = [...FIXED_LODGINGS, ...OFFSITE_HOTELS];
  var API = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
  var HEADERS = { 0: "Registration ID", 8: "Attendee Full Name", 29: "Lodging", 30: "Room No.", 31: "Room Code" };
  var text = (value) => String(value ?? "").trim();
  function validateHeaders(headers) {
    for (const [index, expected] of Object.entries(HEADERS)) {
      if (text(headers[index]).toLowerCase() !== expected.toLowerCase()) {
        throw new Error(`The source sheet column ${Number(index) + 1} must be \u201C${expected}\u201D. Nothing was written.`);
      }
    }
  }
  var attendeeKey = (row) => JSON.stringify([text(row[0]), text(row[8]), text(row[9])]);
  var lodgingValues = (row) => [29, 30, 31].map((index) => text(row[index]));
  function sheetDate(value) {
    const raw = text(value);
    if (!raw) return { date: "", time: "" };
    const serial = typeof value === "number" ? value : null;
    let year, month, day, hours = 0, minutes = 0;
    if (serial !== null) {
      const date2 = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 864e5));
      [year, month, day, hours, minutes] = [date2.getUTCFullYear(), date2.getUTCMonth() + 1, date2.getUTCDate(), date2.getUTCHours(), date2.getUTCMinutes()];
    } else {
      const googleDate = raw.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+)(?:,\d+)?)?\)$/);
      const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
      const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i);
      if (googleDate) [year, month, day, hours, minutes] = [Number(googleDate[1]), Number(googleDate[2]) + 1, Number(googleDate[3]), Number(googleDate[4] || 0), Number(googleDate[5] || 0)];
      else if (iso) [year, month, day, hours, minutes] = [Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4] || 0), Number(iso[5] || 0)];
      else if (us) {
        [year, month, day, hours, minutes] = [Number(us[3]), Number(us[1]), Number(us[2]), Number(us[4] || 0), Number(us[5] || 0)];
        if (us[6]) hours = hours % 12 + (us[6].toUpperCase() === "PM" ? 12 : 0);
      } else return { date: "", time: "" };
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day || hours > 23 || minutes > 59) return { date: "", time: "" };
    const pad = (n) => String(n).padStart(2, "0");
    return { date: `${year}-${pad(month)}-${pad(day)}`, time: `${pad(hours)}:${pad(minutes)}` };
  }
  function registrationTime(value) {
    const raw = text(value);
    if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
      const instant2 = Date.parse(raw);
      return Number.isFinite(instant2) ? instant2 : null;
    }
    const { date, time } = sheetDate(value);
    const instant = allentownInstant(date, time);
    if (instant === null) return null;
    const seconds = typeof value === "number" ? Math.round(value * 86400) % 60 : Number(raw.match(/\d{1,2}:\d{2}:(\d{2})/)?.[1] || raw.match(/^Date\(\d+,\d+,\d+,\d+,\d+,(\d+)\)/)?.[1] || 0);
    return seconds < 60 ? instant + seconds * 1e3 : null;
  }
  function guestsFromRows(rows) {
    validateHeaders(rows[0] || []);
    const attendees = rows.slice(1).filter((row) => text(row[0]) && text(row[8]));
    const counts = /* @__PURE__ */ new Map();
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
        id: counts.get(identity) === 1 ? identity : `${identity}:${index}`,
        sourceIdentity: identity,
        registrationId: text(row[0]),
        sourceWritable: counts.get(identity) === 1,
        sourceLodging: lodging,
        registeredAt: registrationTime(row[1]),
        registrationOrder: index,
        name,
        initials: name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase(),
        group: "Individual",
        isPrimaryContact: /^(YES|Y|TRUE)$/i.test(text(row[2])),
        primaryContact: text(row[3]),
        relationship: text(row[9]),
        city: text(row[7]),
        phone: text(row[5]),
        count: 1,
        // Manual registrations have at least one of the normal online-form
        // identifiers missing. Keep the raw email and ZIP out of dashboard data.
        isManualRegistration: !text(row[4]) || !text(row[6]),
        arrivalDate: arrival.date,
        arrivalTime: arrival.time,
        arrivalTimeKnown: typeof row[12] === "number" ? row[12] % 1 !== 0 : /(?:[T ]\d{1,2}:\d{2}|^Date\(\d+,\d+,\d+,\d+,\d+)/.test(text(row[12])),
        departureTimeKnown: typeof row[13] === "number" ? row[13] % 1 !== 0 : /(?:[T ]\d{1,2}:\d{2}|^Date\(\d+,\d+,\d+,\d+,\d+)/.test(text(row[13])),
        departureDate: departure.date,
        departureTime: departure.time,
        travelMethod: text(row[11]),
        arrivalAirport: text(row[14]),
        arrivalFlight: text(row[15]),
        departureAirport: text(row[16]),
        departureFlight: text(row[17]),
        accommodationIn: lodgingIn.date,
        accommodationOut: lodgingOut.date,
        status: /^cancel/i.test(rsvp) ? "Cancelled" : /^(departed|checked out)$/i.test(rsvp) ? "Departed" : "Registered",
        rsvpStatus: rsvp,
        stay: lodging[0] || (/^(NO|N|FALSE)$/.test(overnight) ? "Day visitor" : "Pending lodging"),
        lodging: normalizeOffsiteHotel(lodging[0]),
        roomNo: lodging[1],
        roomCode: lodging[2],
        room: lodging[2] || lodging[1],
        transport: /^(YES|Y|TRUE)$/i.test(text(row[18])) ? "Needed" : "Not needed",
        travel: [text(row[11]), text(row[14]), text(row[15])].filter(Boolean).join(" \xB7 "),
        diet: text(row[23]),
        notes: [text(row[19]), text(row[23])].filter(Boolean).join("\n"),
        color: "sage"
      };
    });
  }
  function validateAssignment(assignment) {
    const values = [text(assignment.lodging), text(assignment.roomNo), text(assignment.roomCode)];
    if (values.every((v) => v === "")) return values;
    const provisional = OFFSITE_HOTELS.includes(values[0]) && /^O[a-zA-Z0-9-]+B[1-9]\d*$/.test(values[2]);
    if (!LODGING_LOCATIONS.includes(values[0]) || !values[1] && !provisional || !values[2]) throw new Error("Choose a lodging location and enter both the room number and custom room code.");
    if (isFixedLodging(values[0]) && !fixedRoomsFor(values[0]).some((room) => room.number === values[1])) throw new Error(`Choose a confirmed ${values[0]} room.`);
    if (isFixedLodging(values[0])) {
      const bed = values[2].match(/^SD?\d+B([1-9]\d*)$/)?.[1];
      if (!bed || fixedRoomCode(values[0], values[1], bed) !== values[2]) throw new Error(`Select a valid bed in the chosen ${values[0]} room to generate its code.`);
    }
    if (values.some((v) => v.length > 100 || /[\r\n\x00]/.test(v))) throw new Error("Room details must be single-line text, up to 100 characters each.");
    return values;
  }

  // src/lib/transport.js
  function transportGroups(guests, direction) {
    const groups = /* @__PURE__ */ new Map();
    for (const guest of guests) {
      if (guest.status === "Cancelled") continue;
      const arrival = direction === "Arrivals";
      const method = !arrival && /bus\s*\(arrival\)/i.test(guest.travelMethod || "") ? "" : guest.travelMethod || "";
      const isBus = /bus/i.test(method);
      const flight = isBus ? "" : (arrival ? guest.arrivalFlight : guest.departureFlight)?.trim().toUpperCase().replace(/\s+/g, "") || "";
      const airport = (arrival ? guest.arrivalAirport : guest.departureAirport)?.trim().toUpperCase() || "";
      if (!/flight|air|bus/i.test(method) && !flight && guest.transport !== "Needed")
        continue;
      const day = (arrival ? guest.arrivalDate : guest.departureDate) || "";
      const time = (arrival ? guest.arrivalTime : guest.departureTime) || "";
      const mode = isBus ? "Bus" : flight || /flight|air/i.test(method) ? "Flight" : "Pickup";
      const id = JSON.stringify([
        direction,
        day,
        mode,
        airport,
        flight || guest.registrationId
      ]);
      if (!groups.has(id))
        groups.set(id, {
          id,
          direction,
          day,
          time,
          method: mode,
          flight,
          airport,
          guests: []
        });
      const group = groups.get(id);
      if (time && (!group.time || time < group.time)) group.time = time;
      group.guests.push(guest);
    }
    return [...groups.values()].map((group) => ({
      ...group,
      timeKnown: group.guests.every((g) => (direction === "Arrivals" ? g.arrivalTimeKnown : g.departureTimeKnown) !== false),
      latestTime: group.guests.map((g) => direction === "Arrivals" ? g.arrivalTime : g.departureTime).filter(Boolean).sort().at(-1) || "",
      signature: JSON.stringify(
        group.guests.map((g) => [
          g.sourceIdentity,
          g.arrivalDate,
          g.arrivalTime,
          g.departureDate,
          g.departureTime,
          g.transport
        ]).sort((a, b) => a[0].localeCompare(b[0]))
      ),
      timeMismatch: new Set(
        group.guests.map(
          (g) => direction === "Arrivals" ? g.arrivalTime : g.departureTime
        ).filter(Boolean)
      ).size > 1
    })).sort(
      (a, b) => (a.day || "9999").localeCompare(b.day || "9999") || (a.time || "99").localeCompare(b.time || "99") || a.flight.localeCompare(b.flight)
    );
  }

  // src/lib/housekeeping.js
  function checkoutEvents(guests, today) {
    return guests.flatMap((guest) => {
      const stay = stayRange(guest), bed = bedForGuest(guest);
      if (guest.lodging !== "Samarpan" || !bed || !stay || guest.status === "Cancelled" || stay.end > today) return [];
      return [{ id: JSON.stringify([guest.sourceIdentity || guest.id, guest.roomCode, stay.start, stay.end]), roomNo: guest.roomNo, bed, roomCode: guest.roomCode, name: guest.name, checkout: stay.end, refreshedAt: "" }];
    });
  }

  // apps-script/bridge.html
  var bridge_default = `<!doctype html><html><head><meta charset="utf-8"></head><body><p>Mandir Hospitality connection</p><script>
const config = __CONFIG__;
const reply = message => window.top.postMessage({ ...message, channel: config.channel, service: 'mandir-hospitality' }, config.origin);
window.addEventListener('message', event => {
  if (event.origin !== config.origin || event.source !== window.top || event.data?.channel !== config.channel || event.data?.service !== 'mandir-hospitality') return;
  const { id, request } = event.data;
  if (!id || !request) return;
  google.script.run.withSuccessHandler(result => reply({ id, result })).withFailureHandler(error => reply({ id, result: { ok: false, error: error.message || 'Google could not complete this request.' } })).hospitalityRequest(request);
});
reply({ ready: true });
<\/script></body></html>
`;

  // shared/workspace-engine.js
  var TABLES = {
    "Transport Display": ["Journey ID", "Collapsed", "Revision", "Request ID"],
    "Offsite Rooms": ["ID", "Hotel", "Room number", "Beds", "Planning label", "Revision"],
    "Housekeeping": ["Checkout ID", "Room", "Bed", "Bed code", "Guest", "Checkout date", "Linens refreshed at", "Request ID", "State"],
    "Transport Assignments": [
      "Journey ID",
      "Direction",
      "Date",
      "Flight / service",
      "Airport",
      "Attendees",
      "Driver",
      "Vehicle",
      "Pickup / mandir departure",
      "Status",
      "Notes",
      "Revision",
      "Updated at",
      "Request ID"
    ],
    "Transport Resources": ["Type", "Name", "Active", "Updated at"],
    "Assignment History": [
      "Request ID",
      "Time",
      "Action",
      "Record",
      "Before",
      "After"
    ]
  };
  function createWorkspaceEngine(runtime) {
    const text2 = (value) => String(value ?? "").trim();
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const literal2 = (value) => {
      const s = String(value ?? "");
      return /^[=+\-@']/.test(s) ? "'" + s : s;
    };
    function table2(book, name, readOnly = false) {
      const expected = TABLES[name];
      let sheet = book.getSheetByName(name);
      if (!sheet && readOnly) return { sheet: null, rows: [expected] };
      if (!sheet) {
        sheet = book.insertSheet(name);
        sheet.getRange(1, 1, 1, expected.length).setValues([expected]).setBackground("#335b4b").setFontColor("#ffffff").setFontWeight("bold");
        sheet.setFrozenRows(1);
        sheet.setColumnWidths(1, expected.length, 160);
      }
      const rows = sheet.getDataRange().getDisplayValues();
      const resourceHeaders = name === "Transport Resources" && equal(rows[0].slice(0, 4), expected) && (rows[0].length === 4 || rows[0].length === 5 && rows[0][4] === "Phone number");
      if (!resourceHeaders && !equal(rows[0], expected))
        throw new Error(
          `The ${name} headers changed. Restore its columns before saving.`
        );
      return { sheet, rows };
    }
    function roster2(book) {
      const sheet = book.getSheets().find((s) => s.getSheetId() === 0);
      if (!sheet) throw new Error("The attendee tab (gid 0) is missing.");
      const rows = sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), 32).getDisplayValues();
      return { sheet, rows, guests: guestsFromRows(rows) };
    }
    function plans2(book, readOnly = false) {
      const rows = table2(book, "Transport Assignments", readOnly).rows.slice(1).filter((r) => r[0]);
      const resources = table2(book, "Transport Resources", readOnly).rows.slice(1).filter((r) => r[2] === "Yes");
      return {
        assignments: rows.map((r) => ({
          id: r[0],
          driver: r[6],
          vehicle: r[7],
          pickup: r[8],
          status: r[9],
          notes: r[10],
          revision: r[11]
        })),
        drivers: resources.filter((r) => r[0] === "Driver").map((r) => r[1]),
        vehicles: resources.filter((r) => r[0] === "Vehicle").map((r) => r[1])
      };
    }
    function hotelRooms2(book, readOnly = false) {
      const stored = table2(book, "Offsite Rooms", readOnly).rows.slice(1).filter((r) => r[0]).map((r) => ({ id: r[0], number: r[0], lodging: normalizeOffsiteHotel(r[1]), roomNo: r[2], beds: Number(r[3]), label: r[4], revision: r[5] }));
      return withDefaultOffsiteRooms(stored);
    }
    function tripDisplay2(book) {
      return table2(book, "Transport Display", true).rows.slice(1).filter((r) => r[0]).map((r) => ({ id: r[0], collapsed: r[1] === "Yes", revision: r[2], updatedAt: displayChangedAt(r[2]) }));
    }
    function setTripDisplay(book, req) {
      const guests = roster2(book).guests;
      const valid = ["Arrivals", "Departures"].some((direction) => transportGroups(guests, direction).some((g) => g.id === req.id || g.day && dayDisplayId(g.day) === req.id));
      if (typeof req.collapsed !== "boolean" || !valid) throw new Error("This trip changed. Refresh before changing its display.");
      const current = table2(book, "Transport Display");
      const matches = current.rows.map((row, index) => ({ row, index })).filter((x) => x.index > 0 && x.row[0] === req.id);
      if (matches.length > 1) throw new Error("Duplicate trip display records. Review the sheet.");
      if (matches[0]?.row[3] === req.requestId) return;
      const values = [req.id, req.collapsed ? "Yes" : "No", `${(/* @__PURE__ */ new Date()).toISOString()}|${runtime.uuid()}`, req.requestId];
      writeRow(current.sheet, matches[0] ? matches[0].index + 1 : current.sheet.getLastRow() + 1, values);
      runtime.flush();
      if (!equal(table2(book, "Transport Display").rows.find((r) => r[0] === req.id), values)) throw new Error("Trip display could not be confirmed. Refresh before retrying.");
    }
    function housekeeping2(book, guests, readOnly = false) {
      const current = table2(book, "Housekeeping", readOnly);
      const today = runtime.today();
      const due = checkoutEvents(guests, today);
      const dueIds = new Set(due.map((e) => e.id));
      const known = new Set(current.rows.slice(1).map((r) => r[0]));
      current.rows.forEach((r, i) => {
        if (!i || !r[0] || r[6]) return;
        let identity;
        try {
          identity = JSON.parse(r[0])[0];
        } catch {
          return;
        }
        const guest2 = guests.find((g) => g.sourceIdentity === identity && g.roomCode === r[3]);
        const state = dueIds.has(r[0]) ? "Pending" : guest2 && stayRange(guest2) ? "Superseded" : r[8];
        if (state !== r[8]) {
          if (readOnly) current.rows[i] = [...r.slice(0, 8), state];
          else writeRow(current.sheet, i + 1, [...r.slice(0, 8), state]);
        }
      });
      for (const event of due) {
        if (known.has(event.id)) continue;
        const values = [event.id, event.roomNo, String(event.bed), event.roomCode, event.name, event.checkout, "", "", "Pending"];
        if (readOnly) current.rows.push(values);
        else writeRow(current.sheet, current.sheet.getLastRow() + 1, values);
        known.add(event.id);
      }
      return (readOnly ? current.rows : table2(book, "Housekeeping").rows).slice(1).filter((r) => r[0] && r[8] !== "Superseded").map((r) => ({ id: r[0], roomNo: r[1], bed: Number(r[2]), roomCode: r[3], name: r[4], checkout: r[5], refreshedAt: r[6] }));
    }
    function snapshot2(book, role) {
      const current = roster2(book);
      if (role !== "admin") return {
        role: "viewer",
        tripDisplay: tripDisplay2(book),
        // All dashboard views use normalized display data, never the raw source rows.
        guests: current.guests,
        transport: plans2(book, true),
        offsiteRooms: hotelRooms2(book, true),
        housekeeping: housekeeping2(book, current.guests, true),
        // Retain the meal projection for already-open versions of the team page.
        kitchenGuests: current.guests.map((g, index) => ({ sourceIdentity: `meal-${index}`, name: g.name, city: g.city, count: g.count, arrivalDate: g.arrivalDate, arrivalTime: g.arrivalTime, departureDate: g.departureDate, status: g.status, stay: g.stay === "Day visitor" ? "Day visitor" : "Overnight" })),
        refreshedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      return {
        role,
        tripDisplay: tripDisplay2(book),
        rows: current.rows,
        transport: plans2(book),
        offsiteRooms: hotelRooms2(book),
        housekeeping: housekeeping2(book, current.guests),
        refreshedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    function writeRow(sheet, row, values) {
      sheet.getRange(row, 1, 1, values.length).setNumberFormat("@").setValues([values.map(literal2)]);
    }
    function history(book, req, record, before, after) {
      const { sheet } = table2(book, "Assignment History");
      writeRow(sheet, sheet.getLastRow() + 1, [
        req.requestId,
        (/* @__PURE__ */ new Date()).toISOString(),
        req.action,
        record,
        JSON.stringify(before),
        JSON.stringify(after)
      ]);
    }
    function lodging(book, req) {
      const values = validateAssignment(req.assignment);
      const current = roster2(book);
      housekeeping2(book, current.guests);
      const matches = current.rows.map((row, index) => ({ row, index })).filter((x) => x.index > 0 && attendeeKey(x.row) === req.identity);
      if (matches.length !== 1)
        throw new Error(
          "The attendee was removed, changed, or duplicated. Refresh before assigning."
        );
      const match = matches[0];
      const before = lodgingValues(match.row);
      if (equal(before, values)) return;
      if (!equal(before, req.expected))
        throw new Error(
          "Someone changed this attendee\u2019s lodging. Refresh and review their assignment first."
        );
      const guest2 = current.guests.find((g) => g.sourceIdentity === req.identity);
      if (values[0]) {
        if (!needsLodging(guest2))
          throw new Error("This guest no longer needs overnight accommodation.");
        const currentStay = stayRange(guest2);
        if (currentStay?.start !== req.stay?.start || currentStay?.end !== req.stay?.end)
          throw new Error(
            "This guest\u2019s stay dates changed. Refresh before assigning."
          );
        const problem = assignmentIssue(current.guests, guest2, {
          lodging: values[0],
          roomNo: values[1],
          roomCode: values[2]
        }, hotelRooms2(book));
        if (problem) throw new Error(problem);
      }
      current.sheet.getRange(match.index + 1, 30, 1, 3).setNumberFormat("@").setValues([values.map(literal2)]);
      runtime.flush();
      const confirmed = roster2(book).rows.slice(1).filter((r) => attendeeKey(r) === req.identity);
      if (confirmed.length !== 1 || !equal(lodgingValues(confirmed[0]), values))
        throw new Error("Save could not be confirmed. Refresh before retrying.");
      history(book, req, req.identity, before, values);
    }
    function guest(book, req) {
      const form = req.guest || {};
      const field = (key, max = 200) => {
        const value = text2(form[key]);
        if (value.length > max || /[\x00\r\n]/.test(value)) throw new Error("Guest details must be single-line text within the field limits.");
        return value;
      };
      const name = field("name");
      if (!name) throw new Error("Enter the attendee's full name.");
      const date = (key) => {
        const value = field(key);
        if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || sheetDate(value).date !== value)) throw new Error("Enter valid stay dates.");
        return value;
      };
      const start = date("arrivalDate"), end = date("departureDate");
      if (start && end && end < start) throw new Error("Checkout cannot be before check-in.");
      const time = (key, day) => {
        const value = field(key);
        if (value && (!day || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) throw new Error("Enter a valid time and its date, or leave the time blank.");
        return value ? `${day} ${value}` : day;
      };
      const overnight = field("overnight"), transport2 = field("airportTransport"), mode = field("travelMethod");
      if (!["", "YES", "NO"].includes(overnight) || !["", "YES", "NO"].includes(transport2) || !["", "CAR", "FLIGHT", "BUS", "Bus (arrival)"].includes(mode)) throw new Error("Choose valid accommodation and transport options.");
      if (overnight === "YES" && start && end && start === end) throw new Error("An overnight stay needs a checkout date after check-in.");
      const notes = text2(form.notes);
      if (notes.length > 1e3 || /\x00/.test(notes)) throw new Error("Notes must be up to 1,000 characters.");
      const id = `MAN-2026-${req.requestId}`;
      const current = roster2(book);
      const existing = current.rows.slice(1).filter((r) => text2(r[0]) === id);
      if (existing.length > 1) throw new Error("Duplicate guest entry found. Refresh and review the sheet.");
      if (existing.length === 1) return;
      const primary = field("primaryContact") || name;
      const row = Array(32).fill("");
      Object.assign(row, { 0: id, 1: (/* @__PURE__ */ new Date()).toISOString(), 2: primary === name ? "YES" : "NO", 3: primary, 5: field("phone"), 7: field("city"), 8: name, 9: field("relationship") || (primary === name ? "Self (Primary)" : ""), 11: mode, 12: time("arrivalTime", start), 13: time("departureTime", end), 18: transport2, 20: overnight, 21: start, 22: end, 23: notes });
      if (req.assignment) {
        const values = validateAssignment(req.assignment);
        const proposed = guestsFromRows([current.rows[0], row])[0];
        if (!values[0] || overnight !== "YES" || !stayRange(proposed)) throw new Error("Enter valid check-in and checkout dates for the walk-in stay.");
        const problem = assignmentIssue(current.guests, proposed, { lodging: values[0], roomNo: values[1], roomCode: values[2] }, hotelRooms2(book, true));
        if (problem) throw new Error(problem);
        row.splice(29, 3, ...values);
      }
      const target = current.sheet.getLastRow() + 1;
      writeRow(current.sheet, target, row);
      runtime.flush();
      const confirmed = roster2(book).rows.slice(1).filter((r) => text2(r[0]) === id);
      if (confirmed.length !== 1 || !equal(confirmed[0], row)) throw new Error("Guest save could not be confirmed. Retry this form before adding another entry.");
      history(book, req, attendeeKey(row), {}, row);
    }
    function linen(book, req) {
      const events = housekeeping2(book, roster2(book).guests).filter((e) => e.roomCode === req.roomCode && !e.refreshedAt);
      if (!Array.isArray(req.expected) || !events.length || !equal(events.map((e) => e.id).sort(), [...req.expected].sort())) throw new Error("The checkout list changed. Refresh before marking this bed clean.");
      const { sheet, rows } = table2(book, "Housekeeping");
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const ids = new Set(events.map((e) => e.id));
      rows.forEach((r, i) => {
        if (i > 0 && ids.has(r[0])) writeRow(sheet, i + 1, [...r.slice(0, 6), now, req.requestId, "Refreshed"]);
      });
      runtime.flush();
      const confirmed = table2(book, "Housekeeping").rows.filter((r) => ids.has(r[0]));
      if (confirmed.length !== ids.size || confirmed.some((r) => r[6] !== now)) throw new Error("The linen update could not be confirmed. Refresh before retrying.");
      history(book, req, req.roomCode, events, { refreshedAt: now });
    }
    function offsite(book, req) {
      const rooms = hotelRooms2(book);
      const old = req.id ? rooms.find((r) => r.id === req.id) : null;
      if (req.id && (!old || old.revision !== req.expectedRevision)) throw new Error("This hotel room changed. Refresh before saving.");
      const preset = defaultOffsiteRoom(req.id);
      const hotel = normalizeOffsiteHotel(clean2(req.lodging)), roomNo = clean2(req.roomNo), beds = preset?.beds || Number(req.beds);
      if (!OFFSITE_HOTELS.includes(hotel) || !Number.isInteger(beds) || beds < 1 || beds > 20) throw new Error("Choose a hotel and between 1 and 20 beds.");
      if (old && old.lodging !== hotel) throw new Error("An existing planning room cannot be moved to another hotel.");
      if (preset && (hotel !== preset.lodging || Number(req.beds) !== preset.beds)) throw new Error("The room slot capacity is fixed at two beds and four people.");
      if (roomNo && rooms.some((r) => r.id !== old?.id && r.lodging === hotel && r.roomNo.toLowerCase() === roomNo.toLowerCase())) throw new Error("This hotel room number is already in the inventory.");
      const current = roster2(book);
      const assigned = old ? current.guests.filter((g) => offsiteRoomFor(g, rooms)?.id === old.id) : [];
      if (assigned.some((g) => Number(g.roomCode.match(/B(\d+)$/)?.[1]) > beds)) throw new Error("A guest is assigned to a bed you are removing. Reassign them first.");
      if (assigned.some((g) => !g.sourceWritable)) throw new Error("Resolve duplicate attendee identities before changing this room.");
      const id = old?.id || runtime.uuid();
      const label = old?.label || `Provisional room ${rooms.filter((r) => r.lodging === hotel && !defaultOffsiteRoom(r.id)).length + 1}`;
      const values = [id, hotel, roomNo, String(beds), label, runtime.uuid()];
      const { sheet, rows } = table2(book, "Offsite Rooms");
      const index = rows.findIndex((r) => r[0] === id);
      writeRow(sheet, index < 0 ? sheet.getLastRow() + 1 : index + 1, values);
      if (old && assigned.some((g) => g.roomNo !== roomNo)) {
        const identities = new Set(assigned.map((g) => g.sourceIdentity));
        current.rows.forEach((r, i) => {
          if (i > 0 && identities.has(attendeeKey(r))) current.sheet.getRange(i + 1, 31, 1, 1).setNumberFormat("@").setValues([[literal2(roomNo)]]);
        });
      }
      runtime.flush();
      const confirmed = hotelRooms2(book).find((r) => r.id === id);
      if (!confirmed || confirmed.roomNo !== roomNo || confirmed.beds !== beds || roster2(book).guests.some((g) => assigned.some((a) => a.sourceIdentity === g.sourceIdentity) && g.roomNo !== roomNo)) throw new Error("Room changes could not be confirmed. Refresh before retrying.");
      history(book, req, id, old || {}, confirmed);
    }
    function clean2(value, max = 100) {
      if (typeof value !== "string" || value.length > max || /[\r\n\x00]/.test(value))
        throw new Error(
          "Assignment fields must be single-line text within their length limit."
        );
      return value.trim();
    }
    function transport(book, req) {
      const group = transportGroups(roster2(book).guests, req.direction).find(
        (g) => g.id === req.id
      );
      if (!group || !group.day || group.signature !== req.signature || group.guests.some((g) => !g.sourceWritable))
        throw new Error(
          "The travel details or attendee list changed, or dates are missing. Refresh and review this journey."
        );
      const { sheet, rows } = table2(book, "Transport Assignments");
      const matches = rows.map((row, index) => ({ row, index })).filter((x) => x.index > 0 && x.row[0] === group.id);
      if (matches.length > 1)
        throw new Error(
          "Duplicate journey records in Transport Assignments. Resolve them in the sheet."
        );
      const match = matches[0];
      if ((match?.row[11] || "") !== req.expectedRevision)
        throw new Error(
          "Another admin changed this journey. Refresh before saving."
        );
      if (match && req.expectedPlan && !equal(
        [match.row[6], match.row[7], match.row[8], match.row[9], match.row[10]],
        [req.expectedPlan.driver, req.expectedPlan.vehicle, req.expectedPlan.pickup, req.expectedPlan.status, req.expectedPlan.notes]
      )) throw new Error("Someone edited this journey in the sheet. Refresh before saving.");
      const data = plans2(book);
      const driver = clean2(req.plan.driver), vehicle = clean2(req.plan.vehicle), pickup = clean2(req.plan.pickup), notes = clean2(req.plan.notes, 500), status = clean2(req.plan.status);
      if (driver && !data.drivers.includes(driver))
        throw new Error("Choose an active driver.");
      if (vehicle && !data.vehicles.includes(vehicle))
        throw new Error("Choose an active vehicle.");
      if (!["Planned", "Dispatched", "Completed"].includes(status))
        throw new Error("Choose a valid journey status.");
      if (status !== "Planned" && (!driver || !vehicle))
        throw new Error("Assign both a driver and vehicle before dispatching.");
      if (pickup && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(pickup) || Number.isNaN(Date.parse(pickup))))
        throw new Error("Enter a valid pickup date and time.");
      const values = [
        group.id,
        group.direction,
        group.day,
        group.flight || group.method,
        group.airport,
        group.guests.map((g) => g.name).join(", "),
        driver,
        vehicle,
        pickup,
        status,
        notes,
        runtime.uuid(),
        (/* @__PURE__ */ new Date()).toISOString(),
        req.requestId
      ];
      writeRow(sheet, match ? match.index + 1 : sheet.getLastRow() + 1, values);
      runtime.flush();
      const confirmed = table2(book, "Transport Assignments").rows.find(
        (r) => r[0] === group.id
      );
      if (!confirmed || !equal(confirmed, values))
        throw new Error(
          "Journey save could not be confirmed. Refresh before retrying."
        );
      history(book, req, group.id, match?.row || [], values);
    }
    function resource(book, req) {
      if (!["Driver", "Vehicle"].includes(req.type))
        throw new Error("Invalid resource type.");
      const name = clean2(req.name);
      if (!name) throw new Error("Enter a name.");
      const active = req.active === true;
      if (!active) {
        const data = plans2(book);
        if (data.assignments.some(
          (p) => (req.type === "Driver" ? p.driver : p.vehicle) === name && p.status !== "Completed"
        ))
          throw new Error(
            "This resource is assigned to an active journey. Clear those assignments before removing it."
          );
      }
      const { sheet, rows } = table2(book, "Transport Resources");
      const match = rows.findIndex(
        (r, i) => i > 0 && r[0] === req.type && r[1].toLowerCase() === name.toLowerCase()
      );
      const values = [
        req.type,
        match > 0 ? rows[match][1] : name,
        active ? "Yes" : "No",
        (/* @__PURE__ */ new Date()).toISOString()
      ];
      writeRow(sheet, match > 0 ? match + 1 : sheet.getLastRow() + 1, values);
      runtime.flush();
      history(
        book,
        req,
        req.type + ": " + name,
        match > 0 ? rows[match] : [],
        values
      );
    }
    return { table: table2, roster: roster2, plans: plans2, hotelRooms: hotelRooms2, tripDisplay: tripDisplay2, housekeeping: housekeeping2, snapshot: snapshot2, clean: clean2, mutate: (book, req) => ({ lodging, guest, linen, offsite, transport, resource, "trip-display": setTripDisplay })[req.action](book, req) };
  }

  // shared/workspace-sync.js
  var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  var rowKey = (table2, row) => table2 === "Attendees" ? attendeeKey(row) : table2 === "Transport Resources" ? JSON.stringify([row[0], row[1]?.toLowerCase()]) : row[0];
  function overlayChanges(tables, changes, checkConflicts = false) {
    const next = JSON.parse(JSON.stringify(tables));
    for (const change of changes) {
      const { table: table2, key, before, after, columns } = change;
      const rows = next[table2] || (next[table2] = [TABLES[table2]]);
      const matches = rows.map((r, i) => ({ r, i })).filter((x) => x.i && rowKey(table2, x.r) === key);
      if (matches.length > 1) throw new Error(`Duplicate records in ${table2}.`);
      if (!matches.length) {
        if (before) throw new Error(`A record awaiting synchronization was removed from ${table2}.`);
        rows.push([...after]);
        continue;
      }
      const current = matches[0].r;
      if (!before && checkConflicts && !same(current.slice(0, after.length), after)) throw new Error(`A new record conflicts with an existing ${table2} record.`);
      for (const col of columns) {
        if (checkConflicts && current[col] !== (before?.[col] ?? "") && current[col] !== after[col]) throw new Error(`A direct edit in ${table2} conflicts with a saved dashboard change. Review synchronization.`);
        current[col] = after[col];
      }
    }
    return next;
  }

  // apps-script/database-sync.js
  function assertSyncKey(req) {
    const key = PropertiesService.getScriptProperties().getProperty("DATABASE_SYNC_KEY");
    if (!key || typeof req.syncKey !== "string" || req.syncKey !== key) throw new Error("Invalid synchronization authorization.");
  }
  var literal = (value) => /^[=+\-@']/.test(String(value)) ? "'" + value : String(value);
  function databaseExchange(req, engine2) {
    assertSyncKey(req);
    if (!Array.isArray(req.jobs) || req.jobs.length > 20 || !/^[a-zA-Z0-9-]{20,80}$/.test(req.stream || "")) throw new Error("Invalid synchronization batch.");
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(2e4)) throw new Error("The source sheet is busy.");
    try {
      const props = PropertiesService.getScriptProperties();
      const stream = props.getProperty("DATABASE_SYNC_STREAM");
      if (stream && stream !== req.stream) throw new Error("The database synchronization stream changed. Review before reconnecting.");
      if (!stream) props.setProperty("DATABASE_SYNC_STREAM", req.stream);
      let ack = Number(props.getProperty("DATABASE_SYNC_ACK") || 0);
      const book = SpreadsheetApp.openById(SPREADSHEET_ID);
      const exportTables = () => {
        const tables2 = { Attendees: engine2.roster(book).rows };
        for (const name of Object.keys(TABLES)) tables2[name] = engine2.table(book, name, true).rows;
        return tables2;
      };
      let tables = exportTables();
      for (const job of req.jobs) {
        if (!Number.isSafeInteger(job.seq) || job.seq < 1 || !Array.isArray(job.changes)) throw new Error("Invalid synchronization sequence.");
        if (job.seq <= ack) continue;
        if (job.seq !== ack + 1) throw new Error("A synchronization batch is missing. Retry in order.");
        for (const c of job.changes) {
          if (!(c.table === "Attendees" || TABLES[c.table]) || !Array.isArray(c.after) || !Array.isArray(c.columns) || c.columns.some((col) => !Number.isInteger(col) || col < 0 || col >= c.after.length)) throw new Error("Invalid field patch.");
          if (c.table === "Attendees" && c.before && c.columns.some((col) => col < 29 || col > 31)) throw new Error("Registration fields are read-only.");
        }
        overlayChanges(tables, job.changes, true);
        for (const change of job.changes) {
          const { table: table2, key, after, columns } = change;
          const sheet = table2 === "Attendees" ? engine2.roster(book).sheet : engine2.table(book, table2).sheet;
          const currentRows = table2 === "Attendees" ? engine2.roster(book).rows : engine2.table(book, table2).rows;
          const index = currentRows.findIndex((row, i) => i > 0 && rowKey(table2, row) === key);
          if (index < 0) sheet.getRange(sheet.getLastRow() + 1, 1, 1, after.length).setNumberFormat("@").setValues([after.map(literal)]);
          else {
            const pending = columns.filter((col) => currentRows[index][col] !== after[col]);
            while (pending.length) {
              const start = pending.shift();
              let end = start;
              while (pending[0] === end + 1) end = pending.shift();
              sheet.getRange(index + 1, start + 1, 1, end - start + 1).setNumberFormat("@").setValues([after.slice(start, end + 1).map(literal)]);
            }
          }
        }
        SpreadsheetApp.flush();
        tables = exportTables();
        for (const c of job.changes) {
          const rows = tables[c.table].slice(1).filter((row) => rowKey(c.table, row) === c.key);
          if (rows.length !== 1 || c.columns.some((col) => rows[0][col] !== c.after[col]) || !c.before && !same(rows[0].slice(0, c.after.length), c.after)) throw new Error("Sheet synchronization could not be confirmed. The batch will retry safely.");
        }
        ack = job.seq;
        props.setProperty("DATABASE_SYNC_ACK", String(ack));
      }
      tables["Assignment History"] = [TABLES["Assignment History"]];
      const adminKey = props.getProperty("ADMIN_ACCESS_KEY");
      if (!adminKey) throw new Error("Admin access is not configured.");
      const adminDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, adminKey, Utilities.Charset.UTF_8).map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, "0")).join("");
      return { ok: true, tables, ack, adminDigest };
    } finally {
      lock.releaseLock();
    }
  }

  // apps-script/server.js
  var engine = createWorkspaceEngine({
    uuid: () => Utilities.getUuid(),
    today: () => Utilities.formatDate(/* @__PURE__ */ new Date(), "America/New_York", "yyyy-MM-dd"),
    flush: () => SpreadsheetApp.flush()
  });
  var { table, roster, plans, hotelRooms, tripDisplay, housekeeping, snapshot, clean } = engine;
  function spreadsheet() {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  function setupHospitality() {
    const book = spreadsheet();
    roster(book);
    Object.keys(TABLES).forEach((name) => table(book, name));
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty("ADMIN_ACCESS_KEY")) props.setProperty("ADMIN_ACCESS_KEY", Utilities.getUuid() + Utilities.getUuid());
    return "Hospitality tabs ready. Admin access is configured. Run showAdminLink to retrieve the private admin link.";
  }
  function showAdminLink() {
    const key = PropertiesService.getScriptProperties().getProperty("ADMIN_ACCESS_KEY");
    if (!key) throw new Error("Run setupHospitality first.");
    return `https://www.sahebjiyouth.org/mandir-hospitality/#guests?admin=${encodeURIComponent(key)}`;
  }
  function doGet(e) {
    const origin = e?.parameter?.origin;
    const channel = e?.parameter?.channel || "";
    const allowed = [
      "https://www.sahebjiyouth.org",
      "https://sahebjiyouth.org",
      "http://localhost:5174",
      "http://127.0.0.1:5174"
    ];
    if (!allowed.includes(origin) || !/^[a-zA-Z0-9-]{20,80}$/.test(channel))
      return ContentService.createTextOutput(
        JSON.stringify({ ok: true, service: "Mandir Hospitality", version: 1 })
      ).setMimeType(ContentService.MimeType.JSON);
    return HtmlService.createHtmlOutput(
      bridge_default.replace("__CONFIG__", JSON.stringify({ origin, channel }))
    ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  function doPost(e) {
    let result;
    try {
      const raw = e?.postData?.contents || "";
      if (raw.length > 512e3) throw new Error("Oversized request.");
      const req = JSON.parse(raw);
      if (req.action === "database-sync") result = databaseExchange(req, engine);
      else if (req.action === "database-service") {
        assertSyncKey(req);
        if (!["flight", "accommodation-notifications"].includes(req.request?.action)) throw new Error("Unsupported database service.");
        result = hospitalityRequest(req.request, true);
      } else {
        if (!["notification-authorize", "notification-flight"].includes(req.action)) throw new Error("Unsupported server request.");
        result = hospitalityRequest(req);
      }
    } catch (error) {
      result = { ok: false, error: error.message || "Invalid server request." };
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  function accommodationNotifications(req) {
    if (!["preview", "queue"].includes(req.mode)) throw new Error("Choose preview or queue.");
    if (req.mode === "queue" && !/^[a-zA-Z0-9-]{20,80}$/.test(req.requestId || "")) throw new Error("Missing request identifier.");
    const response = UrlFetchApp.fetch("https://sahebjiyouth-reg-api.azurewebsites.net/api/hospitality-notifications", {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({ mode: req.mode, requestId: req.requestId, previewHash: req.previewHash, accessKey: req.accessKey })
    });
    const result = JSON.parse(response.getContentText());
    if (response.getResponseCode() !== 200 || !result.ok) throw new Error(result.error || "Notification service is unavailable. No new batch was confirmed.");
    return result;
  }
  function hospitalityRequest(req, local = false) {
    const lock = LockService.getScriptLock();
    try {
      if (!req || JSON.stringify(req).length > 16e3)
        throw new Error("Invalid or oversized request.");
      const databaseUrl = PropertiesService.getScriptProperties().getProperty("DATABASE_API_URL");
      if (!local && databaseUrl && !["notification-authorize", "notification-flight"].includes(req.action)) {
        if (!/^https:\/\/[a-z0-9-]+\.usayouth\.workers\.dev\/api$/.test(databaseUrl)) throw new Error("Invalid database endpoint.");
        const response = UrlFetchApp.fetch(databaseUrl, { method: "post", contentType: "application/json", muteHttpExceptions: true, payload: JSON.stringify(req) });
        return JSON.parse(response.getContentText());
      }
      if (!["snapshot", "lodging", "transport", "resource", "flight", "linen", "offsite", "guest", "trip-display", "trip-display-read", "notification-authorize", "notification-flight", "accommodation-notifications"].includes(
        req.action
      ))
        throw new Error("Unknown action.");
      const key = PropertiesService.getScriptProperties().getProperty("ADMIN_ACCESS_KEY");
      const role = key && typeof req.accessKey === "string" && req.accessKey === key ? "admin" : "viewer";
      if (req.action === "notification-authorize") return { ok: true, authorized: role === "admin" };
      if (req.action === "notification-flight") {
        const current = roster(spreadsheet());
        const group = transportGroups(current.guests, "Arrivals").find((g) => g.id === req.tripId && g.method === "Flight");
        if (!group) throw new Error("This pickup flight is no longer in the roster.");
        return { ok: true, flight: flightStatus({ day: group.day, flight: group.flight, airport: group.airport, direction: "Arrivals" }, true) };
      }
      if (!["snapshot", "flight", "trip-display", "trip-display-read"].includes(req.action) && role !== "admin") throw new Error("Admin access is required to change this view-only dashboard. Open your private admin link.");
      if (req.action === "accommodation-notifications") return accommodationNotifications(req);
      if (req.action === "flight") return { ok: true, flight: req.manual === true ? flightStatus(req) : { available: false, reason: "Automatic flight checks are disabled. Reload and choose Check flight status." } };
      if (!lock.tryLock(2e4))
        throw new Error("Another save is in progress. Please retry shortly.");
      const book = spreadsheet();
      if (["trip-display", "trip-display-read"].includes(req.action)) {
        if (req.action === "trip-display") {
          if (!/^[a-zA-Z0-9-]{20,80}$/.test(req.requestId || "")) throw new Error("Missing request identifier.");
          engine.mutate(book, req);
        }
        return { ok: true, tripDisplay: tripDisplay(book) };
      }
      if (req.action !== "snapshot") {
        if (!/^[a-zA-Z0-9-]{20,80}$/.test(req.requestId || ""))
          throw new Error("Missing request identifier.");
        const past = table(book, "Assignment History").rows.some(
          (r, i) => i > 0 && r[0] === req.requestId
        );
        const committed = req.action === "transport" && table(book, "Transport Assignments").rows.some(
          (r, i) => i > 0 && r[13] === req.requestId
        );
        const linenCommitted = req.action === "linen" && table(book, "Housekeeping").rows.some((r, i) => i > 0 && r[7] === req.requestId);
        if (!past && !committed && !linenCommitted)
          engine.mutate(book, req);
      }
      return { ok: true, ...snapshot(book, role) };
    } catch (error) {
      return {
        ok: false,
        error: error.message || "Google Sheets could not complete the request."
      };
    } finally {
      if (lock.hasLock()) lock.releaseLock();
    }
  }
  function flightStatus(req, adjacentDay = false) {
    const today = Utilities.formatDate(
      /* @__PURE__ */ new Date(),
      "America/New_York",
      "yyyy-MM-dd"
    );
    const day = req.day;
    const difference = (Date.parse(day + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 864e5;
    if (day !== today && !(adjacentDay && Number.isFinite(difference) && Math.abs(difference) <= 1))
      return {
        available: false,
        reason: "Flight status is checked on the travel day."
      };
    const number = clean(req.flight).toUpperCase().replace(/\s/g, "");
    const match = number.match(/^([A-Z0-9]{2})(\d{1,4})$/);
    if (!match || !["Arrivals", "Departures"].includes(req.direction))
      throw new Error("Flight number is not recognized.");
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty("FLIGHTSTATS_APP_ID"), key = props.getProperty("FLIGHTSTATS_APP_KEY");
    if (!id || !key)
      return {
        available: false,
        reason: "Live flight service is not configured. Use the airline flight tracker."
      };
    const cache = CacheService.getScriptCache();
    const cacheKey = [
      "flight-v4",
      number,
      day,
      req.direction,
      clean(req.airport)
    ].join(":");
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
    const [year, month, date] = day.split("-");
    const url = `https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/${match[1]}/${match[2]}/${req.direction === "Arrivals" ? "arr" : "dep"}/${year}/${month}/${date}?appId=${encodeURIComponent(id)}&appKey=${encodeURIComponent(key)}`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200)
      return {
        available: false,
        reason: "The flight service is unavailable. Check the airline."
      };
    const body = JSON.parse(response.getContentText());
    const legKey = req.direction === "Arrivals" ? "arrivalAirportFsCode" : "departureAirportFsCode";
    const leg = body.flightStatuses?.find((s) => s[legKey] === req.airport);
    if (!leg)
      return { available: false, reason: "No matching flight at this airport." };
    const suffix = req.direction === "Arrivals" ? "GateArrival" : "GateDeparture";
    const times = leg.operationalTimes || {};
    const scheduled = times["scheduled" + suffix] || {};
    const latest = times["actual" + suffix] || times["estimated" + suffix] || {};
    const landed = leg.status === "L" || !!times.actualRunwayArrival || !!times.actualGateArrival;
    const inTransit = leg.status !== "C" && !landed && (leg.status === "A" || !!times.actualRunwayDeparture);
    const providerDelay = leg.delays?.[req.direction === "Arrivals" ? "arrivalGateDelayMinutes" : "departureGateDelayMinutes"];
    const result = {
      available: true,
      rawStatus: leg.status,
      inTransit,
      landed,
      status: {
        S: "Scheduled",
        A: "Active",
        L: "Landed",
        C: "Cancelled",
        D: "Diverted"
      }[leg.status] || "Status unavailable",
      scheduled: scheduled.dateLocal || "",
      estimated: latest.dateLocal || "",
      scheduledUtc: scheduled.dateUtc || "",
      estimatedUtc: latest.dateUtc || "",
      flightId: String(leg.flightId || ""),
      actualRunwayDepartureUtc: times.actualRunwayDeparture?.dateUtc || "",
      scheduledDepartureUtc: (times.scheduledGateDeparture || times.scheduledRunwayDeparture || {}).dateUtc || "",
      expectedArrivalUtc: (times.estimatedRunwayArrival || times.estimatedGateArrival || times.scheduledGateArrival || {}).dateUtc || "",
      delayMinutes: typeof providerDelay === "number" && Number.isFinite(providerDelay) ? providerDelay : null,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    cache.put(cacheKey, JSON.stringify(result), 300);
    return result;
  }
  return __toCommonJS(server_exports);
})();

function doGet(e) { return Hospitality.doGet(e); }
function doPost(e) { return Hospitality.doPost(e); }
function hospitalityRequest(request) { return Hospitality.hospitalityRequest(request); }
function setupHospitality_() { console.log(Hospitality.setupHospitality()); }
function showAdminLink_() { console.log(Hospitality.showAdminLink()); }
