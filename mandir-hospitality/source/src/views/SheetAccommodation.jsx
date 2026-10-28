import LodgingNotifications from "../components/LodgingNotifications";
import WhatsAppSent from "../components/WhatsAppSent";
import { useState } from "react";
import { BedDouble, CalendarDays, ChevronLeft, ChevronRight, List, Plus, Search, Users, GripVertical, Building2, Sparkles, Settings2 } from "lucide-react";
import Sheet from "../components/Sheet";
import { DailyRooms, RoomStrip, WeeklyRooms, RoomOverview } from "../components/RoomCalendar";
import WalkInForm from "../components/WalkInForm";
import ChosenBed from "../components/ChosenBed";
import { allentownDay } from "../lib/housekeeping";
import Housekeeping from "./Housekeeping";
import { LODGING_LOCATIONS, SHEET_URL } from "../lib/sheets";
import { samarpanRooms, sadhakRooms, fixedRoomsFor, isFixedLodging, roomKey, roomAssignment } from "../lib/lodgingRooms";
import { HAWTHORN_ROOM_TYPES, OFFSITE_HOTELS, offsiteRoomFor, roomCapacityLabel, roomLabel, roomPlaceLabel, roomTypeFor, roomTypeLabel } from "../lib/offsite";
import { isChildUnder12, isAdultBedOccupant, bedState, lodgingOccupancy, PLANNING_START_DAY, LAST_STAY_DAY, PLANNING_WEEK_STARTS, inPlanningWindow, moveDay, shortDay, fullDay, needsLodging, stayRange, overlaps, onDay, unassignedGuest, bedForGuest, assignmentIssue } from "../lib/occupancy";
import "../styles/operations.css";
import "../styles/sheets.css";
import "../styles/accommodation-calendar.css";

const stayLabel = (guest) => { const stay = stayRange(guest); return stay ? `${shortDay(stay.start)} – ${shortDay(stay.end)}` : "Stay dates needed"; };
const assignmentFor = roomAssignment;
const currentStayDay = () => { const today = allentownDay(); return today < PLANNING_START_DAY ? PLANNING_START_DAY : today > LAST_STAY_DAY ? LAST_STAY_DAY : today; };

export default function SheetAccommodation({ workspace, toast, readOnly = false }) {
  const [section, setSection] = useState("Samarpan");
  const [hotel, setHotel] = useState(OFFSITE_HOTELS[0]);
  const [view, setView] = useState("weekly");
  const [weekIndex, setWeekIndex] = useState(() => PLANNING_WEEK_STARTS.findLastIndex(start => start <= currentStayDay()));
  const [day, setDay] = useState(currentStayDay);
  const [roomNo, setRoomNo] = useState("203");
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
  const [walkIn, setWalkIn] = useState(null);
  const [editingBed, setEditingBed] = useState(false);
  const allRooms = [...samarpanRooms, ...sadhakRooms, ...workspace.offsiteRooms];
  const openWalkIn = (number = "", bed = "", date = currentStayDay()) => {
    if (!readOnly) { setAssignment(null); setWalkIn({ room: number, bed, day: date }); }
  };
  const lodging = section === "Offsite" ? hotel : section;
  const rooms = section === "Offsite" ? workspace.offsiteRooms.filter((r) => r.lodging === hotel) : fixedRoomsFor(section);
  const room = rooms.find((r) => roomKey(r) === roomNo) || rooms[0];
  const guests = workspace.guests.filter(needsLodging).filter(inPlanningWindow);
  const week = PLANNING_WEEK_STARTS[weekIndex];
  const draftRooms = isFixedLodging(draft.lodging) ? fixedRoomsFor(draft.lodging) : workspace.offsiteRooms.filter((r) => r.lodging === draft.lodging);
  const selectedRoom = draftRooms.find((r) => isFixedLodging(draft.lodging) ? r.number === draft.roomNo : r.id === hotelRoomId);
  const windowRange = ["daily", "overview"].includes(view) ? { start: day, end: moveDay(day, 1) } : { start: week, end: moveDay(week, 7) };
  const queue = guests.filter((g) => unassignedGuest(g) && overlaps(stayRange(g), windowRange));
  const listedGuests = guests.filter(g => (g.lodging === lodging || unassignedGuest(g)) &&
    [g.name, g.registrationId, g.lodging, g.roomNo, g.roomCode].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(unassignedGuest(b)) - Number(unassignedGuest(a)));
  const undated = guests.filter((g) => unassignedGuest(g) && !stayRange(g));
  const review = guests.filter((g) => g.lodging === lodging && (g.roomNo || g.roomCode) && (!bedForGuest(g, workspace.offsiteRooms) || !stayRange(g)));
  const candidates = guests.filter((g) => (assignment?.childOnly ? isChildUnder12(g) : unassignedGuest(g)) && (!assignment?.day || onDay(g, assignment.day)));
  const issue = selected && draft.roomCode ? assignmentIssue(workspace.guests, selected, draft, workspace.offsiteRooms) : "";
  const selectDay = (next) => { if (next < PLANNING_START_DAY || next > LAST_STAY_DAY) return; setDay(next); setWeekIndex(PLANNING_WEEK_STARTS.findLastIndex((start) => start <= next)); };
  const changeWeek = (next) => { setWeekIndex(next); setDay(PLANNING_WEEK_STARTS[next]); };
  const resetForm = () => { setError(""); setBedNo(""); setSelected(null); setHotelRoomId(""); setEditingBed(false); };
  const openGuest = (guest) => {
    resetForm(); setSelected(guest);
    const place = guest.lodging || lodging;
    const offsite = offsiteRoomFor(guest, workspace.offsiteRooms);
    setDraft({ lodging: place, roomNo: guest.roomNo || (isFixedLodging(place) ? (fixedRoomsFor(place).find(r => roomKey(r) === roomNo)?.number || fixedRoomsFor(place)[0].number) : ""), roomCode: guest.roomCode || "" });
    setHotelRoomId(offsite?.id || "");
    setBedNo(String(bedForGuest(guest, workspace.offsiteRooms) || ""));
    setAssignment({ day: null, guestFirst: true });
  };
  const openBed = (number, bed, date, childOnly = false) => {
    if (readOnly) return;
    const target = allRooms.find((r) => roomKey(r) === number);
    resetForm(); setDraft(assignmentFor(target, bed)); setHotelRoomId(target.id || "");
    setBedNo(String(bed)); setAssignment({ day: date, guestFirst: false, childOnly });
  };
  const openAssign = () => { if (readOnly) return; resetForm(); setDraft({ lodging, roomNo: isFixedLodging(lodging) ? room.number : "", roomCode: "" }); setAssignment({ day: null, guestFirst: false }); };
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
  const drag = { guest: dragGuest, target: dragTarget ? `${roomKey(dragTarget.room)}:${dragTarget.bed}` : "", problem: dragGuest && dragTarget ? assignmentIssue(guests, dragGuest, assignmentFor(dragTarget.room, dragTarget.bed), workspace.offsiteRooms) : "", hover: (target, bed) => { if (dragTarget?.room !== target || dragTarget?.bed !== bed) setDragTarget({ room: target, bed }); }, drop };
  const openRoom = (existing = null) => { if (readOnly) return; setRoomError(""); setRoomDraft(existing ? { id: existing.id, expectedRevision: existing.revision, lodging: existing.lodging, roomNo: existing.roomNo, beds: existing.beds, roomType: roomTypeFor(existing), isDefaultSlot: existing.isDefaultSlot } : { lodging: hotel, roomNo: "", beds: "", roomType: "doubleQueen" }); };
  const saveRoom = async (event) => {
    event.preventDefault(); if (readOnly) return; setRoomError("");
    try { await workspace.saveOffsiteRoom(roomDraft); setRoomDraft(null); toast("Hotel room inventory saved."); }
    catch (failure) { setRoomError(failure.message); }
  };
  const changeRoomType = async (target, roomType) => {
    if (readOnly || workspace.saving || !workspace.connected) return;
    setDropError("");
    try {
      await workspace.saveOffsiteRoom({ id: target.id, expectedRevision: target.revision, lodging: target.lodging, roomNo: target.roomNo, roomType, beds: HAWTHORN_ROOM_TYPES[roomType].beds });
      toast(`${target.label || roomLabel(target)} changed to ${HAWTHORN_ROOM_TYPES[roomType].label}.`);
    } catch (failure) { setDropError(failure.message); }
  };
  // Capacity reached: assigned beds against all beds in this lodging, for the chosen day or the busiest day of the week.
  const weekly = view === "weekly";
  const occupancy = lodgingOccupancy(guests, lodging, rooms, weekly ? Array.from({ length: 7 }, (_, i) => moveDay(week, i)) : [day], workspace.offsiteRooms);
  const shown = weekly ? occupancy.peak : occupancy.perDay[0];
  const places = isFixedLodging(section) ? "beds" : "places";
  const capacityMeter = occupancy.capacity > 0 && <section className="stay-capacity" aria-label={`${lodging} capacity`}>
    <strong>{shown.percent}% <span>reached</span></strong>
    <div className={`stay-capacity-bar${shown.percent >= 90 ? " is-full" : shown.percent >= 70 ? " is-busy" : ""}`} role="progressbar" aria-label={`${lodging} capacity reached`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(shown.percent, 100)}><i style={{ width: `${Math.min(shown.percent, 100)}%` }} /></div>
    <span>{shown.filled} of {occupancy.capacity} {places} · {weekly ? `busiest ${shortDay(shown.day)}` : shortDay(shown.day)}{shown.unassigned > 0 ? ` · ${shown.unassigned} without a bed` : ""}</span>
  </section>;
  const queuePanel = <section className="stay-unassigned" aria-label="Unassigned guests">
    <header><div><span className="stay-section-icon"><Users size={18} /></span><h2>Unassigned guests <span>{queue.length}</span></h2><p>{["daily", "overview"].includes(view) ? shortDay(day) : `${shortDay(week)} – ${shortDay(moveDay(week, 6))}`}</p></div><label className="stay-queue-search"><Search size={16} /><input aria-label="Search unassigned guests" placeholder="Find a guest…" value={queueQuery} onChange={(e) => setQueueQuery(e.target.value)} /></label></header>
    {queue.length ? <>{!readOnly && <p className="stay-drag-hint">Drag onto a bed row. Dates snap to the guest’s full stay. You can also tap a guest to assign.</p>}<div className="stay-queue-cards">{queue.filter((g) => `${g.name} ${g.registrationId}`.toLowerCase().includes(queueQuery.toLowerCase())).map((guest) => <button key={guest.id} className={`stay-queue-card ${dragGuest?.id === guest.id ? "is-dragging" : ""}`} disabled={(!readOnly && !guest.sourceWritable) || workspace.saving || !workspace.connected} draggable={!readOnly && guest.sourceWritable && !workspace.saving && workspace.connected} onDragStart={(e) => { if (readOnly) { e.preventDefault(); return; } e.dataTransfer.setData("application/x-mandir-guest", guest.id); e.dataTransfer.effectAllowed = "move"; setDragGuest(guest); setDropError(""); }} onDragEnd={() => { setDragGuest(null); setDragTarget(null); }} onClick={() => openGuest(guest)} aria-label={`${readOnly ? "View" : "Assign"} ${guest.name}`}><span className="stay-guest-initials">{guest.initials}</span><span><strong>{guest.name}</strong><small>{stayLabel(guest)}</small></span>{!readOnly && <GripVertical size={17} />}</button>)}</div></> : <p className="stay-empty-queue">Everyone with a stay in this period has a lodging assignment.</p>}
    {undated.length > 0 && <details className="stay-review"><summary>{undated.length} unassigned guests need stay dates</summary><p>Add Accommodation In/Out dates in the sheet to place these guests on the calendar.</p>{undated.map((g) => <button key={g.id} onClick={() => openGuest(g)}>{g.name}</button>)}</details>}
  </section>;

  return <div className="stay-workspace">
    {walkIn && <Sheet title="Add a walk-in guest" subtitle="Guest details and a bed, together." onClose={() => { if (!workspace.saving) setWalkIn(null); }}><WalkInForm workspace={workspace} rooms={allRooms} initial={walkIn} onCancel={() => setWalkIn(null)} onSaved={name => { setWalkIn(null); toast(`${name} added and assigned for their full stay.`); }} /></Sheet>}
    <div className="stay-section-switch" role="group" aria-label="Accommodation sections">{[{ label: "Samarpan", icon: BedDouble }, { label: "Sadhak", icon: BedDouble }, { label: "Offsite", icon: Building2 }, { label: "Housekeeping", icon: Sparkles }].map(({ label, icon: Icon }) => <button key={label} aria-pressed={section === label} onClick={() => { setSection(label); setRoomNo(""); setDropError(""); }}><Icon size={19} />{label}</button>)}</div>
    {!workspace.refreshedAt ? <p role="status">{workspace.loading ? "Loading room occupancy from the sheet…" : "Room occupancy is unavailable. Refresh the sheet to load the calendar."}</p> : section === "Housekeeping" ? <Housekeeping workspace={workspace} toast={toast} readOnly={readOnly} /> : <>
      <header className="page-header"><div><p className="eyebrow">{isFixedLodging(section) ? `${section.toUpperCase()} · ${rooms.length} ROOMS · ${rooms.reduce((sum, r) => sum + (r.beds || 0), 0)} BEDS` : `${hotel.toUpperCase()} · ${rooms.length} PLANNING ROOMS`}</p><h1 className="page-title">Accommodations</h1><p className="page-description">See who’s staying, find an empty bed, and make room for the next arrival.</p></div>{!readOnly && <div className="page-actions"><LodgingNotifications workspace={workspace} toast={toast} /><button className="button secondary" onClick={() => openWalkIn()} disabled={workspace.saving || !workspace.connected}><Plus size={17} />Add walk-in</button><button className="button primary" onClick={openAssign} disabled={workspace.saving || !workspace.connected || !rooms.length}><Plus size={17} />Assign guest</button></div>}</header>
      {capacityMeter}
      {section === "Offsite" && <div className="stay-offsite-toolbar"><label className="field">Hotel<select aria-label="Offsite hotel" value={hotel} onChange={(e) => { setHotel(e.target.value); setRoomNo(""); }}>{OFFSITE_HOTELS.map((name) => <option key={name}>{name}</option>)}</select></label>{!readOnly && <button className="button secondary" onClick={() => openRoom()} disabled={workspace.saving}><Plus size={17} />Add planning room</button>}{room && !readOnly && <button className="button secondary" onClick={() => openRoom(room)} disabled={workspace.saving}><Settings2 size={17} />Edit room details</button>}<p>Room slots hold assignments until the hotel confirms room numbers. R01 onward each has two beds with two guest places per bed.</p></div>}
      <div className="stay-view-switch" role="group" aria-label="Accommodation views">{[{ id: "weekly", label: "Weekly view", icon: CalendarDays }, { id: "daily", label: "Daily view", icon: BedDouble }, { id: "overview", label: "Day at a glance", icon: Building2 }, { id: "list", label: "Guest list", icon: List }].map((tab) => <button key={tab.id} aria-pressed={view === tab.id} onClick={() => { setView(tab.id); if (tab.id !== view && tab.id !== "list") selectDay(currentStayDay()); }}><tab.icon size={17} />{tab.label}</button>)}</div>
      {dropError && <p className="op-form-error stay-drop-error" role="alert">{dropError}</p>}
      {dragGuest && <p className="stay-drag-status" role="status">{drag.problem || `Place ${dragGuest.name} · ${stayLabel(dragGuest)}`}</p>}
      {view === "weekly" && <>
        {!!rooms.length && <RoomStrip selected={room ? roomKey(room) : ""} onSelect={setRoomNo} rooms={rooms} lodging={lodging} onRoomTypeChange={!readOnly && section === "Offsite" ? changeRoomType : undefined} saving={workspace.saving || !workspace.connected} />}
        <div className="stay-date-toolbar"><div><span className="stay-kicker">WEEK {weekIndex + 1} OF {PLANNING_WEEK_STARTS.length}</span><h2 aria-live="polite">{shortDay(week)} – {shortDay(moveDay(week, 6))}, 2026</h2></div><div className="stay-date-controls"><button className="stay-arrow" aria-label="Previous week" disabled={weekIndex === 0} onClick={() => changeWeek(weekIndex - 1)}><ChevronLeft size={20} /></button><select aria-label="Choose occupancy week" value={weekIndex} onChange={(e) => changeWeek(Number(e.target.value))}>{PLANNING_WEEK_STARTS.map((start, index) => <option key={start} value={index}>{shortDay(start)} – {shortDay(moveDay(start, 6))}</option>)}</select><button className="stay-arrow" aria-label="Next week" disabled={weekIndex === PLANNING_WEEK_STARTS.length - 1} onClick={() => changeWeek(weekIndex + 1)}><ChevronRight size={20} /></button></div></div>
        {queuePanel}
        {room && <WeeklyRooms guests={guests} room={room} week={week} onAssign={openBed} onEdit={openGuest} saving={workspace.saving} rooms={workspace.offsiteRooms} drag={readOnly ? null : drag} readOnly={readOnly} onChooseDay={(next) => { selectDay(next); setView("daily"); }} />}
      </>}
      {["daily", "overview"].includes(view) && <>
        <div className="stay-date-toolbar"><div><span className="stay-kicker">{view === "overview" ? "ALL ROOMS" : `ALL ${lodging.toUpperCase()} ROOMS`}</span><h2 aria-live="polite">{fullDay(day)}</h2></div><div className="stay-date-controls"><button className="stay-arrow" aria-label="Previous occupancy day" disabled={day === PLANNING_START_DAY} onClick={() => selectDay(moveDay(day, -1))}><ChevronLeft size={20} /></button><label className="stay-date-input"><CalendarDays size={17} /><input type="date" aria-label="Choose occupancy date" min={PLANNING_START_DAY} max={LAST_STAY_DAY} value={day} onChange={(e) => { if (e.target.value) selectDay(e.target.value); }} /></label><button className="stay-arrow" aria-label="Next occupancy day" disabled={day === LAST_STAY_DAY} onClick={() => selectDay(moveDay(day, 1))}><ChevronRight size={20} /></button></div></div>
        {view === "daily" ? <>{queuePanel}<div className="stay-daily-heading"><h2>Room availability</h2><p>Checkout day is free{!readOnly && " · Drag a guest or tap an empty bed"}</p></div><DailyRooms guests={guests} day={day} onAssign={openBed} onEdit={openGuest} saving={workspace.saving} rooms={rooms} lodging={lodging} drag={readOnly ? null : drag} readOnly={readOnly} /></> : <><p className="stay-overview-note">All Samarpan, Sadhak and offsite rooms · Checkout day is free. {queue.length} unassigned guests staying today.</p><RoomOverview guests={guests} day={day} rooms={allRooms} onAssign={openBed} onEdit={openGuest} saving={workspace.saving} readOnly={readOnly} /></>}
      </>}
      {!rooms.length && view !== "list" && <div className="stay-clean-state"><Building2 size={30} /><h2>No planning rooms yet</h2><p>{readOnly ? `No rooms have been added for ${hotel}.` : `Add a provisional room and its bed count to start assigning stays at ${hotel}.`}</p>{!readOnly && <button className="button primary" onClick={() => openRoom()}>Add planning room</button>}</div>}
      {view !== "list" && review.length > 0 && <details className="stay-review"><summary>{review.length} {lodging} assignments need review</summary><p>These assignments have missing dates, an unknown room, or a code that doesn’t identify a bed. Affected beds stay marked for review.</p>{review.map((g) => <button key={g.id} onClick={() => openGuest(g)}>{g.name} · {g.roomCode || `Room ${g.roomNo}`}</button>)}</details>}
      {view === "list" && <>
        <label className="search-field"><Search size={18} /><input aria-label="Search lodging attendees" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search attendee or room…" /></label>
        <div className="sheet-attendee-list">{listedGuests.map(guest => {
          const pending = unassignedGuest(guest), bed = bedForGuest(guest, workspace.offsiteRooms);
          const hotelRoom = offsiteRoomFor(guest, workspace.offsiteRooms);
          return <article className={`card sheet-attendee ${pending ? "is-unassigned" : ""}`} key={guest.id}>
            <div className="stay-card-heading"><h3>{guest.name}<WhatsAppSent guest={guest} /></h3>{pending && <span className="stay-pending-badge">Unassigned</span>}</div>
            <p className="stay-card-dates"><CalendarDays size={14} />{stayLabel(guest)}</p>
            <div className="stay-card-footer"><div className="sheet-room-details"><strong>{guest.lodging || "Lodging pending"}</strong><span>{guest.roomNo ? `Room ${guest.roomNo}` : hotelRoom?.label || "Room pending"}{bed ? ` · Bed ${bed}` : guest.roomCode ? ` · ${guest.roomCode}` : ""}</span></div>
              <button className="button secondary" disabled={(!readOnly && !guest.sourceWritable) || workspace.saving} onClick={() => openGuest(guest)}>{readOnly ? "View stay" : pending ? "Assign lodging" : "Edit assignment"}</button>
            </div>
            {!guest.sourceWritable && <p role="alert">Duplicate attendee identity in the sheet. Resolve it before assigning.</p>}
          </article>;
        })}</div>
        {!listedGuests.length && <p className="sheet-data-note">No guests match this search.</p>}
      </>}

    </>}
    {assignment && <Sheet title={selected ? `Lodging for ${selected.name}` : "Assign a guest"} subtitle={assignment.day ? `Choose a guest staying on ${shortDay(assignment.day)}.` : "Room and bed assignments follow the guest’s stay dates."} onClose={() => { if (!workspace.saving) setAssignment(null); }}>
      {readOnly ? <div className="stay-read-details">
        <p><strong>{selected?.name}</strong>{selected?.city && ` (${selected.city})`}</p>
        <p>{selected ? stayLabel(selected) : "Stay dates needed"}</p>
        <p>{selected?.lodging || "Lodging pending"} · Room {selected?.roomNo || "pending"}</p>
        <p>{selected?.roomCode || "Bed not assigned"}</p>
      </div> : <form className="op-form" onSubmit={save}>
        {assignment.day && !editingBed && selectedRoom && <ChosenBed room={selectedRoom} bed={bedNo} disabled={workspace.saving} onChange={() => setEditingBed(true)} />}
        {!assignment.guestFirst && <><label className="field">{assignment.childOnly ? "Child under 12" : "Guest"}<select aria-label="Guest to assign" value={selected?.id || ""} required disabled={workspace.saving} onChange={(e) => { setSelected(candidates.find((g) => g.id === e.target.value)); setError(""); }}><option value="" disabled>{assignment.childOnly ? "Select a child under 12" : "Select an unassigned guest"}</option>{candidates.map((g) => <option key={g.id} value={g.id} disabled={!g.sourceWritable}>{g.name} · {stayLabel(g)}</option>)}</select>{!candidates.length && <small>{assignment.childOnly ? 'No unassigned guests marked “Child (under 12)” are staying on this date.' : "No unassigned guests have a stay on this date."}</small>}</label>{!assignment.childOnly && <button type="button" className="stay-walkin-link" disabled={workspace.saving} onClick={() => openWalkIn(selectedRoom ? roomKey(selectedRoom) : "", bedNo, assignment.day || allentownDay())}><Plus size={16} />New walk-in guest</button>}</>}
        {(assignment.childOnly || isChildUnder12(selected)) && <p className="sheet-data-note">A guest marked “Child (under 12)” in column J may share an adult’s bed. The adult must have this bed reserved for the child’s full stay.</p>}
        {selected && <div className="stay-assignment-dates"><CalendarDays size={18} /><div><strong>{stayLabel(selected)}</strong><span>{stayRange(selected) ? "Reserves the full stay · Checkout day is free" : "Add valid stay dates in the source sheet first"}</span></div></div>}
        {(!assignment.day || editingBed) && <>
        <label className="field">Lodging location (AD)<select value={draft.lodging} disabled={workspace.saving} onChange={(e) => { setDraft({ lodging: e.target.value, roomNo: "", roomCode: "" }); setBedNo(""); setHotelRoomId(""); setError(""); }} required><option value="" disabled>Select lodging</option>{!LODGING_LOCATIONS.includes(draft.lodging) && <option disabled>{draft.lodging}</option>}{LODGING_LOCATIONS.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label className="field">{isFixedLodging(draft.lodging) ? "Room number (AE)" : "Hotel room slot"}<select aria-label={isFixedLodging(draft.lodging) ? "Room number (AE)" : "Hotel planning room"} value={isFixedLodging(draft.lodging) ? draft.roomNo : hotelRoomId} disabled={workspace.saving} onChange={(e) => { const target = draftRooms.find((r) => r.number === e.target.value); setDraft({ ...draft, roomNo: target && !isFixedLodging(draft.lodging) ? target.roomNo : e.target.value, roomCode: "" }); setHotelRoomId(target?.id || ""); setBedNo(""); setError(""); }} required><option value="" disabled>{isFixedLodging(draft.lodging) ? `Choose a ${draft.lodging} room` : "Choose a hotel room slot"}</option>{draftRooms.map((r) => <option key={r.number} value={r.number}>{isFixedLodging(draft.lodging) ? r.number : roomLabel(r)} · {roomCapacityLabel(r)}</option>)}</select></label>
        {!isFixedLodging(draft.lodging) && !draftRooms.length && <p className="sheet-data-note">Add a planning room in Offsite before assigning a guest to this hotel.</p>}
        {selectedRoom && !isFixedLodging(draft.lodging) && !selectedRoom.roomNo && <p className="sheet-data-note">The hotel room number is pending. Column AE stays blank; this provisional bed code keeps the assignment in place.</p>}
        <label className="field">Bed / guest place<select aria-label="Bed number" value={bedNo} disabled={workspace.saving || !selectedRoom} required onChange={(e) => { setBedNo(e.target.value); setDraft(assignmentFor(selectedRoom, e.target.value)); setError(""); }}><option value="" disabled>Choose a place</option>{Array.from({ length: selectedRoom?.beds || 0 }, (_, i) => { const number = i + 1; const value=assignmentFor(selectedRoom,number); const problem = selected ? assignmentIssue(workspace.guests, selected, value, workspace.offsiteRooms) : ""; const adults = selected && isChildUnder12(selected) && stayRange(selected) ? bedState(workspace.guests, selectedRoom.id || selectedRoom.number, number, stayRange(selected), selected, selectedRoom.lodging || 'Samarpan', workspace.offsiteRooms).occupants.filter(isAdultBedOccupant) : []; return <option key={number} value={number} disabled={!!problem}>{selectedRoom ? roomPlaceLabel(selectedRoom, number) : `Bed ${number}`}{problem ? " · unavailable for this stay" : adults.length ? ` · share with ${adults.map(g=>g.name).join(', ')}` : ""}</option>; })}</select></label>
        <label className="field">Custom room code (AF)<input value={draft.roomCode} readOnly disabled={workspace.saving} required placeholder="Generated from room and bed" /></label>
        </>}
        {selected && !stayRange(selected) && <a className="button secondary" href={SHEET_URL} target="_blank" rel="noreferrer">Open source sheet to add dates</a>}
        {(error || issue) && <p role="alert" className="op-form-error">{error || issue}</p>}
        <button className="button primary" disabled={!selected || !workspace.connected || workspace.saving || !selected?.sourceWritable || !!issue || !selectedRoom || !bedNo} type="submit">{workspace.saving ? "Saving…" : "Save assignment"}</button>
        {(selected?.lodging || selected?.room) && <button type="button" className="button secondary" disabled={!workspace.connected || workspace.saving} onClick={(e) => save(e, true)}>Clear lodging assignment (AD–AF)</button>}
      </form>}
    </Sheet>}
    {roomDraft && !readOnly && <Sheet title={roomDraft.id ? "Edit hotel room" : "Add planning room"} subtitle={roomDraft.lodging} onClose={() => { if (!workspace.saving) setRoomDraft(null); }}><form className="op-form" onSubmit={saveRoom}>
      <label className="field">Hotel room number (optional)<input value={roomDraft.roomNo} maxLength={100} placeholder="Leave blank until confirmed" onChange={(e) => setRoomDraft({ ...roomDraft, roomNo: e.target.value })} disabled={workspace.saving} /></label>
      <label className="field">Room type<select aria-label="Hawthorn room type" value={roomDraft.roomType || "doubleQueen"} onChange={(e) => { const type = HAWTHORN_ROOM_TYPES[e.target.value]; setRoomDraft({ ...roomDraft, roomType: e.target.value, beds: type.beds }); }} disabled={workspace.saving}><option value="king">King · 2 spots</option><option value="doubleQueen">Double Queen · 4 spots</option></select></label>
      <p className="sheet-data-note"><strong>{roomDraft.roomType === "king" ? "King" : "Double Queen"}:</strong> {roomDraft.roomType === "king" ? "1 bed · 2 people total." : "2 beds · 4 people total."} Changing type requires enough capacity for existing assignments.</p>
      <p className="sheet-data-note">Adding the actual hotel room number later preserves every guest assignment and stay date.</p>
      {roomError && <p className="op-form-error" role="alert">{roomError}</p>}<button className="button primary" disabled={workspace.saving || !workspace.connected}>{workspace.saving ? "Saving…" : "Save room"}</button>
    </form></Sheet>}
  </div>;
}
