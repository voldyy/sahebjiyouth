export const OFFSITE_HOTELS = ["Hawthorn", "Hilton"];
export const LEGACY_OFFSITE_HOTELS = { "Comfort Inn": "Hawthorn", "Hilton Garden Inn": "Hilton" };
export const normalizeOffsiteHotel = (hotel) => LEGACY_OFFSITE_HOTELS[hotel] ?? hotel;

const SLOT_COUNTS = { Hawthorn: 30, Hilton: 4 };
const slotId = (hotel, number) => `${hotel === "Hilton" ? "hilton" : "hawthorn"}-r${String(number).padStart(2, "0")}`;
export const HAWTHORN_ROOM_TYPES = {
  king: { label: "King", beds: 2, physicalBeds: 1, peoplePerBed: 2 },
  doubleQueen: { label: "Double Queen", beds: 4, physicalBeds: 2, peoplePerBed: 2 },
};
export const roomTypeFor = (room) => Number(room?.beds) === HAWTHORN_ROOM_TYPES.king.beds ? "king" : "doubleQueen";
export const roomTypeLabel = (room) => HAWTHORN_ROOM_TYPES[roomTypeFor(room)].label;

export const DEFAULT_OFFSITE_ROOMS = OFFSITE_HOTELS.flatMap((lodging) =>
  Array.from({ length: SLOT_COUNTS[lodging] }, (_, index) => {
    const slot = `${lodging === "Hilton" ? "HL" : "R"}${String(index + 1).padStart(2, "0")}`;
    return {
      id: slotId(lodging, index + 1),
      number: slotId(lodging, index + 1),
      lodging,
      roomNo: "",
      ...HAWTHORN_ROOM_TYPES.doubleQueen,
      label: slot,
      revision: `default-${slot.toLowerCase()}-v1`,
      isDefaultSlot: true,
    };
  }),
);

export const defaultOffsiteRoom = (id) => DEFAULT_OFFSITE_ROOMS.find((room) => room.id === id) || null;
const slotNumber = label => Number(String(label || "").match(/^(?:HR|HL|R)([0-9]+)$/i)?.[1]) || null;
export function readHotelInventory(value, hotel) {
  const labels = JSON.parse(value);
  const prefix = hotel === "Hilton" ? /^HL[0-9]+$/ : /^(?:HR|R)[0-9]+$/;
  if (!OFFSITE_HOTELS.includes(hotel) || !Array.isArray(labels) || labels.some(label => typeof label !== "string" || !prefix.test(label) || !slotNumber(label)) || new Set(labels.map(slotNumber)).size !== labels.length) throw new Error("Invalid hotel room inventory. Review Hotel Inventory.");
  return labels;
}
export function withDefaultOffsiteRooms(rooms, inventory = {}) {
  const active = OFFSITE_HOTELS.flatMap(lodging => inventory[lodging] === undefined
    ? DEFAULT_OFFSITE_ROOMS.filter(room => room.lodging === lodging)
    : inventory[lodging].map(label => {
      const number = slotNumber(label), id = slotId(lodging, number);
      return { ...(defaultOffsiteRoom(id) || { id, number: id, lodging, roomNo: "", ...HAWTHORN_ROOM_TYPES.doubleQueen, revision: `default-${label.toLowerCase()}-v1`, isDefaultSlot: true }), label };
    }));
  const saved = new Map(rooms.filter(room => OFFSITE_HOTELS.includes(normalizeOffsiteHotel(room.lodging))).map(room => [room.id, { ...room, lodging: normalizeOffsiteHotel(room.lodging) }]));
  const used = new Set();
  const defaults = active.map(room => {
    const numbered = [...saved.values()].filter(r => !defaultOffsiteRoom(r.id) && r.lodging === room.lodging && slotNumber(r.label) === slotNumber(room.label));
    const existing = saved.get(room.id) || (numbered.length === 1 ? numbered[0] : null);
    if (existing) used.add(existing.id);
    return { ...room, ...(existing || {}), ...(inventory[room.lodging] !== undefined ? { label: room.label } : {}) };
  });
  const custom = [...saved.values()].filter(room => !used.has(room.id) && !defaultOffsiteRoom(room.id) && (inventory[room.lodging] === undefined || !slotNumber(room.label) || inventory[room.lodging].some(label => slotNumber(label) === slotNumber(room.label))));
  return [...defaults, ...custom];
}

export const roomBedCount = (room) => room.physicalBeds || room.beds;
export const roomPeoplePerBed = (room) => room.peoplePerBed || 1;
export const roomPlace = (room, position) => ({
  bed: Math.ceil(Number(position) / roomPeoplePerBed(room)),
  place: ((Number(position) - 1) % roomPeoplePerBed(room)) + 1,
});
export const roomPlaceLabel = (room, position) => {
  const { bed, place } = roomPlace(room, position);
  return roomPeoplePerBed(room) > 1 ? `Bed ${bed} · Guest ${place}` : `Bed ${bed}`;
};
export const roomCapacityLabel = (room) => roomPeoplePerBed(room) > 1
  ? `${roomBedCount(room)} ${roomBedCount(room) === 1 ? "bed" : "beds"} · ${room.beds} people`
  : `${room.beds} beds`;
export const offsiteBedCode = (room, bed) => `O${room.id}B${bed}`;
export const roomLabel = (room) => OFFSITE_HOTELS.includes(room.lodging) ? (room.roomNo ? `Room ${room.roomNo}` : room.label) : `Room ${room.number}`;
export function offsiteRoomFor(guest, rooms) {
  const hotel = normalizeOffsiteHotel(guest.lodging);
  const candidates = rooms.filter(room => room.lodging === hotel);
  const internal = candidates.find(room => new RegExp(`^O${room.id}B[1-9]\\d*$`).test(guest.roomCode || ""));
  if (internal) return internal;
  const external = String(guest.roomCode || "").match(/^(HR|HL)([0-9]+)B[1-9]\d*$/i);
  if (external && (hotel === "Hawthorn" ? external[1].toUpperCase() === "HR" : hotel === "Hilton" && external[1].toUpperCase() === "HL")) return candidates.find(room => slotNumber(room.label) === Number(external[2]));
  if (!guest.roomCode && guest.roomNo) return candidates.find(room => room.roomNo === guest.roomNo || room.label === guest.roomNo);
  return null;
}
