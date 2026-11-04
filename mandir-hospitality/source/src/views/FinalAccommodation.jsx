import { AddRoomBed } from "../components/RoomCalendar";
import { useMemo, useState } from "react";
import { Building2, CalendarDays } from "lucide-react";
import { OFFSITE_HOTELS, roomCapacityLabel, roomTypeLabel } from "../lib/offsite";
import { shortDay } from "../lib/occupancy";
import { finalAccommodationPlan, staysOnNight } from "../lib/finalAccommodation";
import "../styles/final-accommodation.css";

const nightLabel = day => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export default function FinalAccommodation({ workspace, onAddBed }) {
  const [hotel, setHotel] = useState("All hotels");
  const [night, setNight] = useState(null);
  const plan = useMemo(() => finalAccommodationPlan(workspace.guests, workspace.offsiteRooms), [workspace.guests, workspace.offsiteRooms]);
  const hotels = hotel === "All hotels" ? OFFSITE_HOTELS : [hotel];
  const missingDates = plan.missingDates.filter(g => hotels.includes(g.lodging));
  const missingRooms = plan.missingRooms.filter(g => hotels.includes(g.lodging));
  return <section className="final-accommodation">
    <header className="page-header"><div><p className="eyebrow">OFFSITE LODGING · HOTEL ROOM PLAN</p><h1 className="page-title">Final</h1><p className="page-description">Rooms needed each night, with the people staying in them.</p></div><label className="field final-hotel-filter">Hotel<select aria-label="Final hotel" value={hotel} onChange={e => { setHotel(e.target.value); setNight(null); }}><option>All hotels</option>{OFFSITE_HOTELS.map(h => <option key={h}>{h}</option>)}</select></label></header>
    <div className="final-section-heading"><h2><CalendarDays size={19} /> Nightly room requirements</h2><span>Starting November 6, 2026</span></div>
    <p className="final-help">Checkout day is free. Select a night to see its occupants below.</p>
    <div className="final-night-grid" aria-label="Nightly room requirements">{plan.nights.map(item => {
      const count = hotel === "All hotels" ? item.total : item.byHotel[hotel];
      return <button key={item.day} type="button" className={`final-night${night === item.day ? " is-selected" : ""}`} aria-pressed={night === item.day} aria-label={`${nightLabel(item.day)}: ${count} ${count === 1 ? "room" : "rooms"} needed`} onClick={() => setNight(current => current === item.day ? null : item.day)}><span>{nightLabel(item.day)}</span><strong>{count} <small>{count === 1 ? "room" : "rooms"}</small></strong>{hotels.map(h => <span className="final-hotel-count" key={h}>{h}<b>{item.byHotel[h]}</b></span>)}</button>;
    })}</div>
    {(missingDates.length > 0 || missingRooms.length > 0) && <p className="final-review" role="status">{missingDates.length > 0 && `${missingDates.length} ${missingDates.length === 1 ? "guest needs" : "guests need"} stay dates. `}{missingRooms.length > 0 && `${missingRooms.length} ${missingRooms.length === 1 ? "guest needs" : "guests need"} a room assignment. `}They are excluded from nightly room counts.</p>}
    <div className="final-section-heading"><h2>Rooms and occupants</h2><div className="final-period">{night ? <><span>{nightLabel(night)}</span><button type="button" className="text-button" onClick={() => setNight(null)}>Show all stays</button></> : <span>All stays from November 6</span>}</div></div>
    {hotels.map(h => {
      const rows = plan.rows.filter(row => row.room.lodging === h);
      return <section className="final-hotel" key={h} aria-label={`${h} room plan`}><h3><Building2 size={19} />{h}<small>{rows.length} rooms</small></h3><table className="final-room-table"><caption className="sr-only">{h} rooms and occupants</caption><thead><tr><th scope="col">Room</th><th scope="col">Occupant</th><th scope="col">Check-in</th><th scope="col">Check-out</th></tr></thead>{rows.map(({room,occupants}) => {
        const shown = night ? occupants.filter(stay => staysOnNight(stay,night)) : occupants;
        return <tbody key={room.id} className="final-room-group">{(shown.length ? shown : [null]).map((stay,index) => <tr key={stay?.guest.sourceIdentity || stay?.guest.id || "empty"}>{index === 0 && <th className="final-room-name" scope="rowgroup" rowSpan={Math.max(1,shown.length)}><strong>{room.label}</strong>{room.roomNo && <span>Hotel room {room.roomNo}</span>}<small>{roomTypeLabel(room)} · {roomCapacityLabel(room)}</small><AddRoomBed room={room} onAddBed={onAddBed} saving={workspace.saving}/></th>}<td className="final-occupant" data-label="Occupant">{stay ? <><strong>{stay.guest.name}</strong>{stay.guest.city && <small>{stay.guest.city}</small>}</> : <span className="final-empty">{night ? "Not needed this night" : "No stays from Nov 6"}</span>}</td><td className="final-stay-date" data-label="Check-in">{stay ? shortDay(stay.start) : "—"}</td><td className="final-stay-date" data-label="Check-out">{stay ? shortDay(stay.end) : "—"}</td></tr>)}</tbody>;
      })}</table>{!rows.length && <p className="final-empty">No rooms at this hotel yet.</p>}</section>;
    })}
  </section>;
}
