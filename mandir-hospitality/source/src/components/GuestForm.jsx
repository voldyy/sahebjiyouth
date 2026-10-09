import { useState } from "react";
import { Plus, Check } from "lucide-react";
import { dateISO } from "../lib/data";

export default function GuestForm({ guest, onSave, onCancel }) {
  const [form, setForm] = useState(
    guest || {
      name: "",
      city: "",
      phone: "",
      count: 1,
      arrivalDate: dateISO(),
      arrivalTime: "14:00",
      departureDate: dateISO(),
      stay: "Samarpan",
      transport: "Needed",
      diet: "Regular",
      notes: "",
    },
  );
  const change = (event) =>
    setForm({ ...form, [event.target.name]: event.target.value });
  return (
    <form
      className="guest-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!form.name.trim() || !form.city.trim()) return;
        onSave({
          ...form,
          name: form.name.trim(),
          city: form.city.trim(),
          count: Number(form.count),
        });
      }}
    >
      <div className="form-section-label">GUEST INFORMATION</div>
      <label className="field">
        Guest or group name
        <input
          name="name"
          value={form.name}
          onChange={change}
          placeholder="e.g. Kiritbhai & Family"
          required
          maxLength={80}
        />
      </label>
      <div className="form-grid">
        <label className="field">
          City / mandir center
          <input
            name="city"
            value={form.city}
            onChange={change}
            placeholder="e.g. Robbinsville, NJ"
            required
            maxLength={80}
          />
        </label>
        <label className="field">
          Number of guests
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="100"
            name="count"
            value={form.count}
            onChange={change}
            required
          />
        </label>
      </div>
      <label className="field">
        Phone number <span className="optional">Optional</span>
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={change}
          placeholder="+1 (609) 555-0123"
          maxLength={30}
        />
      </label>
      <div className="form-section-label">ARRIVAL & STAY</div>
      <div className="form-grid">
        <label className="field">
          Arrival date
          <input
            name="arrivalDate"
            type="date"
            value={form.arrivalDate}
            onChange={(event) =>
              setForm({
                ...form,
                arrivalDate: event.target.value,
                departureDate:
                  form.departureDate < event.target.value
                    ? event.target.value
                    : form.departureDate,
              })
            }
            required
          />
        </label>
        <label className="field">
          Arrival time
          <input
            name="arrivalTime"
            type="time"
            value={form.arrivalTime}
            onChange={change}
            required
          />
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          Accommodation
          <select name="stay" value={form.stay} onChange={change}>
            <option>Samarpan</option>
            <option>Offsite</option>
            <option>Day visitor</option>
          </select>
        </label>
        <label className="field">
          Departure date
          <input
            name="departureDate"
            type="date"
            min={form.arrivalDate}
            value={form.departureDate}
            onChange={change}
            required
          />
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          Transport
          <select name="transport" value={form.transport} onChange={change}>
            <option>Needed</option>
            {guest?.transport === "Assigned" && <option>Assigned</option>}
            <option>Not needed</option>
          </select>
        </label>
        <label className="field">
          Dietary preference
          <select name="diet" value={form.diet} onChange={change}>
            <option>Regular</option>
            <option>Jain</option>
            <option>Diabetic</option>
          </select>
        </label>
      </div>
      <label className="field">
        Seva notes <span className="optional">Optional</span>
        <textarea
          name="notes"
          value={form.notes}
          onChange={change}
          placeholder="Accessibility needs, luggage or anything we should know…"
          rows={3}
          maxLength={500}
        />
      </label>
      <div className="form-footer">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" type="submit">
          {guest ? <Check size={17} /> : <Plus size={17} />}{" "}
          {guest ? "Save changes" : "Add guest"}
        </button>
      </div>
    </form>
  );
}
