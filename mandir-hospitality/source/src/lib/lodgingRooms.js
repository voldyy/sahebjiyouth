// Confirmed Samarpan inventory; hotel inventories have not been supplied.
export const samarpanRooms = [
  { number: "203", beds: 4 },
  { number: "204", beds: 3 },
  { number: "205", beds: 4 },
  { number: "206", beds: 4 },
  { number: "207", beds: 4 },
  { number: "100", beds: 7 },
  { number: "101", beds: 12 },
  { number: "102", beds: 12 },
  { number: "103", beds: 12 },
  { number: "104", beds: 12 },
];
export const samarpanBedCount = samarpanRooms.reduce((sum, room) => sum + room.beds, 0);

export function samarpanRoomCode(roomNo, bedNo) {
  const room = samarpanRooms.find((r) => r.number === String(roomNo));
  const bed = Number(bedNo);
  if (!room || !Number.isInteger(bed) || bed < 1 || bed > room.beds) return "";
  return `S${room.number}B${bed}`;
}
