import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChefHat,
  ClipboardCheck,
  Download,
  Info,
  Moon,
  Settings2,
  Sun,
  Sunrise,
  Users,
} from "lucide-react";
import DaySelector from "../components/DaySelector";
import Sheet from "../components/Sheet";
import { exportCsv, useLocalStorage } from "../lib/storage";
import { dateISO } from "../lib/data";
import "../styles/kitchen.css";

const MEALS = [
  {
    id: "breakfast",
    name: "Breakfast",
    time: "7:00 – 9:00 AM",
    cutoff: 9 * 60,
    icon: Sunrise,
  },
  {
    id: "lunch",
    name: "Lunch",
    time: "11:30 AM – 2:00 PM",
    cutoff: 14 * 60,
    icon: Sun,
  },
  {
    id: "dinner",
    name: "Dinner",
    time: "7:00 – 9:30 PM",
    cutoff: 21 * 60 + 30,
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
      arrivalMinutes(guest.arrivalTime) <= meal.cutoff
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
          <p className="eyebrow">KITCHEN & ANNAKSHETRA</p>
          <h1 className="page-title">Every plate, with care.</h1>
          <p className="page-description">
            Plan your Mahaprasad headcount, one day at a time.
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
  const [activity, setActivity] = useLocalStorage(
    `${sheetMode ? "sheet" : "seva"}-kitchen-activity-v1-${day}`,
    [],
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
    setActivity((current) =>
      [
        { id: crypto.randomUUID(), meal: meal.name, message, time: Date.now() },
        ...current,
      ].slice(0, 12),
    );
    toast(`${message} for ${formattedDate}.`);
    setDraft(null);
  }
  function exportPlan() {
    const rows = [
      [
        "Date",
        "Meal",
        "Meal time",
        "Roster guests",
        "Volunteers",
        "Walk-in visitors",
        "Expected",
        "Buffer plates",
        "Prepare",
      ],
    ];
    MEALS.forEach((item) => {
      const count = forecasts[item.id];
      const current = plans[item.id];
      rows.push([
        day,
        item.name,
        item.time,
        count.guests,
        current.volunteers,
        current.visitors,
        count.expected,
        count.bufferCount,
        count.target,
      ]);
    });
    exportCsv(`mahaprasad-plan-${day}.csv`, rows);
    toast(`Kitchen plan exported for ${formattedDate}.`);
  }
  return (
    <>
      {undatedGuests > 0 && <p className="sheet-data-note" role="status">{undatedGuests} attendees are excluded from meal forecasts because arrival or departure dates are missing. Complete those dates in the source sheet.</p>}
      <div className="kit-plan-toolbar">
        <span className="kit-roster-note">
          <span />
          Connected to guest roster
        </span>
        <button className="button secondary kit-export" onClick={exportPlan}>
          <Download size={16} />
          Export plan
        </button>
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
          <div className="kit-count-breakdown">
            <div>
              <span className="kit-dot roster" />
              Roster guests<strong>{forecast.guests}</strong>
            </div>
            <div>
              <span className="kit-dot volunteers" />
              Volunteers<strong>{plan.volunteers}</strong>
            </div>
            <div>
              <span className="kit-dot visitors" />
              Walk-in visitors<strong>{plan.visitors}</strong>
            </div>
          </div>
          <div className="kit-breakdown-bar" aria-hidden="true">
            <span style={{ flex: forecast.guests || 0.01 }} />
            <span style={{ flex: Number(plan.volunteers) || 0.01 }} />
            <span style={{ flex: Number(plan.visitors) || 0.01 }} />
          </div>
          <p className="kit-estimate-note">
            <Info size={14} />
            <span>
              {day === dateISO()
                ? "Volunteer and walk-in counts are editable demo estimates."
                : "Add this day’s expected volunteers and walk-in visitors to your plan."}
            </span>
          </p>
          <div className="kit-service-actions">
            <button className="button secondary" onClick={openAdjustments}>
              <Settings2 size={16} />
              Adjust headcount
            </button>
          </div>
        </section>
        <section
          className="card kit-activity-card"
          aria-labelledby="kit-activity-title"
        >
          <div className="kit-card-header">
            <div>
              <h2 id="kit-activity-title">Kitchen updates</h2>
              <p>Plan changes for {formattedDate}.</p>
            </div>
            <ClipboardCheck size={20} />
          </div>
          {activity.length ? (
            <ul className="kit-activity-list">
              {activity.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <span className="kit-activity-check">
                    <Check size={14} />
                  </span>
                  <div>
                    <strong>{item.message}</strong>
                    <span>{item.meal}</span>
                  </div>
                  <time dateTime={new Date(item.time).toISOString()}>
                    {new Date(item.time).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <div className="kit-no-updates">
              <span className="kit-activity-check">
                <Check size={15} />
              </span>
              <div>
                <strong>Your plan is ready to review</strong>
                <p>
                  Guest stays inform this day’s headcount. Adjustments for this
                  date will appear here.
                </p>
              </div>
            </div>
          )}
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
