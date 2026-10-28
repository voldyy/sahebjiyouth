import { offsiteBedCode } from "./offsite.js";

// Confirmed on-site inventory; hotels use separately managed planning rooms.
export const samarpanRooms = [
  { number: "201", beds: 2 },
  { number: "202", beds: 2 },
  { number: "203", beds: 4 },
  { number: "204", beds: 4 },
  { number: "205", beds: 4 },
  { number: "206", beds: 4 },
  { number: "207", beds: 4 },
  { number: "100", beds: 7 },
  { number: "101", beds: 12 },
  { number: "102", beds: 14 },
  { number: "103", beds: 13 },
  { number: "104", beds: 15 },
];
export const samarpanBedCount = samarpanRooms.reduce((sum, room) => sum + room.beds, 0);

export const sadhakRooms = [
  { number: "101", beds: 3 },
  { number: "102", beds: 3 },
  { number: "104", beds: 2 },
  { number: "201", beds: 1 },
  { number: "202", beds: 3 },
  { number: "203", beds: 2 },
  { number: "204", beds: 2 },
].map(room => ({ ...room, lodging: "Sadhak" }));
export const FIXED_LODGINGS = ["Samarpan", "Sadhak"];
export const fixedRoomsFor = lodging => lodging === "Samarpan" ? samarpanRooms : lodging === "Sadhak" ? sadhakRooms : [];
export const isFixedLodging = lodging => FIXED_LODGINGS.includes(lodging);
// Preserve existing Samarpan/planning-room keys while separating repeated numbers.
export const roomKey = room => room.lodging === "Sadhak" ? `Sadhak:${room.number}` : room.number;

export function fixedRoomCode(lodging, roomNo, bedNo) {
  const room = fixedRoomsFor(lodging).find(r => r.number === String(roomNo));
  const bed = Number(bedNo);
  if (!room || !Number.isInteger(bed) || bed < 1 || bed > room.beds) return "";
  return `${lodging === "Samarpan" ? "S" : "SD"}${room.number}B${bed}`;
}

export function roomAssignment(room, bed) {
  const lodging = room.lodging || "Samarpan";
  return isFixedLodging(lodging)
    ? { lodging, roomNo: room.number, roomCode: fixedRoomCode(lodging, room.number, bed) }
    : { lodging, roomNo: room.roomNo, roomCode: offsiteBedCode(room, bed) };
}

export function samarpanRoomCode(roomNo, bedNo) {
  return fixedRoomCode("Samarpan", roomNo, bedNo);
}
