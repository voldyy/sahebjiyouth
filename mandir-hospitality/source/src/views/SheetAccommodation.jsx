import { useState } from "react";
import { BedDouble, KeyRound, Search } from "lucide-react";
import Sheet from "../components/Sheet";
import { LODGING_LOCATIONS } from "../lib/sheets";
import "../styles/operations.css";
import "../styles/sheets.css";

export default function SheetAccommodation({ workspace, toast }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All lodging");
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({ lodging: "Samarpan", roomNo: "", roomCode: "" });
  const [error, setError] = useState("");
  const guests = workspace.guests.filter((g) => g.stay !== "Day visitor" && g.status !== "Cancelled");
  const filtered = guests.filter((g) =>
    (filter === "All lodging" || (filter === "Unassigned" ? !g.room : g.lodging === filter)) &&
    [g.name, g.registrationId, g.primaryContact, g.lodging, g.roomNo, g.roomCode].join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  const open = (guest) => {
    setSelected(guest);
    setDraft({ lodging: guest.lodging || "Samarpan", roomNo: guest.roomNo, roomCode: guest.roomCode });
    setError("");
  };
  const save = async (event, clear = false) => {
    event.preventDefault();
    setError("");
    try {
      await workspace.saveAssignment(selected, clear ? { lodging: "", roomNo: "", roomCode: "" } : draft);
      setSelected(null);
      toast(clear ? "Lodging cleared in columns AD–AF." : "Lodging saved to Google Sheets (AD–AF).");
    } catch (failure) { setError(failure.message); }
  };
  return (
    <div className="op-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">LODGING ASSIGNMENTS</p>
          <h1 className="page-title">Accommodation</h1>
          <p className="page-description">One attendee per sheet row. Assign Samarpan, Comfort Inn, or Hawthorn.</p>
        </div>
      </div>
      <div className="sheet-summary-grid">
        {LODGING_LOCATIONS.map((lodging) => (
          <div className="card op-stat" key={lodging}>
            <BedDouble size={22} />
            <div><span className="op-stat-label">{lodging}</span><strong>{guests.filter((g) => g.lodging === lodging && g.room).length}<small> attendees assigned</small></strong></div>
          </div>
        ))}
      </div>
      <p className="sheet-data-note">Room inventory and bed capacities are not supplied by this sheet. Enter the actual room number and custom code; availability is not inferred.</p>
      <div className="sheet-filter-bar">
        <label className="search-field"><Search size={18} /><input aria-label="Search lodging attendees" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search attendee, registration or room…" /></label>
        <label className="field">Lodging filter<select value={filter} onChange={(e) => setFilter(e.target.value)}>{["All lodging", "Unassigned", ...LODGING_LOCATIONS].map((option) => <option key={option}>{option}</option>)}</select></label>
      </div>
      <div className="sheet-attendee-list">
        {filtered.map((guest) => (
          <article className="card sheet-attendee" key={guest.id}>
            <div><h3>{guest.name}</h3><p>{guest.registrationId}</p><p>{guest.accommodationIn || "Stay dates not provided"}{guest.accommodationOut ? ` to ${guest.accommodationOut}` : ""}</p></div>
            <div className="sheet-room-details"><strong>{guest.lodging || "Lodging pending"}</strong><span>Room: {guest.roomNo || "Not assigned"}</span><span>Custom code: {guest.roomCode || "Not assigned"}</span></div>
            <button className="button secondary" disabled={!guest.sourceWritable || workspace.saving} onClick={() => open(guest)}><KeyRound size={16} />{guest.room ? "Edit assignment" : "Assign lodging"}</button>
            {!guest.sourceWritable && <p role="alert">Duplicate attendee identity in the sheet. Resolve it before assigning.</p>}
          </article>
        ))}
        {!filtered.length && <div className="card op-empty">{workspace.loading ? "Loading sheet attendees…" : "No attendees match this filter."}</div>}
      </div>
      {selected && <Sheet title={`Lodging for ${selected.name}`} subtitle="Only this attendee’s AD, AE and AF cells will change." onClose={() => { if (!workspace.saving) setSelected(null); }}>
        <form className="op-form" onSubmit={save}>
          <label className="field">Lodging location (AD)<select value={draft.lodging} disabled={workspace.saving} onChange={(e) => setDraft({ ...draft, lodging: e.target.value })} required><option value="" disabled>Select lodging</option>{LODGING_LOCATIONS.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label className="field">Room number (AE)<input value={draft.roomNo} disabled={workspace.saving} onChange={(e) => setDraft({ ...draft, roomNo: e.target.value })} maxLength={100} required placeholder="e.g. 021" /></label>
          <label className="field">Custom room code (AF)<input value={draft.roomCode} disabled={workspace.saving} onChange={(e) => setDraft({ ...draft, roomCode: e.target.value })} maxLength={100} required placeholder="Enter your customized code" /></label>
          <p className="sheet-data-note">Updates affect this attendee only, not everyone with the same primary contact. Keep the sheet’s row order unchanged while a save is in progress.</p>
          {!workspace.connected && <button type="button" className="button secondary" onClick={workspace.connect}>Sign in with Google to save</button>}
          {error && <p role="alert" className="op-form-error">{error}</p>}
          <button className="button primary" disabled={!workspace.connected || workspace.saving || !selected.sourceWritable} type="submit">{workspace.saving ? "Saving to sheet…" : "Save assignment to sheet"}</button>
          {selected.room && <button type="button" className="button secondary" disabled={!workspace.connected || workspace.saving} onClick={(e) => save(e, true)}>Clear lodging assignment (AD–AF)</button>}
        </form>
      </Sheet>}
    </div>
  );
}
