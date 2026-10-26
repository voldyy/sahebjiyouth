export const OFFSITE_HOTELS = ["Hawthorn"];
export const LEGACY_OFFSITE_HOTELS = { "Comfort Inn": "Hawthorn", "Hilton Garden Inn": "" };
export const normalizeOffsiteHotel = (hotel) => LEGACY_OFFSITE_HOTELS[hotel] ?? hotel;

const SLOT_COUNTS = { Hawthorn: 15 };
const slotId = (hotel, number) => `hawthorn-r${String(number).padStart(2, "0")}`;
export const HAWTHORN_ROOM_TYPES = {
  king: { label: "King", beds: 2, physicalBeds: 1, peoplePerBed: 2 },
  doubleQueen: { label: "Double Queen", beds: 4, physicalBeds: 2, peoplePerBed: 2 },
};
export const roomTypeFor = (room) => Number(room?.beds) === HAWTHORN_ROOM_TYPES.king.beds ? "king" : "doubleQueen";
export const roomTypeLabel = (room) => HAWTHORN_ROOM_TYPES[roomTypeFor(room)].label;

export const DEFAULT_OFFSITE_ROOMS = OFFSITE_HOTELS.flatMap((lodging) =>
  Array.from({ length: SLOT_COUNTS[lodging] }, (_, index) => {
    const slot = `R${String(index + 1).padStart(2, "0")}`;
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
export function withDefaultOffsiteRooms(rooms) {
  const saved = new Map(rooms.filter((room) => normalizeOffsiteHotel(room.lodging)).map((room) => [room.id, { ...room, lodging: normalizeOffsiteHotel(room.lodging) }]));
  const defaults = DEFAULT_OFFSITE_ROOMS.map((room) => ({ ...room, ...(saved.get(room.id) || {}) }));
  const custom = rooms.filter((room) => !defaultOffsiteRoom(room.id) && normalizeOffsiteHotel(room.lodging)).map((room) => ({ ...room, lodging: normalizeOffsiteHotel(room.lodging) }));
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
  return rooms.find((room) => room.lodging === guest.lodging && new RegExp(`^O${room.id}B[1-9]\\d*$`).test(guest.roomCode || ""));
}
