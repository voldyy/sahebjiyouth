import { useState } from "react";
import { roomKey, roomAssignment } from "../lib/lodgingRooms";
import { roomLabel, roomPlaceLabel } from "../lib/offsite";
import { assignmentIssue } from "../lib/occupancy";
import ChosenBed from "./ChosenBed";

export default function WalkInForm({ workspace, rooms, initial, onCancel, onSaved }) {
  const [form, setForm] = useState({ name: "", phone: "", arrivalDate: initial.day, departureDate: "" });
  const [roomId, setRoomId] = useState(initial.room || "");
  const [bed, setBed] = useState(initial.bed ? String(initial.bed) : "");
  const [requestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [editingBed, setEditingBed] = useState(false);
  const room = rooms.find(r => roomKey(r) === roomId);
  const proposed = { ...form, status: "Registered", stay: "Pending lodging" };
  const assignment = number => roomAssignment(room, number);
  const issue = room && bed ? assignmentIssue(workspace.guests, proposed, assignment(bed), workspace.offsiteRooms) : "";
  const change = e => { setForm({ ...form, [e.target.name]: e.target.value }); setError(""); };
  return <form className="guest-form" onSubmit={async e => {
    e.preventDefault(); setError("");
    if (!room || !bed || issue) return;
    try { await workspace.addWalkIn({ ...form, overnight: "YES" }, assignment(bed), requestId); onSaved(form.name); }
    catch (failure) { setError(failure.message); }
  }}>
    {initial.room && initial.bed && !editingBed && room && <ChosenBed room={room} bed={bed} disabled={workspace.saving} onChange={() => setEditingBed(true)} />}
    <fieldset disabled={workspace.saving} style={{ border: 0, padding: 0, margin: 0 }}>
      <label className="field">Guest name<input name="name" value={form.name} onChange={change} required autoFocus maxLength={200} /></label>
      <div className="form-grid">
        <label className="field">Check-in<input type="date" name="arrivalDate" value={form.arrivalDate} onChange={change} required /></label>
        <label className="field">Checkout<input type="date" name="departureDate" min={form.arrivalDate} value={form.departureDate} onChange={change} required /></label>
      </div>
      {(!initial.room || !initial.bed || editingBed) && <div className="form-grid">
        <label className="field">Room<select aria-label="Walk-in room" value={roomId} required onChange={e => { setRoomId(e.target.value); setBed(""); setError(""); }}><option value="">Choose a room</option>{rooms.map(r => <option key={roomKey(r)} value={roomKey(r)}>{r.lodging || "Samarpan"} · {roomLabel(r)}</option>)}</select></label>
        <label className="field">Bed / guest place<select aria-label="Walk-in bed" value={bed} required disabled={!room} onChange={e => { setBed(e.target.value); setError(""); }}><option value="">Choose a place</option>{Array.from({ length: room?.beds || 0 }, (_, i) => {
          const number = i + 1;
          const problem = form.departureDate ? assignmentIssue(workspace.guests, proposed, assignment(number), workspace.offsiteRooms) : "";
          return <option key={number} value={number} disabled={!!problem}>{roomPlaceLabel(room, number)}{problem ? " · unavailable" : ""}</option>;
        })}</select></label>
      </div>}
      <label className="field">Phone <span className="optional">Optional</span><input name="phone" type="tel" value={form.phone} onChange={change} maxLength={200} /></label>
    </fieldset>
    {(error || issue) && <p role="alert" className="op-form-error">{error || issue}</p>}
    <div className="form-footer"><button type="button" className="button secondary" disabled={workspace.saving} onClick={onCancel}>Cancel</button><button type="submit" className="button primary" disabled={workspace.saving || !workspace.connected || !room || !bed || !!issue}>{workspace.saving ? "Saving…" : "Add guest & assign bed"}</button></div>
  </form>;
}
