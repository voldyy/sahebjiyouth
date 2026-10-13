import { useState } from "react";

export default function SheetGuestForm({ onSave, onCancel, saving }) {
  const [form, setForm] = useState({ name: "", primaryContact: "", relationship: "", city: "", phone: "", arrivalDate: "", arrivalTime: "", departureDate: "", departureTime: "", overnight: "", travelMethod: "", airportTransport: "", notes: "" });
  const [requestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const input = (name, label, type = "text", required = false) => <label className="field" key={name}>{label}{!required && <span className="optional"> Optional</span>}<input name={name} type={type} value={form[name]} onChange={change} required={required} maxLength={200} /></label>;
  return <form className="guest-form" onSubmit={async (event) => {
    event.preventDefault(); setError("");
    try { await onSave(form, requestId); } catch (failure) { setError(failure.message); }
  }}>
    <p>Add one attendee per entry. Leave details blank until they are known. Assign rooms in Accommodations after saving.</p>
    <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0 }}>
      {input("name", "Attendee full name", "text", true)}
      <div className="form-grid">{input("primaryContact", "Primary contact name")}{input("relationship", "Relationship to primary")}</div>
      <div className="form-grid">{input("city", "City & state")}{input("phone", "Phone number", "tel")}</div>
      <div className="form-section-label">ARRIVAL & STAY</div>
      <div className="form-grid">{input("arrivalDate", "Arrival / check-in date", "date")}{input("arrivalTime", "Arrival time", "time")}</div>
      <div className="form-grid">{input("departureDate", "Departure / checkout date", "date")}{input("departureTime", "Departure time", "time")}</div>
      <div className="form-grid">
        <label className="field">Overnight accommodation needed<select name="overnight" value={form.overnight} onChange={change}><option value="">To be confirmed</option><option value="YES">Yes</option><option value="NO">No — day visitor</option></select></label>
        <label className="field">Travel mode<select name="travelMethod" value={form.travelMethod} onChange={change}><option value="">To be confirmed</option>{["CAR", "FLIGHT", "BUS", "Bus (arrival)"].map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      <label className="field">Airport pickup / drop-off needed<select name="airportTransport" value={form.airportTransport} onChange={change}><option value="">To be confirmed</option><option value="YES">Yes</option><option value="NO">No</option></select></label>
      <label className="field">Notes <span className="optional">Optional</span><textarea name="notes" value={form.notes} onChange={change} rows={3} maxLength={1000} /></label>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <div className="form-footer"><button type="button" className="button secondary" onClick={onCancel} disabled={saving}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Saving…" : "Add guest"}</button></div>
  </form>;
}
