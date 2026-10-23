// Shared by the Yogi Prasad dashboard and its nightly WhatsApp notification.
export const MEAL_CUTOFFS = { breakfast: 11 * 60, lunch: 15 * 60, dinner: 24 * 60 };

const MEALS = Object.keys(MEAL_CUTOFFS);
const ARRIVAL_MEALS = {
  morning: new Set(MEALS),
  before_noon: new Set(["lunch", "dinner"]),
  before_evening: new Set(["dinner"]),
};
const FASTING_MEALS = {
  no: new Set(MEALS),
  lunch: new Set(["lunch"]),
  dinner: new Set(["dinner"]),
};

function arrivalMinutes(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return 0;
  let hours = Number(match[1]);
  if (match[3]) hours = (hours % 12) + (match[3].toUpperCase() === "PM" ? 12 : 0);
  return hours * 60 + Number(match[2]);
}

function mealId(meal) {
  const named = String(meal?.id || meal?.name || "").toLowerCase();
  if (MEALS.includes(named)) return named;
  return MEALS.find((name) => MEAL_CUTOFFS[name] === Number(meal?.cutoff)) || "";
}

function mealStayReason(guest, day) {
  if (["Departed", "Cancelled"].includes(guest.status)) return "inactive";
  if (!guest.arrivalDate || !guest.departureDate) return "missing_stay";
  if (guest.arrivalDate > day) return "before_arrival";
  if (guest.departureDate < day) return "after_departure";
  if (guest.stay === "Day visitor" && guest.arrivalDate !== day) return "day_visitor";
  return "";
}

// The backend uses this before accepting a date-specific meal override. Status,
// complete stay dates and the inclusive meal-stay range can never be overridden.
export function hasMealStay(guest, day) {
  return mealStayReason(guest, day) === "";
}

function currentOverride(guest, day, id) {
  const matches = (guest.mealOverrides || []).filter((override) =>
    override?.day === day && override?.meal === id && typeof override.included === "boolean"
  );
  return matches.at(-1);
}

function automaticMealReason(guest, meal, day, id) {
  // Local mandal registrations list the days they chose for each meal; everything else is simply not attended.
  if (guest.localMealDays && !(guest.localMealDays[id] || []).includes(day)) return "not_selected";
  if (Array.isArray(guest.localDays) && !guest.localDays.includes(day)) return "not_selected";
  if (Array.isArray(guest.localMeals) && !guest.localMeals.includes(id)) return "not_selected";
  if (day === guest.arrivalDate) {
    const preference = guest.mealPreference || {};
    const selected = preference.arrivalDate === guest.arrivalDate ? ARRIVAL_MEALS[preference.arrival] : null;
    if (selected ? !selected.has(id) : arrivalMinutes(guest.arrivalTime) >= Number(meal.cutoff)) return "arrival";
  }
  const fasting = FASTING_MEALS[guest.mealPreference?.fasting];
  if (fasting && !fasting.has(id)) return "fasting";
  return "";
}

function eligibility(guest, meal, day) {
  const baseReason = mealStayReason(guest, day);
  if (baseReason) return { included: false, reason: baseReason };
  const id = mealId(meal);
  const override = currentOverride(guest, day, id);
  if (override?.included === false) return { included: false, reason: "manual" };
  if (override?.included === true) return { included: true, reason: "" };
  const reason = automaticMealReason(guest, meal, day, id);
  return { included: !reason, reason };
}

export function mealEligible(guest, meal, day) {
  return eligibility(guest, meal, day).included;
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

export function getForecast(guests, meal, plan = {}, day) {
  const diners = [];
  const excluded = [];
  for (const guest of guests) {
    const result = eligibility(guest, meal, day);
    if (result.included) diners.push(guest);
    else excluded.push({ guest, reason: result.reason });
  }
  diners.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const guestCount = diners.reduce((sum, guest) => sum + number(guest.count || 1), 0);
  const hasAdjustment = Object.prototype.hasOwnProperty.call(plan, "adjustment");
  const adjustment = hasAdjustment ? number(plan.adjustment) : number(plan.volunteers) + number(plan.visitors);
  const expected = Math.max(0, guestCount + adjustment);
  const bufferCount = Math.ceil((expected * number(plan.buffer)) / 100);
  return {
    guests: guestCount,
    diners,
    excluded,
    expected,
    bufferCount,
    target: expected + bufferCount,
  };
}

export function rosterMealCounts(guests, day, plans = {}) {
  return Object.fromEntries(Object.entries(MEAL_CUTOFFS).map(([name, cutoff]) => [
    name,
    getForecast(guests, { id: name, cutoff }, plans[name] || {}, day).expected,
  ]));
}
