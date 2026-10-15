import { useRef } from "react";
import { BedDouble, ChevronLeft, ChevronRight, Plus, AlertCircle } from "lucide-react";
import { samarpanRooms, roomAssignment, roomKey } from "../lib/lodgingRooms";
import { roomLabel, OFFSITE_HOTELS } from "../lib/offsite";
import { bedState, moveDay, shortDay, fullDay, localDay, onDay } from "../lib/occupancy";

export function RoomStrip({ selected, onSelect, rooms = samarpanRooms, lodging = "Samarpan" }) {
  const strip = useRef(null);
  return <section className="stay-room-selector" aria-label={`Choose a ${lodging} room`}>
    <button className="stay-arrow" aria-label="Scroll rooms left" onClick={() => strip.current?.scrollBy({ left: -300, behavior: "smooth" })}><ChevronLeft size={18} /></button>
    <div className="stay-room-strip" ref={strip}>{rooms.map((room) => <button key={roomKey(room)} className={`stay-room-chip ${selected === roomKey(room) ? "is-selected" : ""}`} aria-pressed={selected === roomKey(room)} onClick={() => onSelect(roomKey(room))}><BedDouble size={20} /><span><strong>{roomLabel(room)}</strong><small>{room.beds} beds{OFFSITE_HOTELS.includes(room.lodging) && !room.roomNo ? " · Number pending" : ""}</small></span></button>)}</div>
    <button className="stay-arrow" aria-label="Scroll rooms right" onClick={() => strip.current?.scrollBy({ left: 300, behavior: "smooth" })}><ChevronRight size={18} /></button>
  </section>;
}

export function RoomOverview({ guests, day, rooms, onAssign, onEdit, saving, readOnly }) {
  return <section className="stay-overview" aria-label="All rooms and daily assignments">{rooms.map(room => {
    const beds = Array.from({ length: room.beds }, (_, i) => ({ number: i + 1, state: bedState(guests, room.number, i + 1, { start: day, end: moveDay(day, 1) }, null, room.lodging || "Samarpan", rooms) }));
    const free = beds.filter(b => b.state.free).length;
    return <article className="stay-overview-room" key={roomKey(room)}>
      <header><div><small>{room.lodging || "Samarpan"}</small><h2>{roomLabel(room)}</h2></div><span>{room.beds - free}/{room.beds} occupied</span></header>
      <div className="stay-overview-beds">{beds.map(({ number, state }) => <div className={`stay-overview-bed ${state.free ? "is-free" : state.uncertain.length || state.occupants.length > 1 ? "needs-review" : ""}`} key={number}>
        <span className="stay-overview-number">{number}</span><div>
          {state.occupants.map(guest => <button key={guest.id} disabled={saving} onClick={() => onEdit(guest)}>{guest.name}</button>)}
          {state.uncertain.map(guest => <button key={guest.id} disabled={saving} onClick={() => onEdit(guest)}>{guest.name} · review</button>)}
          {state.occupants.length > 1 && <small>Double booking</small>}
          {state.free && (readOnly ? <span>Empty</span> : <button disabled={saving} onClick={() => onAssign(roomKey(room), number, day)} aria-label={`Assign existing guest to ${room.lodging === "Sadhak" ? "Sadhak " : ""}room ${room.number} bed ${number}`}>Empty</button>)}
        </div>
        {state.free && !readOnly && <button className="stay-overview-assign" disabled={saving} onClick={() => onAssign(roomKey(room), number, day)} aria-label={`Assign guest to ${room.lodging === "Sadhak" ? "Sadhak " : ""}room ${room.number} bed ${number}`}><Plus size={15} /></button>}
      </div>)}</div>
    </article>;
  })}</section>;
}

function BedSlot({ guests, room, bed, day, onAssign, onEdit, saving, compact = false, rooms = [], drag, readOnly = false }) {
  const state = bedState(guests, room.number, bed, { start: day, end: moveDay(day, 1) }, null, room.lodging || "Samarpan", rooms);
  const conflict = state.occupants.length > 1;
  const hovered = drag?.target === `${roomKey(room)}:${bed}`;
  const preview = hovered && drag?.guest && onDay(drag.guest, day);
  const problem = hovered && drag?.problem;
  return <div className={`stay-slot ${state.free ? "is-free" : "is-occupied"} ${conflict || state.uncertain.length ? "needs-review" : ""} ${compact ? "is-compact" : ""} ${preview ? (problem ? "drop-conflict" : "drop-preview") : ""}`} data-room={room.number} data-lodging={room.lodging || "Samarpan"} data-bed={bed} data-day={day}
    onDragOver={(e) => { if (drag?.guest && !saving) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; drag.hover(room, bed); } }}
    onDrop={(e) => { e.preventDefault(); if (drag?.guest && !saving) drag.drop(e.dataTransfer.getData("application/x-mandir-guest"), room, bed); }}>
    {compact && <span className="stay-bed-caption">Bed {bed}</span>}
    {preview && <span className="stay-drop-label">{problem ? "Stay conflicts" : drag.guest.name}</span>}
    {state.free ? (readOnly ? <div className="stay-empty">Empty bed</div> : <button className="stay-empty" disabled={saving} onClick={() => onAssign(roomKey(room), bed, day)} aria-label={`Assign ${room.lodging === "Sadhak" ? "Sadhak " : ""}room ${room.number} bed ${bed} on ${fullDay(day)}`}><Plus size={15} /><span>Empty bed</span></button>) : <>
      {conflict && <span className="stay-conflict"><AlertCircle size={12} /> Double booking</span>}
      {state.occupants.map((guest) => <button className="stay-occupant" key={guest.id} disabled={saving} onClick={() => onEdit(guest)} aria-label={`${readOnly ? "View" : "Edit"} ${guest.name}, ${room.lodging === "Sadhak" ? "Sadhak " : ""}room ${room.number} bed ${bed}, ${shortDay(day)}`}><span className="stay-guest-initials">{guest.initials}</span><span>{guest.name}</span></button>)}
      {state.uncertain.length > 0 && <div className="stay-uncertain"><span>Needs review</span>{state.uncertain.map((guest) => <button key={guest.id} onClick={() => onEdit(guest)} disabled={saving}>{guest.name}</button>)}</div>}
    </>}
  </div>;
}

export function WeeklyRooms({ guests, room, week, onAssign, onEdit, saving, onChooseDay, rooms, drag, readOnly = false }) {
  const days = Array.from({ length: 7 }, (_, i) => moveDay(week, i));
  return <section className="stay-calendar-panel" aria-label={`${roomLabel(room)} weekly occupancy`}>
    <div className="stay-panel-title"><div><h2>{roomLabel(room)}</h2><p>{room.lodging || "Samarpan"} · {room.beds} beds{OFFSITE_HOTELS.includes(room.lodging) && !room.roomNo ? " · Hotel room number pending" : ""}</p></div><div className="stay-legend"><span><i className="legend-occupied" /> Occupied</span><span><i /> Empty</span></div></div>
    <div className="stay-grid-scroll" tabIndex={0} role="region" aria-label="Weekly bed calendar; scroll horizontally for all seven days">
      <table className="stay-week-grid"><thead><tr><th scope="col">Bed</th>{days.map((day) => <th scope="col" key={day}><button onClick={() => onChooseDay(day)} aria-label={`Open daily view for ${fullDay(day)}`}><span>{localDay(day).toLocaleDateString("en-US", { weekday: "short" })}</span><strong>{shortDay(day)}</strong></button></th>)}</tr></thead>
        <tbody>{Array.from({ length: room.beds }, (_, i) => i + 1).map((bed) => <tr key={bed}><th scope="row"><BedDouble size={16} /><strong>Bed {bed}</strong><small>{OFFSITE_HOTELS.includes(room.lodging) ? `${room.roomNo || "Pending"} · B${bed}` : roomAssignment(room, bed).roomCode}</small></th>{days.map((day) => <td key={day}><BedSlot guests={guests} room={room} bed={bed} day={day} onAssign={onAssign} onEdit={onEdit} saving={saving} rooms={rooms} drag={drag} readOnly={readOnly} /></td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="stay-calendar-note">Each column is the night beginning that day. Checkout day is free.{!readOnly && " Drag a guest onto a bed row to assign their full stay, or tap an empty bed."}</p>
  </section>;
}

export function DailyRooms({ guests, day, onAssign, onEdit, saving, rooms = samarpanRooms, lodging = "Samarpan", drag, readOnly = false }) {
  return <section className="stay-daily-rooms" aria-label={`All ${lodging} rooms`}>{rooms.map((room) => {
    const beds = Array.from({ length: room.beds }, (_, i) => i + 1);
    const free = beds.filter((bed) => bedState(guests, room.number, bed, { start: day, end: moveDay(day, 1) }, null, lodging, rooms).free).length;
    return <article className="stay-day-room" key={roomKey(room)} aria-label={roomLabel(room)}><header><div><BedDouble size={21} /><h2>{roomLabel(room)}</h2></div><span className={free ? "stay-free-count" : "stay-full-count"}>{free} / {room.beds} beds empty</span></header><div className="stay-day-beds">{beds.map((bed) => <BedSlot key={bed} guests={guests} room={room} bed={bed} day={day} onAssign={onAssign} onEdit={onEdit} saving={saving} compact rooms={rooms} drag={drag} readOnly={readOnly} />)}</div></article>;
  })}</section>;
}
