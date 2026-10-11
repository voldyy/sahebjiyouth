import { useState } from "react";
import { BedDouble, CalendarDays, ChevronLeft, ChevronRight, List, Plus, Search, Users } from "lucide-react";
import Sheet from "../components/Sheet";
import { DailyRooms, RoomStrip, WeeklyRooms } from "../components/RoomCalendar";
import { LODGING_LOCATIONS, SHEET_URL } from "../lib/sheets";
import { samarpanRooms, samarpanBedCount, samarpanRoomCode } from "../lib/lodgingRooms";
import { FIRST_STAY_DAY, LAST_STAY_DAY, WEEK_STARTS, moveDay, shortDay, fullDay, needsLodging, stayRange, overlaps, onDay, unassignedGuest, bedForGuest, assignmentIssue } from "../lib/occupancy";
import "../styles/operations.css";
import "../styles/sheets.css";
import "../styles/accommodation-calendar.css";

const blankDraft = { lodging: "Samarpan", roomNo: "", roomCode: "" };
const stayLabel = (guest) => { const stay = stayRange(guest); return stay ? `${shortDay(stay.start)} – ${shortDay(stay.end)}` : "Stay dates needed"; };

export default function SheetAccommodation({ workspace, toast }) {
  const [view, setView] = useState("weekly");
  const [weekIndex, setWeekIndex] = useState(0);
  const [day, setDay] = useState(FIRST_STAY_DAY);
  const [roomNo, setRoomNo] = useState(samarpanRooms[0].number);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All lodging");
  const [queueQuery, setQueueQuery] = useState("");
  const [assignment, setAssignment] = useState(null);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(blankDraft);
  const [bedNo, setBedNo] = useState("");
  const [error, setError] = useState("");
  const guests = workspace.guests.filter(needsLodging);
  const week = WEEK_STARTS[weekIndex];
  const room = samarpanRooms.find((entry) => entry.number === roomNo);
  const selectedRoom = samarpanRooms.find((entry) => entry.number === draft.roomNo);
  const windowRange = view === "daily" ? { start: day, end: moveDay(day, 1) } : { start: week, end: moveDay(week, 7) };
  const queue = guests.filter((guest) => unassignedGuest(guest) && overlaps(stayRange(guest), windowRange));
  const undated = guests.filter((guest) => unassignedGuest(guest) && !stayRange(guest));
  const review = guests.filter((guest) => guest.lodging === "Samarpan" && guest.roomNo && (!bedForGuest(guest) || !stayRange(guest)));
  const candidates = guests.filter((guest) => unassignedGuest(guest) && (!assignment?.day || onDay(guest, assignment.day)));
  const issue = selected && draft.lodging === "Samarpan" && draft.roomCode ? assignmentIssue(workspace.guests, selected, draft) : "";
  const selectDay = (next) => {
    if (next < FIRST_STAY_DAY || next > LAST_STAY_DAY) return;
    setDay(next);
    setWeekIndex(WEEK_STARTS.findLastIndex((start) => start <= next));
  };
  const changeWeek = (next) => { setWeekIndex(next); setDay(WEEK_STARTS[next]); };
  const resetForm = () => { setError(""); setBedNo(""); setSelected(null); };
  const openGuest = (guest) => {
    resetForm(); setSelected(guest);
    const lodging = guest.lodging || "Samarpan";
    const nextRoom = guest.roomNo || (lodging === "Samarpan" ? roomNo : "");
    const bed = bedForGuest(guest);
    setDraft({ lodging, roomNo: nextRoom, roomCode: guest.roomCode || "" });
    setBedNo(bed ? String(bed) : "");
    setAssignment({ day: null, guestFirst: true });
  };
  const openBed = (number, bed, date) => {
    resetForm(); setDraft({ lodging: "Samarpan", roomNo: number, roomCode: samarpanRoomCode(number, bed) });
    setBedNo(String(bed)); setAssignment({ day: date, guestFirst: false });
  };
  const openAssign = () => { resetForm(); setDraft({ ...blankDraft, roomNo }); setAssignment({ day: null, guestFirst: false }); };
  const close = () => { if (!workspace.saving) setAssignment(null); };
  const save = async (event, clear = false) => {
    event.preventDefault(); setError("");
    if (!selected) { setError("Select a guest to assign."); return; }
    if (!clear && issue) { setError(issue); return; }
    try {
      await workspace.saveAssignment(selected, clear ? { lodging: "", roomNo: "", roomCode: "" } : draft);
      setAssignment(null);
      toast(clear ? "Lodging assignment cleared." : `Room ${draft.roomNo} assigned to ${selected.name}.`);
    } catch (failure) { setError(failure.message); }
  };
  const queuePanel = <section className="stay-unassigned" aria-label="Unassigned guests">
    <header><div><span className="stay-section-icon"><Users size={18} /></span><h2>Unassigned guests <span>{queue.length}</span></h2><p>{view === "daily" ? shortDay(day) : `${shortDay(week)} – ${shortDay(moveDay(week, 6))}`}</p></div><label className="stay-queue-search"><Search size={16} /><input aria-label="Search unassigned guests" placeholder="Find a guest…" value={queueQuery} onChange={(event) => setQueueQuery(event.target.value)} /></label></header>
    {queue.length ? <div className="stay-queue-cards">{queue.filter((g) => `${g.name} ${g.registrationId}`.toLowerCase().includes(queueQuery.toLowerCase())).map((guest) => <button key={guest.id} className="stay-queue-card" disabled={!guest.sourceWritable || workspace.saving} onClick={() => openGuest(guest)} aria-label={`Assign ${guest.name}`}><span className="stay-guest-initials">{guest.initials}</span><span><strong>{guest.name}</strong><small>{stayLabel(guest)}</small></span><Plus size={17} /></button>)}</div> : <p className="stay-empty-queue">{workspace.loading ? "Loading guests…" : "Everyone with a stay in this period has a lodging assignment."}</p>}
    {undated.length > 0 && <details className="stay-review"><summary>{undated.length} unassigned guests need stay dates</summary><p>Add Accommodation In/Out dates in the sheet to place these guests on the calendar.</p>{undated.map((guest) => <button key={guest.id} onClick={() => openGuest(guest)}>{guest.name}</button>)}</details>}
  </section>;

  if (!workspace.refreshedAt) return <div className="stay-workspace"><h1 className="page-title">Accommodation</h1><p role="status">{workspace.loading ? "Loading room occupancy from the sheet…" : "Room occupancy is unavailable. Refresh the sheet to load the calendar."}</p></div>;
  return <div className="stay-workspace">
    <header className="page-header"><div><p className="eyebrow">SAMARPAN · {samarpanRooms.length} ROOMS · {samarpanBedCount} BEDS</p><h1 className="page-title">Accommodation</h1><p className="page-description">See who’s staying, find an empty bed, and make room for the next arrival.</p></div><button className="button primary" onClick={openAssign} disabled={workspace.saving}><Plus size={17} /> Assign guest</button></header>
    <div className="stay-view-switch" role="group" aria-label="Accommodation views">{[{ id: "weekly", label: "Weekly view", icon: CalendarDays }, { id: "daily", label: "Daily view", icon: BedDouble }, { id: "list", label: "Guest list", icon: List }].map((tab) => <button key={tab.id} aria-pressed={view === tab.id} onClick={() => setView(tab.id)}><tab.icon size={17} />{tab.label}</button>)}</div>
    {view === "weekly" && <>
      <RoomStrip selected={roomNo} onSelect={setRoomNo} />
      <div className="stay-date-toolbar"><div><span className="stay-kicker">WEEK {weekIndex + 1} OF {WEEK_STARTS.length}</span><h2 aria-live="polite">{shortDay(week)} – {shortDay(moveDay(week, 6))}, 2026</h2></div><div className="stay-date-controls"><button className="stay-arrow" aria-label="Previous week" disabled={weekIndex === 0} onClick={() => changeWeek(weekIndex - 1)}><ChevronLeft size={20} /></button><select aria-label="Choose occupancy week" value={weekIndex} onChange={(event) => changeWeek(Number(event.target.value))}>{WEEK_STARTS.map((start, index) => <option key={start} value={index}>{shortDay(start)} – {shortDay(moveDay(start, 6))}</option>)}</select><button className="stay-arrow" aria-label="Next week" disabled={weekIndex === WEEK_STARTS.length - 1} onClick={() => changeWeek(weekIndex + 1)}><ChevronRight size={20} /></button></div></div>
      <WeeklyRooms guests={guests} room={room} week={week} onAssign={openBed} onEdit={openGuest} saving={workspace.saving} onChooseDay={(next) => { selectDay(next); setView("daily"); }} />
      {queuePanel}
    </>}
    {view === "daily" && <>
      <div className="stay-date-toolbar"><div><span className="stay-kicker">ALL SAMARPAN ROOMS</span><h2 aria-live="polite">{fullDay(day)}</h2></div><div className="stay-date-controls"><button className="stay-arrow" aria-label="Previous occupancy day" disabled={day === FIRST_STAY_DAY} onClick={() => selectDay(moveDay(day, -1))}><ChevronLeft size={20} /></button><label className="stay-date-input"><CalendarDays size={17} /><input type="date" aria-label="Choose occupancy date" min={FIRST_STAY_DAY} max={LAST_STAY_DAY} value={day} onChange={(event) => { if (event.target.value) selectDay(event.target.value); }} /></label><button className="stay-arrow" aria-label="Next occupancy day" disabled={day === LAST_STAY_DAY} onClick={() => selectDay(moveDay(day, 1))}><ChevronRight size={20} /></button></div></div>
      {queuePanel}
      <div className="stay-daily-heading"><h2>Room availability</h2><p>Checkout day is free · Select an empty bed to assign</p></div>
      <DailyRooms guests={guests} day={day} onAssign={openBed} onEdit={openGuest} saving={workspace.saving} />
    </>}
    {view !== "list" && review.length > 0 && <details className="stay-review"><summary>{review.length} Samarpan assignments need review</summary><p>These assignments have missing dates, an unknown room, or a code that doesn’t identify a bed. Affected beds stay marked for review.</p>{review.map((guest) => <button key={guest.id} onClick={() => openGuest(guest)}>{guest.name} · {guest.roomCode || `Room ${guest.roomNo}`}</button>)}</details>}
    {view === "list" && <>
      <div className="sheet-filter-bar"><label className="search-field"><Search size={18} /><input aria-label="Search lodging attendees" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search attendee, registration or room…" /></label><label className="field">Lodging filter<select value={filter} onChange={(event) => setFilter(event.target.value)}>{["All lodging", "Unassigned", ...LODGING_LOCATIONS].map((option) => <option key={option}>{option}</option>)}</select></label></div>
      <div className="sheet-attendee-list">{guests.filter((g) => (filter === "All lodging" || (filter === "Unassigned" ? unassignedGuest(g) : g.lodging === filter)) && [g.name, g.registrationId, g.lodging, g.roomNo, g.roomCode].join(" ").toLowerCase().includes(query.toLowerCase())).map((guest) => <article className="card sheet-attendee" key={guest.id}><div><h3>{guest.name}</h3><p>{guest.registrationId}</p><p>{stayLabel(guest)}</p></div><div className="sheet-room-details"><strong>{guest.lodging || "Lodging pending"}</strong><span>Room: {guest.roomNo || "Not assigned"}</span><span>Custom code: {guest.roomCode || "Not assigned"}</span></div><button className="button secondary" disabled={!guest.sourceWritable || workspace.saving} onClick={() => openGuest(guest)}>{guest.room ? "Edit assignment" : "Assign lodging"}</button>{!guest.sourceWritable && <p role="alert">Duplicate attendee identity in the sheet. Resolve it before assigning.</p>}</article>)}</div>
    </>}
    {assignment && <Sheet title={selected ? `Lodging for ${selected.name}` : `Assign a guest${draft.roomCode ? ` · ${draft.roomCode}` : ""}`} subtitle={assignment.day ? `Empty on ${shortDay(assignment.day)}. The assignment covers the guest’s full stay.` : "Room and bed assignments follow the guest’s stay dates."} onClose={close}>
      <form className="op-form" onSubmit={save}>
        {!assignment.guestFirst && <label className="field">Guest<select aria-label="Guest to assign" value={selected?.id || ""} required disabled={workspace.saving} onChange={(event) => { setSelected(candidates.find((guest) => guest.id === event.target.value)); setError(""); }}><option value="" disabled>Select an unassigned guest</option>{candidates.map((guest) => <option key={guest.id} value={guest.id} disabled={!guest.sourceWritable}>{guest.name} · {stayLabel(guest)}</option>)}</select>{!candidates.length && <small>No unassigned guests have a stay on this date.</small>}</label>}
        {selected && <div className="stay-assignment-dates"><CalendarDays size={18} /><div><strong>{stayLabel(selected)}</strong><span>{stayRange(selected) ? "Checkout day is available for the next guest" : "Add valid stay dates in the source sheet first"}</span></div></div>}
        <label className="field">Lodging location (AD)<select value={draft.lodging} disabled={workspace.saving} onChange={(event) => { setDraft({ lodging: event.target.value, roomNo: "", roomCode: "" }); setBedNo(""); setError(""); }} required><option value="" disabled>Select lodging</option>{LODGING_LOCATIONS.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label className="field">Room number (AE){draft.lodging === "Samarpan" ? <select value={draft.roomNo} disabled={workspace.saving} onChange={(event) => { setDraft({ ...draft, roomNo: event.target.value, roomCode: "" }); setBedNo(""); setError(""); }} required><option value="" disabled>Choose a Samarpan room</option>{draft.roomNo && !selectedRoom && <option value={draft.roomNo} disabled>{draft.roomNo} — choose a confirmed room</option>}{samarpanRooms.map((entry) => <option key={entry.number} value={entry.number}>{entry.number} · {entry.beds} beds</option>)}</select> : <input value={draft.roomNo} disabled={workspace.saving} onChange={(event) => setDraft({ ...draft, roomNo: event.target.value })} maxLength={100} required placeholder="e.g. 021" />}</label>
        {draft.lodging === "Samarpan" && <label className="field">Bed number<select value={bedNo} disabled={workspace.saving || !selectedRoom} required onChange={(event) => { setBedNo(event.target.value); setDraft({ ...draft, roomCode: samarpanRoomCode(draft.roomNo, event.target.value) }); setError(""); }}><option value="" disabled>Choose a bed</option>{Array.from({ length: selectedRoom?.beds || 0 }, (_, i) => {
          const number = i + 1;
          const problem = selected ? assignmentIssue(guests, selected, { ...draft, roomCode: samarpanRoomCode(draft.roomNo, number) }) : "";
          return <option key={number} value={number} disabled={!!problem}>Bed {number}{problem ? " · unavailable for this stay" : ""}</option>;
        })}</select></label>}
        <label className="field">Custom room code (AF)<input value={draft.roomCode} readOnly={draft.lodging === "Samarpan"} disabled={workspace.saving} onChange={(event) => setDraft({ ...draft, roomCode: event.target.value })} maxLength={100} required placeholder={draft.lodging === "Samarpan" ? "Generated from room and bed" : "Enter your customized code"} /></label>
        {selected && !stayRange(selected) && <a className="button secondary" href={SHEET_URL} target="_blank" rel="noreferrer">Open source sheet to add dates</a>}
        {!workspace.connected && <p className="sheet-data-note">Waiting for the shared sheet connection…</p>}
        {(error || issue) && <p role="alert" className="op-form-error">{error || issue}</p>}
        <button className="button primary" disabled={!selected || !workspace.connected || workspace.saving || !selected?.sourceWritable || !!issue} type="submit">{workspace.saving ? "Saving…" : "Save assignment to sheet"}</button>
        {selected?.room && <button type="button" className="button secondary" disabled={!workspace.connected || workspace.saving} onClick={(event) => save(event, true)}>Clear lodging assignment (AD–AF)</button>}
      </form>
    </Sheet>}
  </div>;
}
