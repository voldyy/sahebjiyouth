import { guestsFromRows } from "../src/lib/sheets.js";
import { normalizeOffsiteHotel, offsiteRoomFor } from "../src/lib/offsite.js";

export function renumberHawthornTables(tables, rooms, revision) {
  const active = rooms.filter(room => room.lodging === "Hawthorn").sort((a,b) => Number(a.label.slice(2))-Number(b.label.slice(2)));
  if (active.length !== 23 || active.some(room => !/^HR\d+$/.test(room.label))) throw Error("Review Hawthorn inventory: expected 23 numbered rooms.");
  const mapping = Object.fromEntries(active.map((room,index) => [room.label, `HR${String(index+1).padStart(2,"0")}`]));
  const labels = Object.values(mapping);
  if (new Set(Object.keys(mapping)).size !== 23) throw Error("Duplicate Hawthorn room labels.");
  if (active.every(room => mapping[room.label] === room.label)) return { changed: false, mapping, tables };
  const guests = guestsFromRows(tables.Attendees);
  const updates = new Map();
  for (const guest of guests.filter(g => g.lodging === "Hawthorn")) {
    const old = offsiteRoomFor(guest, rooms);
    if (!old || !mapping[old.label]) throw Error(`Unable to identify Hawthorn room for ${guest.name}.`);
    const bed = String(guest.roomCode || "").match(/B([1-9]\d*)$/)?.[1];
    if (guest.roomCode && (!bed || Number(bed)>old.beds)) throw Error(`Review bed assignment for ${guest.name}.`);
    const label = mapping[old.label];
    updates.set(guest.sourceIdentity,["Hawthorn",old.roomNo || label,bed ? `${label}B${bed}` : ""]);
  }
  const attendees = tables.Attendees.map((row,index) => {
    if(!index)return [...row];
    const identity=JSON.stringify([String(row[0]||'').trim(),String(row[8]||'').trim(),String(row[9]||'').trim()]);
    const next=[...row];if(updates.has(identity))next.splice(29,3,...updates.get(identity));return next;
  });
  const stored=[tables["Offsite Rooms"][0],...tables["Offsite Rooms"].slice(1).filter(row=>normalizeOffsiteHotel(row[1])!=="Hawthorn")];
  active.forEach((room,index)=>stored.push([`hawthorn-r${String(index+1).padStart(2,"0")}`,"Hawthorn",room.roomNo,String(room.beds),labels[index],`${revision}-${index+1}`]));
  const inventory=tables["Hotel Inventory"].map((row,index)=>index&&normalizeOffsiteHotel(row[0])==="Hawthorn"?["Hawthorn",JSON.stringify(labels)]:[...row]);
  if(!inventory.slice(1).some(row=>row[0]==="Hawthorn"))throw Error("Hawthorn inventory record is missing.");
  const housekeeping=tables.Housekeeping.map((row,index)=>{
    const next=[...row];if(!index)return next;
    const code=String(row[3]||"");
    const old=active.find(room=>new RegExp(`^${room.label}B[1-9]\\d*$`).test(code)||new RegExp(`^O${room.id}B[1-9]\\d*$`).test(code));
    if(!old)return next;
    const label=mapping[old.label],bed=code.match(/B([1-9]\d*)$/)[1],newCode=`${label}B${bed}`;
    const id=JSON.parse(row[0]);if(!Array.isArray(id)||id.length!==4||id[1]!==code)throw Error("Review Hawthorn housekeeping identity.");
    id[1]=newCode;next[0]=JSON.stringify(id);next[1]=old.roomNo||label;next[3]=newCode;return next;
  });
  return { changed:true,mapping,tables:{...tables,Attendees:attendees,"Offsite Rooms":stored,"Hotel Inventory":inventory,Housekeeping:housekeeping} };
}
