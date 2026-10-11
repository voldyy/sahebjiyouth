import { useRef } from "react";
import { BedDouble, ChevronLeft, ChevronRight, Plus, AlertCircle } from "lucide-react";
import { samarpanRooms, samarpanRoomCode } from "../lib/lodgingRooms";
import { roomLabel } from "../lib/offsite";
import { bedState, moveDay, shortDay, fullDay, localDay, onDay } from "../lib/occupancy";

export function RoomStrip({ selected, onSelect, rooms = samarpanRooms, lodging = "Samarpan" }) {
  const strip = useRef(null);
  return <section className="stay-room-selector" aria-label={`Choose a ${lodging} room`}>
    <button className="stay-arrow" aria-label="Scroll rooms left" onClick={() => strip.current?.scrollBy({ left: -300, behavior: "smooth" })}><ChevronLeft size={18} /></button>
    <div className="stay-room-strip" ref={strip}>{rooms.map((room) => <button key={room.number} className={`stay-room-chip ${selected === room.number ? "is-selected" : ""}`} aria-pressed={selected === room.number} onClick={() => onSelect(room.number)}><BedDouble size={20} /><span><strong>{roomLabel(room)}</strong><small>{room.beds} beds{room.lodging && !room.roomNo ? " · Number pending" : ""}</small></span></button>)}</div>
    <button className="stay-arrow" aria-label="Scroll rooms right" onClick={() => strip.current?.scrollBy({ left: 300, behavior: "smooth" })}><ChevronRight size={18} /></button>
  </section>;
}

function BedSlot({ guests, room, bed, day, onAssign, onEdit, saving, compact = false, rooms = [], drag }) {
  const state = bedState(guests, room.number, bed, { start: day, end: moveDay(day, 1) }, null, room.lodging || "Samarpan", rooms);
  const conflict = state.occupants.length > 1;
  const hovered = drag?.target === `${room.number}:${bed}`;
  const preview = hovered && drag?.guest && onDay(drag.guest, day);
  const problem = hovered && drag?.problem;
  return <div className={`stay-slot ${state.free ? "is-free" : "is-occupied"} ${conflict || state.uncertain.length ? "needs-review" : ""} ${compact ? "is-compact" : ""} ${preview ? (problem ? "drop-conflict" : "drop-preview") : ""}`} data-room={room.number} data-bed={bed} data-day={day}
    onDragOver={(e) => { if (drag?.guest && !saving) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; drag.hover(room, bed); } }}
    onDrop={(e) => { e.preventDefault(); if (drag?.guest && !saving) drag.drop(e.dataTransfer.getData("application/x-mandir-guest"), room, bed); }}>
    {compact && <span className="stay-bed-caption">Bed {bed}</span>}
    {preview && <span className="stay-drop-label">{problem ? "Stay conflicts" : drag.guest.name}</span>}
    {state.free ? <button className="stay-empty" disabled={saving} onClick={() => onAssign(room.number, bed, day)} aria-label={`Assign room ${room.number} bed ${bed} on ${fullDay(day)}`}><Plus size={15} /><span>Empty bed</span></button> : <>
      {conflict && <span className="stay-conflict"><AlertCircle size={12} /> Double booking</span>}
      {state.occupants.map((guest) => <button className="stay-occupant" key={guest.id} disabled={saving} onClick={() => onEdit(guest)} aria-label={`Edit ${guest.name}, room ${room.number} bed ${bed}, ${shortDay(day)}`}><span className="stay-guest-initials">{guest.initials}</span><span>{guest.name}</span></button>)}
      {state.uncertain.length > 0 && <div className="stay-uncertain"><span>Needs review</span>{state.uncertain.map((guest) => <button key={guest.id} onClick={() => onEdit(guest)} disabled={saving}>{guest.name}</button>)}</div>}
    </>}
  </div>;
}

export function WeeklyRooms({ guests, room, week, onAssign, onEdit, saving, onChooseDay, rooms, drag }) {
  const days = Array.from({ length: 7 }, (_, i) => moveDay(week, i));
  return <section className="stay-calendar-panel" aria-label={`${roomLabel(room)} weekly occupancy`}>
    <div className="stay-panel-title"><div><h2>{roomLabel(room)}</h2><p>{room.lodging || "Samarpan"} · {room.beds} beds{room.lodging && !room.roomNo ? " · Hotel room number pending" : ""}</p></div><div className="stay-legend"><span><i className="legend-occupied" /> Occupied</span><span><i /> Empty</span></div></div>
    <div className="stay-grid-scroll" tabIndex={0} role="region" aria-label="Weekly bed calendar; scroll horizontally for all seven days">
      <table className="stay-week-grid"><thead><tr><th scope="col">Bed</th>{days.map((day) => <th scope="col" key={day}><button onClick={() => onChooseDay(day)} aria-label={`Open daily view for ${fullDay(day)}`}><span>{localDay(day).toLocaleDateString("en-US", { weekday: "short" })}</span><strong>{shortDay(day)}</strong></button></th>)}</tr></thead>
        <tbody>{Array.from({ length: room.beds }, (_, i) => i + 1).map((bed) => <tr key={bed}><th scope="row"><BedDouble size={16} /><strong>Bed {bed}</strong><small>{room.lodging ? `${room.roomNo || "Pending"} · B${bed}` : samarpanRoomCode(room.number, bed)}</small></th>{days.map((day) => <td key={day}><BedSlot guests={guests} room={room} bed={bed} day={day} onAssign={onAssign} onEdit={onEdit} saving={saving} rooms={rooms} drag={drag} /></td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="stay-calendar-note">Each column is the night beginning that day. Checkout day is free. Drag a guest onto a bed row to assign their full stay, or tap an empty bed.</p>
  </section>;
}

export function DailyRooms({ guests, day, onAssign, onEdit, saving, rooms = samarpanRooms, lodging = "Samarpan", drag }) {
  return <section className="stay-daily-rooms" aria-label={`All ${lodging} rooms`}>{rooms.map((room) => {
    const beds = Array.from({ length: room.beds }, (_, i) => i + 1);
    const free = beds.filter((bed) => bedState(guests, room.number, bed, { start: day, end: moveDay(day, 1) }, null, lodging, rooms).free).length;
    return <article className="stay-day-room" key={room.number} aria-label={roomLabel(room)}><header><div><BedDouble size={21} /><h2>{roomLabel(room)}</h2></div><span className={free ? "stay-free-count" : "stay-full-count"}>{free} / {room.beds} beds empty</span></header><div className="stay-day-beds">{beds.map((bed) => <BedSlot key={bed} guests={guests} room={room} bed={bed} day={day} onAssign={onAssign} onEdit={onEdit} saving={saving} compact rooms={rooms} drag={drag} />)}</div></article>;
  })}</section>;
}
