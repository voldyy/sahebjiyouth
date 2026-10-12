import { useState } from "react";
import { BedDouble, CalendarDays, ChevronLeft, ChevronRight, List, Plus, Search, Users, GripVertical, Building2, Sparkles, Settings2 } from "lucide-react";
import Sheet from "../components/Sheet";
import { DailyRooms, RoomStrip, WeeklyRooms } from "../components/RoomCalendar";
import Housekeeping from "./Housekeeping";
import { LODGING_LOCATIONS, SHEET_URL } from "../lib/sheets";
import { samarpanRooms, samarpanBedCount, samarpanRoomCode } from "../lib/lodgingRooms";
import { OFFSITE_HOTELS, offsiteBedCode, offsiteRoomFor, roomLabel } from "../lib/offsite";
import { FIRST_STAY_DAY, LAST_STAY_DAY, WEEK_STARTS, moveDay, shortDay, fullDay, needsLodging, stayRange, overlaps, onDay, unassignedGuest, bedForGuest, assignmentIssue } from "../lib/occupancy";
import "../styles/operations.css";
import "../styles/sheets.css";
import "../styles/accommodation-calendar.css";

const stayLabel = (guest) => { const stay = stayRange(guest); return stay ? `${shortDay(stay.start)} – ${shortDay(stay.end)}` : "Stay dates needed"; };
const assignmentFor = (room, bed) => room.lodging ? { lodging: room.lodging, roomNo: room.roomNo, roomCode: offsiteBedCode(room, bed) } : { lodging: "Samarpan", roomNo: room.number, roomCode: samarpanRoomCode(room.number, bed) };

export default function SheetAccommodation({ workspace, toast, readOnly = false }) {
  const [section, setSection] = useState("Samarpan");
  const [hotel, setHotel] = useState(OFFSITE_HOTELS[0]);
  const [view, setView] = useState("weekly");
  const [weekIndex, setWeekIndex] = useState(0);
  const [day, setDay] = useState(FIRST_STAY_DAY);
  const [roomNo, setRoomNo] = useState("204");
  const [query, setQuery] = useState("");
  const [queueQuery, setQueueQuery] = useState("");
  const [assignment, setAssignment] = useState(null);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({ lodging: "Samarpan", roomNo: "", roomCode: "" });
  const [bedNo, setBedNo] = useState("");
  const [hotelRoomId, setHotelRoomId] = useState("");
  const [error, setError] = useState("");
  const [dropError, setDropError] = useState("");
  const [dragGuest, setDragGuest] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const [roomDraft, setRoomDraft] = useState(null);
  const [roomError, setRoomError] = useState("");
  const lodging = section === "Offsite" ? hotel : "Samarpan";
  const rooms = section === "Offsite" ? workspace.offsiteRooms.filter((r) => r.lodging === hotel) : samarpanRooms;
  const room = rooms.find((r) => r.number === roomNo) || rooms[0];
  const guests = workspace.guests.filter(needsLodging);
  const week = WEEK_STARTS[weekIndex];
  const draftRooms = draft.lodging === "Samarpan" ? samarpanRooms : workspace.offsiteRooms.filter((r) => r.lodging === draft.lodging);
  const selectedRoom = draftRooms.find((r) => draft.lodging === "Samarpan" ? r.number === draft.roomNo : r.id === hotelRoomId);
  const windowRange = view === "daily" ? { start: day, end: moveDay(day, 1) } : { start: week, end: moveDay(week, 7) };
  const queue = guests.filter((g) => unassignedGuest(g) && overlaps(stayRange(g), windowRange));
  const undated = guests.filter((g) => unassignedGuest(g) && !stayRange(g));
  const review = guests.filter((g) => g.lodging === lodging && (g.roomNo || g.roomCode) && (!bedForGuest(g, workspace.offsiteRooms) || !stayRange(g)));
  const candidates = guests.filter((g) => unassignedGuest(g) && (!assignment?.day || onDay(g, assignment.day)));
  const issue = selected && draft.roomCode ? assignmentIssue(workspace.guests, selected, draft, workspace.offsiteRooms) : "";
  const selectDay = (next) => { if (next < FIRST_STAY_DAY || next > LAST_STAY_DAY) return; setDay(next); setWeekIndex(WEEK_STARTS.findLastIndex((start) => start <= next)); };
  const changeWeek = (next) => { setWeekIndex(next); setDay(WEEK_STARTS[next]); };
  const resetForm = () => { setError(""); setBedNo(""); setSelected(null); setHotelRoomId(""); };
  const openGuest = (guest) => {
    resetForm(); setSelected(guest);
    const place = guest.lodging || lodging;
    const offsite = offsiteRoomFor(guest, workspace.offsiteRooms);
    setDraft({ lodging: place, roomNo: guest.roomNo || (place === "Samarpan" ? (room?.number || "204") : ""), roomCode: guest.roomCode || "" });
    setHotelRoomId(offsite?.id || "");
    setBedNo(String(bedForGuest(guest, workspace.offsiteRooms) || ""));
    setAssignment({ day: null, guestFirst: true });
  };
  const openBed = (number, bed, date) => {
    if (readOnly) return;
    const target = rooms.find((r) => r.number === number);
    resetForm(); setDraft(assignmentFor(target, bed)); setHotelRoomId(target.id || "");
    setBedNo(String(bed)); setAssignment({ day: date, guestFirst: false });
  };
  const openAssign = () => { if (readOnly) return; resetForm(); setDraft({ lodging, roomNo: lodging === "Samarpan" ? room.number : "", roomCode: "" }); setAssignment({ day: null, guestFirst: false }); };
  const save = async (event, clear = false) => {
    event.preventDefault(); if (readOnly) return; setError("");
    if (!selected) { setError("Select a guest to assign."); return; }
    if (!clear && issue) { setError(issue); return; }
    try {
      await workspace.saveAssignment(selected, clear ? { lodging: "", roomNo: "", roomCode: "" } : draft);
      setAssignment(null); toast(clear ? "Lodging assignment cleared." : `Bed assigned to ${selected.name} for their full stay.`);
    } catch (failure) { setError(failure.message); }
  };
  const drop = async (id, target, bed) => {
    if (readOnly) return;
    setDragGuest(null); setDragTarget(null); setDropError("");
    const guest = guests.find((g) => g.id === id && unassignedGuest(g) && g.sourceWritable);
    if (!guest || !workspace.connected || workspace.saving) return;
    const value = assignmentFor(target, bed);
    const problem = assignmentIssue(workspace.guests, guest, value, workspace.offsiteRooms);
    if (problem) { setDropError(problem); return; }
    try { await workspace.saveAssignment(guest, value); toast(`${guest.name} assigned to ${roomLabel(target)}, bed ${bed} · ${stayLabel(guest)}.`); }
    catch (failure) { setDropError(failure.message); }
  };
  const drag = { guest: dragGuest, target: dragTarget ? `${dragTarget.room.number}:${dragTarget.bed}` : "", problem: dragGuest && dragTarget ? assignmentIssue(guests, dragGuest, assignmentFor(dragTarget.room, dragTarget.bed), workspace.offsiteRooms) : "", hover: (target, bed) => { if (dragTarget?.room !== target || dragTarget?.bed !== bed) setDragTarget({ room: target, bed }); }, drop };
  const openRoom = (existing = null) => { if (readOnly) return; setRoomError(""); setRoomDraft(existing ? { id: existing.id, expectedRevision: existing.revision, lodging: existing.lodging, roomNo: existing.roomNo, beds: existing.beds } : { lodging: hotel, roomNo: "", beds: "" }); };
  const saveRoom = async (event) => {
    event.preventDefault(); if (readOnly) return; setRoomError("");
    try { await workspace.saveOffsiteRoom(roomDraft); setRoomDraft(null); toast("Hotel room inventory saved."); }
    catch (failure) { setRoomError(failure.message); }
  };
  const queuePanel = <section className="stay-unassigned" aria-label="Unassigned guests">
    <header><div><span className="stay-section-icon"><Users size={18} /></span><h2>Unassigned guests <span>{queue.length}</span></h2><p>{view === "daily" ? shortDay(day) : `${shortDay(week)} – ${shortDay(moveDay(week, 6))}`}</p></div><label className="stay-queue-search"><Search size={16} /><input aria-label="Search unassigned guests" placeholder="Find a guest…" value={queueQuery} onChange={(e) => setQueueQuery(e.target.value)} /></label></header>
    {queue.length ? <>{!readOnly && <p className="stay-drag-hint">Drag onto a bed row. Dates snap to the guest’s full stay. You can also tap a guest to assign.</p>}<div className="stay-queue-cards">{queue.filter((g) => `${g.name} ${g.registrationId}`.toLowerCase().includes(queueQuery.toLowerCase())).map((guest) => <button key={guest.id} className={`stay-queue-card ${dragGuest?.id === guest.id ? "is-dragging" : ""}`} disabled={(!readOnly && !guest.sourceWritable) || workspace.saving || !workspace.connected} draggable={!readOnly && guest.sourceWritable && !workspace.saving && workspace.connected} onDragStart={(e) => { if (readOnly) { e.preventDefault(); return; } e.dataTransfer.setData("application/x-mandir-guest", guest.id); e.dataTransfer.effectAllowed = "move"; setDragGuest(guest); setDropError(""); }} onDragEnd={() => { setDragGuest(null); setDragTarget(null); }} onClick={() => openGuest(guest)} aria-label={`${readOnly ? "View" : "Assign"} ${guest.name}`}><span className="stay-guest-initials">{guest.initials}</span><span><strong>{guest.name}</strong><small>{stayLabel(guest)}</small></span>{!readOnly && <GripVertical size={17} />}</button>)}</div></> : <p className="stay-empty-queue">Everyone with a stay in this period has a lodging assignment.</p>}
    {undated.length > 0 && <details className="stay-review"><summary>{undated.length} unassigned guests need stay dates</summary><p>Add Accommodation In/Out dates in the sheet to place these guests on the calendar.</p>{undated.map((g) => <button key={g.id} onClick={() => openGuest(g)}>{g.name}</button>)}</details>}
  </section>;

  return <div className="stay-workspace">
    <div className="stay-section-switch" role="group" aria-label="Accommodation sections">{[{ label: "Samarpan", icon: BedDouble }, { label: "Offsite", icon: Building2 }, { label: "Housekeeping", icon: Sparkles }].map(({ label, icon: Icon }) => <button key={label} aria-pressed={section === label} onClick={() => { setSection(label); setRoomNo(""); setDropError(""); }}><Icon size={19} />{label}</button>)}</div>
    {!workspace.refreshedAt ? <p role="status">{workspace.loading ? "Loading room occupancy from the sheet…" : "Room occupancy is unavailable. Refresh the sheet to load the calendar."}</p> : section === "Housekeeping" ? <Housekeeping workspace={workspace} toast={toast} readOnly={readOnly} /> : <>
      <header className="page-header"><div><p className="eyebrow">{section === "Samarpan" ? `SAMARPAN · ${samarpanRooms.length} ROOMS · ${samarpanBedCount} BEDS` : `${hotel.toUpperCase()} · ${rooms.length} PLANNING ROOMS`}</p><h1 className="page-title">Accommodations</h1><p className="page-description">See who’s staying, find an empty bed, and make room for the next arrival.</p></div>{!readOnly && <button className="button primary" onClick={openAssign} disabled={workspace.saving || !workspace.connected || !rooms.length}><Plus size={17} />Assign guest</button>}</header>
      {section === "Offsite" && <div className="stay-offsite-toolbar"><label className="field">Hotel<select aria-label="Offsite hotel" value={hotel} onChange={(e) => { setHotel(e.target.value); setRoomNo(""); }}>{OFFSITE_HOTELS.map((name) => <option key={name}>{name}</option>)}</select></label>{!readOnly && <button className="button secondary" onClick={() => openRoom()} disabled={workspace.saving}><Plus size={17} />Add planning room</button>}{room && !readOnly && <button className="button secondary" onClick={() => openRoom(room)} disabled={workspace.saving}><Settings2 size={17} />Edit room details</button>}<p>Provisional rooms are used until the hotel confirms its room numbers.{!readOnly && " Enter the planned bed count when adding each room."}</p></div>}
      <div className="stay-view-switch" role="group" aria-label="Accommodation views">{[{ id: "weekly", label: "Weekly view", icon: CalendarDays }, { id: "daily", label: "Daily view", icon: BedDouble }, { id: "list", label: "Guest list", icon: List }].map((tab) => <button key={tab.id} aria-pressed={view === tab.id} onClick={() => setView(tab.id)}><tab.icon size={17} />{tab.label}</button>)}</div>
      {dropError && <p className="op-form-error stay-drop-error" role="alert">{dropError}</p>}
      {dragGuest && <p className="stay-drag-status" role="status">{drag.problem || `Place ${dragGuest.name} · ${stayLabel(dragGuest)}`}</p>}
      {view === "weekly" && <>
        {!!rooms.length && <RoomStrip selected={room?.number} onSelect={setRoomNo} rooms={rooms} lodging={lodging} />}
        <div className="stay-date-toolbar"><div><span className="stay-kicker">WEEK {weekIndex + 1} OF {WEEK_STARTS.length}</span><h2 aria-live="polite">{shortDay(week)} – {shortDay(moveDay(week, 6))}, 2026</h2></div><div className="stay-date-controls"><button className="stay-arrow" aria-label="Previous week" disabled={weekIndex === 0} onClick={() => changeWeek(weekIndex - 1)}><ChevronLeft size={20} /></button><select aria-label="Choose occupancy week" value={weekIndex} onChange={(e) => changeWeek(Number(e.target.value))}>{WEEK_STARTS.map((start, index) => <option key={start} value={index}>{shortDay(start)} – {shortDay(moveDay(start, 6))}</option>)}</select><button className="stay-arrow" aria-label="Next week" disabled={weekIndex === WEEK_STARTS.length - 1} onClick={() => changeWeek(weekIndex + 1)}><ChevronRight size={20} /></button></div></div>
        {queuePanel}
        {room && <WeeklyRooms guests={guests} room={room} week={week} onAssign={openBed} onEdit={openGuest} saving={workspace.saving} rooms={workspace.offsiteRooms} drag={readOnly ? null : drag} readOnly={readOnly} onChooseDay={(next) => { selectDay(next); setView("daily"); }} />}
      </>}
      {view === "daily" && <>
        <div className="stay-date-toolbar"><div><span className="stay-kicker">ALL {lodging.toUpperCase()} ROOMS</span><h2 aria-live="polite">{fullDay(day)}</h2></div><div className="stay-date-controls"><button className="stay-arrow" aria-label="Previous occupancy day" disabled={day === FIRST_STAY_DAY} onClick={() => selectDay(moveDay(day, -1))}><ChevronLeft size={20} /></button><label className="stay-date-input"><CalendarDays size={17} /><input type="date" aria-label="Choose occupancy date" min={FIRST_STAY_DAY} max={LAST_STAY_DAY} value={day} onChange={(e) => { if (e.target.value) selectDay(e.target.value); }} /></label><button className="stay-arrow" aria-label="Next occupancy day" disabled={day === LAST_STAY_DAY} onClick={() => selectDay(moveDay(day, 1))}><ChevronRight size={20} /></button></div></div>
        {queuePanel}<div className="stay-daily-heading"><h2>Room availability</h2><p>Checkout day is free{!readOnly && " · Drag a guest or tap an empty bed"}</p></div><DailyRooms guests={guests} day={day} onAssign={openBed} onEdit={openGuest} saving={workspace.saving} rooms={rooms} lodging={lodging} drag={readOnly ? null : drag} readOnly={readOnly} />
      </>}
      {!rooms.length && view !== "list" && <div className="stay-clean-state"><Building2 size={30} /><h2>No planning rooms yet</h2><p>{readOnly ? `No rooms have been added for ${hotel}.` : `Add a provisional room and its bed count to start assigning stays at ${hotel}.`}</p>{!readOnly && <button className="button primary" onClick={() => openRoom()}>Add planning room</button>}</div>}
      {view !== "list" && review.length > 0 && <details className="stay-review"><summary>{review.length} {lodging} assignments need review</summary><p>These assignments have missing dates, an unknown room, or a code that doesn’t identify a bed. Affected beds stay marked for review.</p>{review.map((g) => <button key={g.id} onClick={() => openGuest(g)}>{g.name} · {g.roomCode || `Room ${g.roomNo}`}</button>)}</details>}
      {view === "list" && <><label className="search-field"><Search size={18} /><input aria-label="Search lodging attendees" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search attendee, registration or room…" /></label><div className="sheet-attendee-list">{guests.filter((g) => (g.lodging === lodging || unassignedGuest(g)) && [g.name, g.registrationId, g.lodging, g.roomNo, g.roomCode].join(" ").toLowerCase().includes(query.toLowerCase())).map((guest) => <article className="card sheet-attendee" key={guest.id}><div><h3>{guest.name}</h3><p>{guest.registrationId}</p><p>{stayLabel(guest)}</p></div><div className="sheet-room-details"><strong>{guest.lodging || "Lodging pending"}</strong><span>Room: {guest.roomNo || (guest.roomCode ? "Number pending" : "Not assigned")}</span><span>{offsiteRoomFor(guest, workspace.offsiteRooms)?.label || "Bed code"}: {guest.roomCode || "Not assigned"}</span></div><button className="button secondary" disabled={(!readOnly && !guest.sourceWritable) || workspace.saving} onClick={() => openGuest(guest)}>{readOnly ? "View stay" : guest.room ? "Edit assignment" : "Assign lodging"}</button>{!guest.sourceWritable && <p role="alert">Duplicate attendee identity in the sheet. Resolve it before assigning.</p>}</article>)}</div></>}
    </>}
    {assignment && <Sheet title={selected ? `Lodging for ${selected.name}` : "Assign a guest"} subtitle={assignment.day ? `Empty on ${shortDay(assignment.day)}. The assignment covers the guest’s full stay.` : "Room and bed assignments follow the guest’s stay dates."} onClose={() => { if (!workspace.saving) setAssignment(null); }}>
      {readOnly ? <div className="stay-read-details">
        <p><strong>{selected?.name}</strong>{selected?.city && ` (${selected.city})`}</p>
        <p>{selected ? stayLabel(selected) : "Stay dates needed"}</p>
        <p>{selected?.lodging || "Lodging pending"} · Room {selected?.roomNo || "pending"}</p>
        <p>{selected?.roomCode || "Bed not assigned"}</p>
      </div> : <form className="op-form" onSubmit={save}>
        {!assignment.guestFirst && <label className="field">Guest<select aria-label="Guest to assign" value={selected?.id || ""} required disabled={workspace.saving} onChange={(e) => { setSelected(candidates.find((g) => g.id === e.target.value)); setError(""); }}><option value="" disabled>Select an unassigned guest</option>{candidates.map((g) => <option key={g.id} value={g.id} disabled={!g.sourceWritable}>{g.name} · {stayLabel(g)}</option>)}</select>{!candidates.length && <small>No unassigned guests have a stay on this date.</small>}</label>}
        {selected && <div className="stay-assignment-dates"><CalendarDays size={18} /><div><strong>{stayLabel(selected)}</strong><span>{stayRange(selected) ? "Checkout day is available for the next guest" : "Add valid stay dates in the source sheet first"}</span></div></div>}
        <label className="field">Lodging location (AD)<select value={draft.lodging} disabled={workspace.saving} onChange={(e) => { setDraft({ lodging: e.target.value, roomNo: "", roomCode: "" }); setBedNo(""); setHotelRoomId(""); setError(""); }} required><option value="" disabled>Select lodging</option>{!LODGING_LOCATIONS.includes(draft.lodging) && <option disabled>{draft.lodging}</option>}{LODGING_LOCATIONS.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label className="field">{draft.lodging === "Samarpan" ? "Room number (AE)" : "Hotel planning room"}<select aria-label={draft.lodging === "Samarpan" ? "Room number (AE)" : "Hotel planning room"} value={draft.lodging === "Samarpan" ? draft.roomNo : hotelRoomId} disabled={workspace.saving} onChange={(e) => { const target = draftRooms.find((r) => r.number === e.target.value); setDraft({ ...draft, roomNo: target?.lodging ? target.roomNo : e.target.value, roomCode: "" }); setHotelRoomId(target?.id || ""); setBedNo(""); setError(""); }} required><option value="" disabled>{draft.lodging === "Samarpan" ? "Choose a Samarpan room" : "Choose a hotel planning room"}</option>{draftRooms.map((r) => <option key={r.number} value={r.number}>{draft.lodging === "Samarpan" ? r.number : roomLabel(r)} · {r.beds} beds</option>)}</select></label>
        {draft.lodging !== "Samarpan" && !draftRooms.length && <p className="sheet-data-note">Add a planning room in Offsite before assigning a guest to this hotel.</p>}
        {selectedRoom?.lodging && !selectedRoom.roomNo && <p className="sheet-data-note">The hotel room number is pending. Column AE stays blank; this provisional bed code keeps the assignment in place.</p>}
        <label className="field">Bed number<select value={bedNo} disabled={workspace.saving || !selectedRoom} required onChange={(e) => { setBedNo(e.target.value); setDraft(assignmentFor(selectedRoom, e.target.value)); setError(""); }}><option value="" disabled>Choose a bed</option>{Array.from({ length: selectedRoom?.beds || 0 }, (_, i) => { const number = i + 1; const problem = selected ? assignmentIssue(guests, selected, assignmentFor(selectedRoom, number), workspace.offsiteRooms) : ""; return <option key={number} value={number} disabled={!!problem}>Bed {number}{problem ? " · unavailable for this stay" : ""}</option>; })}</select></label>
        <label className="field">Custom room code (AF)<input value={draft.roomCode} readOnly disabled={workspace.saving} required placeholder="Generated from room and bed" /></label>
        {selected && !stayRange(selected) && <a className="button secondary" href={SHEET_URL} target="_blank" rel="noreferrer">Open source sheet to add dates</a>}
        {(error || issue) && <p role="alert" className="op-form-error">{error || issue}</p>}
        <button className="button primary" disabled={!selected || !workspace.connected || workspace.saving || !selected?.sourceWritable || !!issue || !selectedRoom || !bedNo} type="submit">{workspace.saving ? "Saving…" : "Save assignment to sheet"}</button>
        {(selected?.lodging || selected?.room) && <button type="button" className="button secondary" disabled={!workspace.connected || workspace.saving} onClick={(e) => save(e, true)}>Clear lodging assignment (AD–AF)</button>}
      </form>}
    </Sheet>}
    {roomDraft && !readOnly && <Sheet title={roomDraft.id ? "Edit hotel room" : "Add planning room"} subtitle={roomDraft.lodging} onClose={() => { if (!workspace.saving) setRoomDraft(null); }}><form className="op-form" onSubmit={saveRoom}>
      <label className="field">Hotel room number (optional)<input value={roomDraft.roomNo} maxLength={100} placeholder="Leave blank until confirmed" onChange={(e) => setRoomDraft({ ...roomDraft, roomNo: e.target.value })} disabled={workspace.saving} /></label>
      <label className="field">Planned beds<input type="number" min="1" max="20" step="1" required value={roomDraft.beds} onChange={(e) => setRoomDraft({ ...roomDraft, beds: e.target.value })} disabled={workspace.saving} /></label>
      <p className="sheet-data-note">A provisional room is a planning placeholder. Confirm its beds with the hotel. Adding the actual room number later preserves every guest’s bed and dates.</p>
      {roomError && <p className="op-form-error" role="alert">{roomError}</p>}<button className="button primary" disabled={workspace.saving || !workspace.connected}>{workspace.saving ? "Saving…" : "Save room"}</button>
    </form></Sheet>}
  </div>;
}
