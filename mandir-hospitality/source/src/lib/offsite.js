export const OFFSITE_HOTELS = ["Comfort Inn", "Hilton Garden Inn"];
export const offsiteBedCode = (room, bed) => `O${room.id}B${bed}`;
export const roomLabel = (room) => room.lodging && room.lodging !== "Samarpan" ? (room.roomNo ? `Room ${room.roomNo}` : room.label) : `Room ${room.number}`;
export function offsiteRoomFor(guest, rooms) {
  return rooms.find((room) => room.lodging === guest.lodging && new RegExp(`^O${room.id}B[1-9]\\d*$`).test(guest.roomCode || ""));
}
