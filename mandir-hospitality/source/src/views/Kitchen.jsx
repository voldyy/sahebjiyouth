import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChefHat,
  Info,
  MessageCircle,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sun,
  Sunrise,
  Users,
} from "lucide-react";
import DaySelector from "../components/DaySelector";
import Sheet from "../components/Sheet";
import { useLocalStorage } from "../lib/storage";
import { dateISO } from "../lib/data";
import { getForecast, MEAL_CUTOFFS } from "../lib/mealForecast.js";
import "../styles/kitchen.css";

// Arrival-day cutoffs are exclusive: 11 AM starts lunch, 3 PM starts dinner.
const MEALS = [
  { id: "breakfast", name: "Breakfast", time: "8:00 – 10:00 AM", cutoff: MEAL_CUTOFFS.breakfast, icon: Sunrise },
  { id: "lunch", name: "Lunch", time: "12:00 – 2:00 PM", cutoff: MEAL_CUTOFFS.lunch, icon: Sun },
  { id: "dinner", name: "Dinner", time: "6:00 – 8:00 PM", cutoff: MEAL_CUTOFFS.dinner, icon: Moon },
];
const TODAY_ADJUSTMENTS = { breakfast: 59, lunch: 135, dinner: 105 };
const ARRIVAL_LABELS = { morning: "Morning", before_noon: "Before noon", before_evening: "Before evening" };
const FASTING_LABELS = { no: "No", lunch: "Yes — lunch", dinner: "Yes — dinner" };

function defaultPlans(day, sheetMode = false) {
  return Object.fromEntries(MEALS.map((meal) => [meal.id, {
    adjustment: !sheetMode && day === dateISO() ? TODAY_ADJUSTMENTS[meal.id] : 0,
    buffer: 10,
    revision: "",
  }]));
}

function normalizedPlan(value, fallback) {
  const adjustment = Number(value?.adjustment ?? fallback.adjustment);
  const buffer = Number(value?.buffer ?? fallback.buffer);
  return {
    adjustment: Number.isFinite(adjustment) ? adjustment : fallback.adjustment,
    buffer: Number.isFinite(buffer) ? buffer : fallback.buffer,
    revision: String(value?.revision || ""),
  };
}

function guestIdentity(guest) {
  return guest?.sourceIdentity || guest?.id || "";
}

function mealOverrideFor(guest, day, meal) {
  return Array.isArray(guest?.mealOverrides)
    ? guest.mealOverrides.find((override) => override.day === day && override.meal === meal)
    : null;
}

function exclusionReason(reason) {
  const known = {
    arrival: "Arrival timing",
    arrival_time: "Arrival timing",
    fasting: "Fasting preference",
    fasting_preference: "Fasting preference",
    manual: "Removed manually",
    manual_override: "Removed manually",
  };
  if (known[reason]) return known[reason];
  const text = String(reason || "Not scheduled for this meal").replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function signedCount(value) {
  const number = Number(value || 0);
  return number > 0 ? `+${number}` : String(number).replace("-", "−");
}

function displayDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "Date not recorded";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function displayAnswerTime(value) {
  const instant = Date.parse(value || "");
  if (!Number.isFinite(instant)) return "";
  return new Date(instant).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function Kitchen({
  guests = [],
  meals = null,
  toast = () => {},
  sheetMode = false,
  readOnly = false,
  isAdmin = false,
  saving = false,
  onSaveMealOverride = async () => {},
  onSaveMealPlan = async () => {},
  onSaveMealSettings = async () => {},
}) {
  const [planningDate, setPlanningDate] = useState(() => dateISO());
  const [selectedMeal, setSelectedMeal] = useState("lunch");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = meals?.settings || { teamEditingEnabled: true, automaticQuestionsEnabled: false, revision: "" };

  return (
    <div className="kit-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Yogi Prasad</h1>
          <p className="page-description">Plan your Yogi Prasad headcount, one day at a time.</p>
        </div>
        {sheetMode && isAdmin && (
          <button type="button" className="button secondary kit-settings-button" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={16} /> Meal settings
          </button>
        )}
      </header>
      <DaySelector value={planningDate} onChange={setPlanningDate} />
      <DailyKitchenPlan
        key={planningDate}
        day={planningDate}
        guests={guests}
        meals={meals}
        selected={selectedMeal}
        setSelected={setSelectedMeal}
        toast={toast}
        sheetMode={sheetMode}
        readOnly={readOnly}
        isAdmin={isAdmin}
        saving={saving}
        onSaveMealOverride={onSaveMealOverride}
        onSaveMealPlan={onSaveMealPlan}
      />
      {settingsOpen && sheetMode && isAdmin && (
        <MealSettingsSheet
          settings={settings}
          survey={meals?.survey || {}}
          saving={saving}
          toast={toast}
          onSave={onSaveMealSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function MealSettingsSheet({ settings, survey, saving, toast, onSave, onClose }) {
  const [error, setError] = useState("");
  const responses = Array.isArray(survey.responses) ? survey.responses : [];
  const invitations = survey.invitations && typeof survey.invitations === "object" ? survey.invitations : {};
  const stats = [
    ["Eligible families", survey.families],
    ["Awaiting reply", invitations.accepted],
    ["Questions answered", invitations.answered],
    ["Needs review", invitations.review],
  ].filter(([, value]) => Number.isFinite(Number(value)));

  async function updateSetting(key, checked) {
    setError("");
    const next = { ...settings, [key]: checked };
    try {
      await onSave(Boolean(next.teamEditingEnabled), Boolean(next.automaticQuestionsEnabled), settings.revision || "");
      toast(key === "teamEditingEnabled"
        ? `Shared meal editing ${checked ? "enabled" : "disabled"}.`
        : `Automatic WhatsApp questions ${checked ? "enabled" : "disabled"}.`);
    } catch (failure) {
      setError(failure.message || "The meal setting could not be saved.");
    }
  }

  return (
    <Sheet title="Yogi Prasad settings" subtitle="Control shared meal editing and registrant questions." onClose={onClose}>
      <div className="kit-settings-sheet">
        <label className="kit-setting-row">
          <span className="kit-setting-icon"><ShieldCheck size={19} /></span>
          <span>
            <strong>Allow everyone to edit dining lists</strong>
            <small>Anyone with a dashboard link may change dining counts and add, remove or restore names. Other assignments require admin access.</small>
          </span>
          <input
            type="checkbox"
            checked={Boolean(settings.teamEditingEnabled)}
            disabled={saving}
            onChange={(event) => updateSetting("teamEditingEnabled", event.target.checked)}
            aria-label="Allow everyone to edit dining lists"
          />
        </label>
        <label className="kit-setting-row">
          <span className="kit-setting-icon"><MessageCircle size={19} /></span>
          <span>
            <strong>Automatic WhatsApp questions</strong>
            <small>Send one arrival-time and fasting questionnaire per manual family. The response applies to everyone in that family registration.</small>
            {survey.configured === false && <small className="kit-setting-warning">WhatsApp templates and reply verification must be configured before this can be enabled.</small>}
            {settings.automaticQuestionsEnabled && survey.templates?.status && survey.templates.status !== "approved" && <small className="kit-setting-warning">{survey.templates.status === "unavailable" ? "Template approval could not be checked. Sending is paused and will retry automatically." : "Waiting for WhatsApp to approve both message templates. Questions will start automatically once approved."}</small>}
          </span>
          <input
            type="checkbox"
            checked={Boolean(settings.automaticQuestionsEnabled)}
            disabled={saving || survey.configured === false}
            onChange={(event) => updateSetting("automaticQuestionsEnabled", event.target.checked)}
            aria-label="Send automatic WhatsApp meal questions"
          />
        </label>
        <section className="kit-survey-status" aria-labelledby="kit-survey-status-title">
          <h3 id="kit-survey-status-title">Family response status</h3>
          <p>One answer covers the family sharing a WhatsApp number and arrival date. The log shows the answer applied to each attendee.</p>
          {stats.length ? (
            <dl>
              {stats.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{Number(value).toLocaleString()}</dd></div>
              ))}
            </dl>
          ) : <p>No registrant-question activity has been recorded yet.</p>}
          {responses.length > 0 && (
            <div className="kit-response-log">
              <h4>Registrant response log</h4>
              <div className="kit-response-table-wrap">
                <table>
                  <thead><tr><th>Attendee</th><th>Arrival</th><th>Chaturmas fasting</th></tr></thead>
                  <tbody>
                    {responses.map((response, index) => (
                      <tr key={response.identity || index}>
                        <th scope="row">
                          {response.name || "Name not provided"}
                          <small>{displayDate(response.arrivalDate)}</small>
                        </th>
                        <td>
                          {ARRIVAL_LABELS[response.arrival] || "Awaiting answer"}
                          {response.arrivalAnsweredAt && <small>{displayAnswerTime(response.arrivalAnsweredAt)}</small>}
                        </td>
                        <td>
                          {FASTING_LABELS[response.fasting] || "Awaiting answer"}
                          {response.fastingAnsweredAt && <small>{displayAnswerTime(response.fastingAnsweredAt)}</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
        {error && <p className="kit-form-error" role="alert">{error}</p>}
      </div>
    </Sheet>
  );
}

function DailyKitchenPlan({
  day,
  guests,
  meals,
  selected,
  setSelected,
  toast,
  sheetMode,
  readOnly,
  isAdmin,
  saving,
  onSaveMealOverride,
  onSaveMealPlan,
}) {
  // Production plans are shared. Demo plans use a new local key so legacy
  // volunteers/walk-in values are never silently treated as shared adjustments.
  const [localPlans, setLocalPlans] = useLocalStorage(`seva-kitchen-plans-v2-${day}`, () => defaultPlans(day, false), !sheetMode);
  const [localOverrides, setLocalOverrides] = useLocalStorage(`seva-kitchen-meal-overrides-v1-${day}`, {}, !sheetMode);
  const [draft, setDraft] = useState(null);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const plans = useMemo(() => {
    const defaults = defaultPlans(day, sheetMode);
    return Object.fromEntries(MEALS.map((meal) => {
      const shared = meals?.plans?.find((candidate) => candidate.day === day && candidate.meal === meal.id);
      return [meal.id, normalizedPlan(sheetMode ? shared : localPlans?.[meal.id], defaults[meal.id])];
    }));
  }, [day, sheetMode, meals?.plans, localPlans]);
  const forecastGuests = useMemo(() => {
    if (sheetMode) return guests;
    return guests.map((guest) => {
      const identity = guestIdentity(guest);
      const overrides = Object.entries(localOverrides?.[identity] || {})
        .filter(([, included]) => typeof included === "boolean")
        .map(([meal, included]) => ({ day, meal, included, revision: "" }));
      return {
        ...guest,
        mealOverrides: [...(guest.mealOverrides || []).filter((override) => override.day !== day), ...overrides],
      };
    });
  }, [guests, localOverrides, day, sheetMode]);
  const meal = MEALS.find((item) => item.id === selected);
  const plan = plans[selected];
  const undatedGuests = forecastGuests.filter((guest) => guest.sourceIdentity && guest.status !== "Cancelled" && (!guest.arrivalDate || !guest.departureDate)).length;
  const forecasts = useMemo(() => Object.fromEntries(MEALS.map((item) => [
    item.id,
    getForecast(forecastGuests, item, plans[item.id], day),
  ])), [forecastGuests, plans, day]);
  const forecast = forecasts[selected];
  const diners = Array.isArray(forecast.diners) ? forecast.diners : [];
  const excluded = Array.isArray(forecast.excluded)
    ? forecast.excluded.filter(({ reason }) => ["arrival", "fasting", "manual"].includes(reason))
    : [];
  const MealIcon = meal.icon;
  const formattedDate = new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  function openAdjustments() {
    if (readOnly) return;
    setDraft({ expected: forecast.expected, buffer: plan.buffer });
    setFormError("");
  }

  async function saveAdjustments(event) {
    event.preventDefault();
    if (readOnly || saving) return;
    const expected = Number(draft.expected);
    const buffer = Number(draft.buffer);
    if (!Number.isInteger(expected) || expected < 0 || expected > 5000 || !Number.isInteger(buffer) || buffer < 0 || buffer > 50) {
      setFormError("Enter a whole dining count up to 5,000 and a buffer between 0% and 50%.");
      return;
    }
    const adjustment = expected - forecast.guests;
    setFormError("");
    try {
      if (sheetMode) await onSaveMealPlan(day, selected, adjustment, buffer, plan.revision || "");
      else setLocalPlans((current) => ({ ...current, [selected]: { adjustment, buffer, revision: "" } }));
      toast(`${meal.name} dining count updated for ${formattedDate}.`);
      setDraft(null);
    } catch (failure) {
      setFormError(failure.message || "The dining count could not be saved.");
    }
  }

  async function saveOverride(guest, included) {
    if (readOnly || saving) return;
    const identity = guestIdentity(guest);
    if (!identity) {
      setActionError("This attendee does not have a stable roster identity.");
      return;
    }
    const current = mealOverrideFor(guest, day, selected);
    setActionError("");
    try {
      if (sheetMode) await onSaveMealOverride(identity, day, selected, included, current?.revision || "");
      else {
        setLocalOverrides((stored) => {
          const next = { ...stored, [identity]: { ...(stored?.[identity] || {}) } };
          if (included === null) delete next[identity][selected];
          else next[identity][selected] = included;
          if (!Object.keys(next[identity]).length) delete next[identity];
          return next;
        });
      }
      const name = guest.name || "Attendee";
      const action = included === false ? "removed from" : included === true ? "added to" : "restored to automatic planning for";
      toast(`${name} ${action} ${meal.name.toLowerCase()} on ${formattedDate}.`);
    } catch (failure) {
      setActionError(failure.message || "The dining-list change could not be saved.");
    }
  }

  return (
    <>
      {undatedGuests > 0 && <p className="sheet-data-note" role="status">{undatedGuests} attendees are excluded from meal forecasts because arrival or departure dates are missing. Complete those dates in the source sheet.</p>}
      <div className="kit-plan-toolbar">
        <span className="kit-roster-note"><span />{sheetMode
          ? readOnly
            ? "Connected to shared guest and meal records"
            : isAdmin
              ? "Shared meal editing · Admin"
              : "Shared dining-list editing enabled for everyone"
          : "Demo meal plan saved on this device"}</span>
      </div>
      <div className="kit-meals" role="group" aria-label="Choose a meal">
        {MEALS.map((item) => {
          const Icon = item.icon;
          return (
            <button type="button" key={item.id} className={`kit-meal-card ${selected === item.id ? "is-selected" : ""}`} onClick={() => setSelected(item.id)} aria-pressed={selected === item.id}>
              <span className="kit-meal-name"><Icon size={18} />{item.name}</span>
              <span className="kit-meal-time">{item.time}</span>
              <span className="kit-meal-bottom">
                <span className="kit-meal-count">{forecasts[item.id].expected.toLocaleString()}<small>expected</small></span>
                <span className="kit-meal-arrow"><ArrowRight size={18} /></span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="kit-layout">
        <section className="card kit-service-card" aria-labelledby="kit-service-title">
          <div className="kit-service-heading">
            <div className="kit-service-title">
              <span className="kit-section-icon"><MealIcon size={21} /></span>
              <div><h2 id="kit-service-title">{meal.name} service</h2><p>{meal.time}</p></div>
            </div>
            <span className="kit-detail-date">{new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          </div>
          <div className="kit-headcount-main">
            <div>
              <p className="kit-label">EXPECTED HEADCOUNT</p>
              <div className="kit-big-number">{forecast.expected.toLocaleString()}<span>guests</span></div>
              {plan.adjustment !== 0 && <p className="kit-manual-adjustment">{sheetMode ? "Shared" : "Demo"} manual count adjustment: <strong>{signedCount(plan.adjustment)}</strong></p>}
            </div>
            <div className="kit-prepare-target">
              <ChefHat size={20} />
              <span>Prepare for<strong>{forecast.target.toLocaleString()} plates</strong></span>
              <small>Includes {plan.buffer}% buffer</small>
            </div>
          </div>
          <div className="kit-diners">
            <h3>Dining guests</h3>
            {diners.length ? (
              <ul className="kit-diner-list" aria-label={`${meal.name} diners`}>
                {diners.map((guest, index) => (
                  <li className="kit-person-row" key={guestIdentity(guest) || index}>
                    <span className="kit-person-copy">
                      <span className="kit-diner-name">{guest.name || "Name not provided"}</span>
                      {guest.city && <span className="kit-diner-location"> ({guest.city})</span>}
                    </span>
                    {!readOnly && guestIdentity(guest) && guest.sourceWritable !== false && (
                      <button
                        type="button"
                        className="kit-person-action danger"
                        disabled={saving}
                        onClick={() => saveOverride(guest, false)}
                        aria-label={`Remove ${guest.name || "attendee"} from ${meal.name.toLowerCase()} on ${formattedDate}`}
                        title="Remove from this meal"
                      ><Minus size={15} aria-hidden="true" /></button>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="kit-diners-empty">No guests scheduled for this meal.</p>}
            {forecast.expected > forecast.guests && <p className="kit-diners-empty">{forecast.expected - forecast.guests} additional diners have no names recorded.</p>}
            {forecast.expected < forecast.guests && <p className="kit-diners-empty">The manual count adjustment lowers the total by {forecast.guests - forecast.expected} without removing specific names.</p>}
          </div>
          {excluded.length > 0 && (
            <div className="kit-excluded">
              <h3>Not counted for this meal</h3>
              <ul aria-label={`Guests not counted for ${meal.name.toLowerCase()}`}>
                {excluded.map(({ guest, reason }, index) => {
                  const override = mealOverrideFor(guest, day, selected);
                  const manuallyRemoved = override?.included === false;
                  const label = manuallyRemoved
                    ? `Restore automatic planning for ${guest.name || "attendee"} on ${formattedDate}`
                    : `Add ${guest.name || "attendee"} to ${meal.name.toLowerCase()} on ${formattedDate}`;
                  return (
                    <li className="kit-person-row" key={guestIdentity(guest) || index}>
                      <span className="kit-person-copy">
                        <span className="kit-diner-name">{guest.name || "Name not provided"}</span>
                        {guest.city && <span className="kit-diner-location"> ({guest.city})</span>}
                        <small>{exclusionReason(reason)}</small>
                      </span>
                      {!readOnly && guestIdentity(guest) && guest.sourceWritable !== false && (
                        <button
                          type="button"
                          className={`kit-person-action ${manuallyRemoved ? "reset" : "add"}`}
                          disabled={saving}
                          onClick={() => saveOverride(guest, manuallyRemoved ? null : true)}
                          aria-label={label}
                        >
                          {manuallyRemoved ? <RotateCcw size={14} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
                          <span>{manuallyRemoved ? "Restore" : "Add"}</span>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {actionError && <p className="kit-form-error kit-action-error" role="alert">{actionError}</p>}
          {!readOnly && (
            <p className="kit-estimate-note"><Info size={14} /><span>{sheetMode ? "Dining-list and count changes are shared across the Yogi Prasad workspace." : "Demo headcount adjustments are saved on this device."}</span></p>
          )}
          {!readOnly && (
            <div className="kit-service-actions">
              <button className="button secondary" onClick={openAdjustments} disabled={saving}><Settings2 size={16} /> Adjust dining count</button>
            </div>
          )}
        </section>
      </div>
      {draft && !readOnly && (
        <Sheet title={`Adjust ${meal.name.toLowerCase()} count`} subtitle={`${formattedDate} · Set the shared expected dining count.`} onClose={() => { if (!saving) setDraft(null); }}>
          <form onSubmit={saveAdjustments} className="kit-sheet-form">
            <div className="kit-roster-summary">
              <Users size={20} />
              <span>Roster after preferences and named changes<strong>{forecast.guests} people</strong></span>
              <span className="badge green">Automatic</span>
            </div>
            <label className="field">
              <span>Dining count</span>
              <input type="number" min="0" max="5000" step="1" inputMode="numeric" required value={draft.expected} onChange={(event) => setDraft({ ...draft, expected: event.target.value })} />
              <small>This creates a {sheetMode ? "shared " : ""}manual adjustment relative to the roster count above.</small>
            </label>
            <label className="field">
              <span>Extra preparation buffer (%)</span>
              <input type="number" min="0" max="50" step="1" inputMode="numeric" required value={draft.buffer} onChange={(event) => setDraft({ ...draft, buffer: event.target.value })} />
              <small>Extra portions to keep the day running smoothly.</small>
            </label>
            {formError && <p className="kit-form-error" role="alert">{formError}</p>}
            <div className="kit-form-actions">
              <button type="button" className="button secondary" onClick={() => setDraft(null)} disabled={saving}>Cancel</button>
              <button className="button primary" type="submit" disabled={saving}><Check size={16} />{saving ? "Saving…" : "Save dining count"}</button>
            </div>
          </form>
        </Sheet>
      )}
    </>
  );
}
