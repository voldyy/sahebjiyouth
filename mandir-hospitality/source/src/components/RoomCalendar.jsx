import { useRef } from "react";
import { BedDouble, ChevronLeft, ChevronRight, Plus, AlertCircle } from "lucide-react";
import { samarpanRooms } from "../lib/lodgingRooms";
import { bedState, moveDay, shortDay, fullDay, localDay } from "../lib/occupancy";

export function RoomStrip({ selected, onSelect }) {
  const strip = useRef(null);
  return <section className="stay-room-selector" aria-label="Choose a Samarpan room">
    <button className="stay-arrow" aria-label="Scroll rooms left" onClick={() => strip.current?.scrollBy({ left: -300, behavior: "smooth" })}><ChevronLeft size={18} /></button>
    <div className="stay-room-strip" ref={strip}>{samarpanRooms.map((room) => <button key={room.number} className={`stay-room-chip ${selected === room.number ? "is-selected" : ""}`} aria-pressed={selected === room.number} onClick={() => onSelect(room.number)}><BedDouble size={20} /><span><strong>Room {room.number}</strong><small>{room.beds} beds</small></span></button>)}</div>
    <button className="stay-arrow" aria-label="Scroll rooms right" onClick={() => strip.current?.scrollBy({ left: 300, behavior: "smooth" })}><ChevronRight size={18} /></button>
  </section>;
}

function BedSlot({ guests, room, bed, day, onAssign, onEdit, saving, compact = false }) {
  const state = bedState(guests, room.number, bed, { start: day, end: moveDay(day, 1) });
  const conflict = state.occupants.length > 1;
  return <div className={`stay-slot ${state.free ? "is-free" : "is-occupied"} ${conflict || state.uncertain.length ? "needs-review" : ""} ${compact ? "is-compact" : ""}`} data-room={room.number} data-bed={bed} data-day={day}>
    {compact && <span className="stay-bed-caption">Bed {bed}</span>}
    {state.free ? <button className="stay-empty" disabled={saving} onClick={() => onAssign(room.number, bed, day)} aria-label={`Assign room ${room.number} bed ${bed} on ${fullDay(day)}`}><Plus size={15} /><span>Empty bed</span></button> : <>
      {conflict && <span className="stay-conflict"><AlertCircle size={12} /> Double booking</span>}
      {state.occupants.map((guest) => <button className="stay-occupant" key={guest.id} disabled={saving} onClick={() => onEdit(guest)} aria-label={`Edit ${guest.name}, room ${room.number} bed ${bed}, ${shortDay(day)}`}><span className="stay-guest-initials">{guest.initials}</span><span>{guest.name}</span></button>)}
      {state.uncertain.length > 0 && <div className="stay-uncertain"><span>Needs review</span>{state.uncertain.map((guest) => <button key={guest.id} onClick={() => onEdit(guest)} disabled={saving}>{guest.name}</button>)}</div>}
    </>}
  </div>;
}

export function WeeklyRooms({ guests, room, week, onAssign, onEdit, saving, onChooseDay }) {
  const days = Array.from({ length: 7 }, (_, i) => moveDay(week, i));
  return <section className="stay-calendar-panel" aria-label={`Room ${room.number} weekly occupancy`}>
    <div className="stay-panel-title"><div><h2>Room {room.number}</h2><p>Samarpan · {room.beds} beds</p></div><div className="stay-legend"><span><i className="legend-occupied" /> Occupied</span><span><i /> Empty</span></div></div>
    <div className="stay-grid-scroll" tabIndex={0} role="region" aria-label="Weekly bed calendar; scroll horizontally for all seven days">
      <table className="stay-week-grid"><thead><tr><th scope="col">Bed</th>{days.map((day) => <th scope="col" key={day}><button onClick={() => onChooseDay(day)} aria-label={`Open daily view for ${fullDay(day)}`}><span>{localDay(day).toLocaleDateString("en-US", { weekday: "short" })}</span><strong>{shortDay(day)}</strong></button></th>)}</tr></thead>
        <tbody>{Array.from({ length: room.beds }, (_, i) => i + 1).map((bed) => <tr key={bed}><th scope="row"><BedDouble size={16} /><strong>Bed {bed}</strong><small>S{room.number}B{bed}</small></th>{days.map((day) => <td key={day}><BedSlot guests={guests} room={room} bed={bed} day={day} onAssign={onAssign} onEdit={onEdit} saving={saving} /></td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="stay-calendar-note">Each column is the night beginning that day. Checkout day is free. Select an empty bed to assign a guest for their stay.</p>
  </section>;
}

export function DailyRooms({ guests, day, onAssign, onEdit, saving }) {
  return <section className="stay-daily-rooms" aria-label="All Samarpan rooms">{samarpanRooms.map((room) => {
    const beds = Array.from({ length: room.beds }, (_, i) => i + 1);
    const free = beds.filter((bed) => bedState(guests, room.number, bed, { start: day, end: moveDay(day, 1) }).free).length;
    return <article className="stay-day-room" key={room.number} aria-label={`Room ${room.number}`}><header><div><BedDouble size={21} /><h2>Room {room.number}</h2></div><span className={free ? "stay-free-count" : "stay-full-count"}>{free} / {room.beds} beds empty</span></header><div className="stay-day-beds">{beds.map((bed) => <BedSlot key={bed} guests={guests} room={room} bed={bed} day={day} onAssign={onAssign} onEdit={onEdit} saving={saving} compact />)}</div></article>;
  })}</section>;
}
