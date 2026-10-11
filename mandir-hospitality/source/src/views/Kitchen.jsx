import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChefHat,
  Info,
  Moon,
  Settings2,
  Sun,
  Sunrise,
  Users,
} from "lucide-react";
import DaySelector from "../components/DaySelector";
import Sheet from "../components/Sheet";
import { useLocalStorage } from "../lib/storage";
import { dateISO } from "../lib/data";
import "../styles/kitchen.css";

// Arrival-day cutoffs are exclusive: 11 AM starts lunch, 3 PM starts dinner.
const MEALS = [
  {
    id: "breakfast",
    name: "Breakfast",
    time: "8:00 – 10:00 AM",
    cutoff: 11 * 60,
    icon: Sunrise,
  },
  {
    id: "lunch",
    name: "Lunch",
    time: "12:00 – 2:00 PM",
    cutoff: 15 * 60,
    icon: Sun,
  },
  {
    id: "dinner",
    name: "Dinner",
    time: "6:00 – 8:00 PM",
    cutoff: 24 * 60,
    icon: Moon,
  },
];
const TODAY_ESTIMATES = {
  breakfast: { volunteers: 24, visitors: 35, buffer: 10 },
  lunch: { volunteers: 45, visitors: 90, buffer: 10 },
  dinner: { volunteers: 40, visitors: 65, buffer: 10 },
};
function defaultPlans(day, sheetMode = false) {
  return Object.fromEntries(
    MEALS.map((meal) => [
      meal.id,
      !sheetMode && day === dateISO()
        ? { ...TODAY_ESTIMATES[meal.id] }
        : { volunteers: 0, visitors: 0, buffer: 10 },
    ]),
  );
}
function arrivalMinutes(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return 0;
  let hours = Number(match[1]);
  if (match[3])
    hours = (hours % 12) + (match[3].toUpperCase() === "PM" ? 12 : 0);
  return hours * 60 + Number(match[2]);
}
function getForecast(guests, meal, plan, day) {
  const attending = guests.filter((guest) => {
    if (guest.status === "Departed") return false;
    if (guest.status === "Cancelled") return false;
    if (guest.sourceIdentity && (!guest.arrivalDate || !guest.departureDate)) return false;
    if (guest.arrivalDate && guest.arrivalDate > day) return false;
    if (guest.departureDate && guest.departureDate < day) return false;
    if (guest.stay === "Day visitor" && guest.arrivalDate !== day) return false;
    return (
      (guest.arrivalDate && guest.arrivalDate < day) ||
      arrivalMinutes(guest.arrivalTime) < meal.cutoff
    );
  });
  const guestCount = attending.reduce(
    (sum, guest) => sum + Number(guest.count || 1),
    0,
  );
  const expected = guestCount + Number(plan.volunteers) + Number(plan.visitors);
  const bufferCount = Math.ceil((expected * Number(plan.buffer)) / 100);
  return {
    guests: guestCount,
    diners: attending.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    expected,
    bufferCount,
    target: expected + bufferCount,
  };
}

export default function Kitchen({ guests = [], toast = () => {}, sheetMode = false }) {
  const [planningDate, setPlanningDate] = useState(() => dateISO());
  const [selectedMeal, setSelectedMeal] = useState("lunch");
  return (
    <div className="kit-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Yogi Prasad</h1>
          <p className="page-description">
            Plan your Yogi Prasad headcount, one day at a time.
          </p>
        </div>
      </header>
      <DaySelector value={planningDate} onChange={setPlanningDate} />
      {/* Date controls stay mounted; each day gets its own storage lifecycle. */}
      <DailyKitchenPlan
        key={planningDate}
        day={planningDate}
        guests={guests}
        selected={selectedMeal}
        setSelected={setSelectedMeal}
        toast={toast}
        sheetMode={sheetMode}
      />
    </div>
  );
}

function DailyKitchenPlan({ day, guests, selected, setSelected, toast, sheetMode }) {
  const [savedPlans, setPlans] = useLocalStorage(
    `${sheetMode ? "sheet" : "seva"}-kitchen-plans-v1-${day}`,
    () => defaultPlans(day, sheetMode),
  );
  const [draft, setDraft] = useState(null);
  const [formError, setFormError] = useState("");
  const plans = useMemo(
    () =>
      Object.fromEntries(
        MEALS.map((meal) => [
          meal.id,
          { ...defaultPlans(day, sheetMode)[meal.id], ...savedPlans?.[meal.id] },
        ]),
      ),
    [savedPlans, day, sheetMode],
  );
  const meal = MEALS.find((item) => item.id === selected);
  const plan = plans[selected];
  const undatedGuests = guests.filter((guest) => guest.sourceIdentity && guest.status !== "Cancelled" && (!guest.arrivalDate || !guest.departureDate)).length;
  const forecasts = useMemo(
    () =>
      Object.fromEntries(
        MEALS.map((item) => [
          item.id,
          getForecast(guests, item, plans[item.id], day),
        ]),
      ),
    [guests, plans, day],
  );
  const forecast = forecasts[selected];
  const MealIcon = meal.icon;
  const formattedDate = new Date(`${day}T12:00:00`).toLocaleDateString(
    "en-US",
    { weekday: "short", month: "short", day: "numeric", year: "numeric" },
  );
  function openAdjustments() {
    setDraft({
      volunteers: plan.volunteers,
      visitors: plan.visitors,
      buffer: plan.buffer,
    });
    setFormError("");
  }
  function saveAdjustments(event) {
    event.preventDefault();
    const next = Object.fromEntries(
      ["volunteers", "visitors", "buffer"].map((key) => [
        key,
        Number(draft[key]),
      ]),
    );
    if (
      Object.values(next).some(
        (number) => !Number.isInteger(number) || number < 0,
      ) ||
      next.volunteers > 5000 ||
      next.visitors > 5000 ||
      next.buffer > 50
    ) {
      setFormError(
        "Enter whole headcounts up to 5,000 and a buffer between 0% and 50%.",
      );
      return;
    }
    setPlans((current) => ({
      ...current,
      [selected]: { ...plans[selected], ...next },
    }));
    const message = `${meal.name} headcount updated`;
    toast(`${message} for ${formattedDate}.`);
    setDraft(null);
  }
  return (
    <>
      {undatedGuests > 0 && <p className="sheet-data-note" role="status">{undatedGuests} attendees are excluded from meal forecasts because arrival or departure dates are missing. Complete those dates in the source sheet.</p>}
      <div className="kit-plan-toolbar">
        <span className="kit-roster-note">
          <span />
          Connected to guest roster
        </span>
      </div>
      <div className="kit-meals" role="group" aria-label="Choose a meal">
        {MEALS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              className={`kit-meal-card ${selected === item.id ? "is-selected" : ""}`}
              onClick={() => setSelected(item.id)}
              aria-pressed={selected === item.id}
            >
              <span className="kit-meal-name">
                <Icon size={18} />
                {item.name}
              </span>
              <span className="kit-meal-time">{item.time}</span>
              <span className="kit-meal-bottom">
                <span className="kit-meal-count">
                  {forecasts[item.id].expected.toLocaleString()}
                  <small>expected</small>
                </span>
                <span className="kit-meal-arrow">
                  <ArrowRight size={18} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="kit-layout">
        <section
          className="card kit-service-card"
          aria-labelledby="kit-service-title"
        >
          <div className="kit-service-heading">
            <div className="kit-service-title">
              <span className="kit-section-icon">
                <MealIcon size={21} />
              </span>
              <div>
                <h2 id="kit-service-title">{meal.name} service</h2>
                <p>{meal.time}</p>
              </div>
            </div>
            <span className="kit-detail-date">
              {new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <div className="kit-headcount-main">
            <div>
              <p className="kit-label">EXPECTED HEADCOUNT</p>
              <div className="kit-big-number">
                {forecast.expected.toLocaleString()}
                <span>guests</span>
              </div>
            </div>
            <div className="kit-prepare-target">
              <ChefHat size={20} />
              <span>
                Prepare for
                <strong>{forecast.target.toLocaleString()} plates</strong>
              </span>
              <small>Includes {plan.buffer}% buffer</small>
            </div>
          </div>
          <div className="kit-diners">
            <h3>Dining guests</h3>
            {forecast.diners.length ? (
              <ul className="kit-diner-list" aria-label={`${meal.name} diners`}>
                {forecast.diners.map((guest, index) => (
                  <li key={guest.sourceIdentity || guest.id || index}>
                    <span className="kit-diner-name">{guest.name || "Name not provided"}</span>
                    {guest.city && <span className="kit-diner-location"> ({guest.city})</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="kit-diners-empty">No guests scheduled for this meal.</p>}
            {forecast.expected > forecast.guests && <p className="kit-diners-empty">{forecast.expected - forecast.guests} additional diners have no names recorded.</p>}
          </div>
          <p className="kit-estimate-note">
            <Info size={14} />
            <span>Headcount adjustments are saved on this device.</span>
          </p>
          <div className="kit-service-actions">
            <button className="button secondary" onClick={openAdjustments}>
              <Settings2 size={16} />
              Adjust headcount
            </button>
          </div>
        </section>
      </div>
      {draft && (
        <Sheet
          title={`Adjust ${meal.name.toLowerCase()} plan`}
          subtitle={`${formattedDate} · Update the extra meals expected for this day.`}
          onClose={() => setDraft(null)}
        >
          <form onSubmit={saveAdjustments} className="kit-sheet-form">
            <div className="kit-roster-summary">
              <Users size={20} />
              <span>
                Guests from roster<strong>{forecast.guests} people</strong>
              </span>
              <span className="badge green">Automatic</span>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Volunteers</span>
                <input
                  type="number"
                  min="0"
                  max="5000"
                  step="1"
                  inputMode="numeric"
                  required
                  value={draft.volunteers}
                  onChange={(event) =>
                    setDraft({ ...draft, volunteers: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Walk-in visitors</span>
                <input
                  type="number"
                  min="0"
                  max="5000"
                  step="1"
                  inputMode="numeric"
                  required
                  value={draft.visitors}
                  onChange={(event) =>
                    setDraft({ ...draft, visitors: event.target.value })
                  }
                />
              </label>
            </div>
            <label className="field">
              <span>Extra preparation buffer (%)</span>
              <input
                type="number"
                min="0"
                max="50"
                step="1"
                inputMode="numeric"
                required
                value={draft.buffer}
                onChange={(event) =>
                  setDraft({ ...draft, buffer: event.target.value })
                }
              />
              <small>Extra portions to keep the day running smoothly.</small>
            </label>
            {formError && (
              <p className="kit-form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="kit-form-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                <Check size={16} />
                Save headcount
              </button>
            </div>
          </form>
        </Sheet>
      )}
    </>
  );
}
