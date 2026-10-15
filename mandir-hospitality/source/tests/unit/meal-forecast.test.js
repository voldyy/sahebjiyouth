import test from "node:test";
import assert from "node:assert/strict";
import {
  MEAL_CUTOFFS,
  getForecast,
  hasMealStay,
  mealEligible,
  rosterMealCounts,
} from "../../src/lib/mealForecast.js";

const DAY = "2026-10-18";
const MEALS = Object.fromEntries(Object.entries(MEAL_CUTOFFS).map(([id, cutoff]) => [id, { id, cutoff }]));

function guest(values = {}) {
  return {
    sourceIdentity: "guest-1",
    name: "Test Guest",
    count: 1,
    status: "Registered",
    arrivalDate: DAY,
    arrivalTime: "09:00",
    departureDate: "2026-10-20",
    stay: "Overnight",
    mealPreference: { arrival: "", arrivalDate: "", fasting: "" },
    mealOverrides: [],
    ...values,
  };
}

const eligibleMeals = (value, day = DAY) => Object.keys(MEALS).filter((id) => mealEligible(value, MEALS[id], day));

test("legacy arrival cutoffs remain exclusive and later stay days receive every meal", () => {
  assert.deepEqual(eligibleMeals(guest({ arrivalTime: "10:59" })), ["breakfast", "lunch", "dinner"]);
  assert.deepEqual(eligibleMeals(guest({ arrivalTime: "11:00" })), ["lunch", "dinner"]);
  assert.deepEqual(eligibleMeals(guest({ arrivalTime: "14:59" })), ["lunch", "dinner"]);
  assert.deepEqual(eligibleMeals(guest({ arrivalTime: "15:00" })), ["dinner"]);
  assert.deepEqual(eligibleMeals(guest({ arrivalTime: "23:59" })), ["dinner"]);
  assert.deepEqual(eligibleMeals(guest({ arrivalDate: "2026-10-17", arrivalTime: "23:59" })), ["breakfast", "lunch", "dinner"]);
});

test("arrival and fasting answers form the complete intersection matrix", () => {
  const matrix = {
    morning: {
      no: ["breakfast", "lunch", "dinner"],
      lunch: ["lunch"],
      dinner: ["dinner"],
    },
    before_noon: {
      no: ["lunch", "dinner"],
      lunch: ["lunch"],
      dinner: ["dinner"],
    },
    before_evening: {
      no: ["dinner"],
      lunch: [],
      dinner: ["dinner"],
    },
  };
  for (const [arrival, fasts] of Object.entries(matrix)) {
    for (const [fasting, expected] of Object.entries(fasts)) {
      const value = guest({
        arrivalTime: "16:00",
        mealPreference: { arrival, arrivalDate: DAY, fasting },
      });
      assert.deepEqual(eligibleMeals(value), expected, `${arrival} + ${fasting}`);
    }
  }
});

test("arrival answers override source time only on the matching current arrival date", () => {
  const morning = guest({
    arrivalTime: "16:00",
    mealPreference: { arrival: "morning", arrivalDate: DAY, fasting: "no" },
  });
  assert.deepEqual(eligibleMeals(morning), ["breakfast", "lunch", "dinner"]);

  const later = guest({
    arrivalTime: "09:00",
    mealPreference: { arrival: "before_evening", arrivalDate: DAY, fasting: "no" },
  });
  assert.deepEqual(eligibleMeals(later), ["dinner"]);
  assert.deepEqual(eligibleMeals(later, "2026-10-19"), ["breakfast", "lunch", "dinner"]);

  const stale = guest({
    arrivalTime: "15:00",
    mealPreference: { arrival: "morning", arrivalDate: "2026-10-17", fasting: "no" },
  });
  assert.deepEqual(eligibleMeals(stale), ["dinner"]);
});

test("fasting applies across the entire inclusive stay", () => {
  const lunchOnly = guest({
    mealPreference: { arrival: "morning", arrivalDate: DAY, fasting: "lunch" },
  });
  assert.deepEqual(eligibleMeals(lunchOnly, DAY), ["lunch"]);
  assert.deepEqual(eligibleMeals(lunchOnly, "2026-10-19"), ["lunch"]);
  assert.deepEqual(eligibleMeals(lunchOnly, "2026-10-20"), ["lunch"]);
  assert.deepEqual(eligibleMeals(lunchOnly, "2026-10-21"), []);
});

test("date-specific overrides supersede automatic rules but never active stay gates", () => {
  const automaticallyExcluded = guest({
    arrivalTime: "16:00",
    mealPreference: { arrival: "before_evening", arrivalDate: DAY, fasting: "dinner" },
    mealOverrides: [{ day: DAY, meal: "breakfast", included: true, revision: "1" }],
  });
  assert.equal(mealEligible(automaticallyExcluded, MEALS.breakfast, DAY), true);

  const manuallyExcluded = guest({
    mealOverrides: [{ day: DAY, meal: "breakfast", included: false, revision: "1" }],
  });
  assert.equal(mealEligible(manuallyExcluded, MEALS.breakfast, DAY), false);
  assert.equal(mealEligible(manuallyExcluded, MEALS.lunch, DAY), true);
  assert.equal(mealEligible(manuallyExcluded, MEALS.breakfast, "2026-10-19"), true);

  const latestWins = guest({
    mealOverrides: [
      { day: DAY, meal: "breakfast", included: false, revision: "1" },
      { day: DAY, meal: "breakfast", included: true, revision: "2" },
    ],
  });
  assert.equal(mealEligible(latestWins, MEALS.breakfast, DAY), true);

  for (const values of [
    { status: "Cancelled" },
    { status: "Departed" },
    { arrivalDate: "", departureDate: "" },
    { arrivalDate: "2026-10-19" },
    { departureDate: "2026-10-17" },
    { stay: "Day visitor", arrivalDate: "2026-10-17" },
  ]) {
    const value = guest({
      ...values,
      mealOverrides: [{ day: DAY, meal: "breakfast", included: true, revision: "1" }],
    });
    assert.equal(mealEligible(value, MEALS.breakfast, DAY), false, JSON.stringify(values));
    assert.equal(hasMealStay(value, DAY), false, JSON.stringify(values));
  }
});

test("unknown preference values safely preserve the normal source-time rules", () => {
  const value = guest({
    arrivalTime: "11:00",
    mealPreference: { arrival: "unexpected", arrivalDate: DAY, fasting: "unexpected" },
  });
  assert.deepEqual(eligibleMeals(value), ["lunch", "dinner"]);
});

test("forecast exposes matching diners and exclusions with deterministic reasons", () => {
  const guests = [
    guest({ sourceIdentity: "b", name: "Beta" }),
    guest({ sourceIdentity: "a", name: "Alpha" }),
    guest({ sourceIdentity: "manual", name: "Manual", mealOverrides: [{ day: DAY, meal: "breakfast", included: false, revision: "1" }] }),
    guest({ sourceIdentity: "fasting", name: "Fasting", mealPreference: { arrival: "morning", arrivalDate: DAY, fasting: "lunch" } }),
    guest({ sourceIdentity: "cancelled", name: "Cancelled", status: "Cancelled" }),
  ];
  const forecast = getForecast(guests, MEALS.breakfast, {}, DAY);
  assert.equal(forecast.guests, 2);
  assert.deepEqual(forecast.diners.map((value) => value.name), ["Alpha", "Beta"]);
  assert.deepEqual(forecast.excluded.map(({ guest: value, reason }) => [value.name, reason]), [
    ["Manual", "manual"],
    ["Fasting", "fasting"],
    ["Cancelled", "inactive"],
  ]);
});

test("signed adjustments replace legacy extras, clamp at zero, and never include buffer in expected", () => {
  const diners = [guest({ sourceIdentity: "one" }), guest({ sourceIdentity: "two" })];
  assert.deepEqual(getForecast(diners, MEALS.breakfast, { volunteers: 2, visitors: 3, buffer: 10 }, DAY), {
    guests: 2,
    diners,
    excluded: [],
    expected: 7,
    bufferCount: 1,
    target: 8,
  });
  const adjusted = getForecast(diners, MEALS.breakfast, { adjustment: 3, volunteers: 100, visitors: 100, buffer: 50 }, DAY);
  assert.equal(adjusted.expected, 5);
  assert.equal(adjusted.bufferCount, 3);
  assert.equal(adjusted.target, 8);
  assert.equal(getForecast(diners, MEALS.breakfast, { adjustment: -10 }, DAY).expected, 0);
});

test("roster counts infer meal IDs, apply per-meal plans, and report expected without buffer", () => {
  const value = guest({
    arrivalTime: "16:00",
    mealPreference: { arrival: "before_noon", arrivalDate: DAY, fasting: "no" },
  });
  assert.equal(getForecast([value], { cutoff: MEAL_CUTOFFS.breakfast }, {}, DAY).guests, 0);
  assert.deepEqual(rosterMealCounts([value], DAY, {
    breakfast: { adjustment: 4, buffer: 50 },
    lunch: { adjustment: 2, buffer: 50 },
    dinner: { volunteers: 1, visitors: 1, buffer: 50 },
  }), { breakfast: 4, lunch: 3, dinner: 3 });
});
