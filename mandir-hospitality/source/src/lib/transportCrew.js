// Keep the original driver/vehicle fields for existing trips and integrations.
export const crewForPlan = (plan = {}) => [
  { driver: plan.driver || "", vehicle: plan.vehicle || "" },
  ...(plan.additionalDrivers || []),
];

export function readAdditionalDrivers(value) {
  if (!value) return [];
  const crew = JSON.parse(value);
  if (!Array.isArray(crew) || crew.some(pair => !pair || typeof pair.driver !== "string" || typeof pair.vehicle !== "string")) throw new Error("Invalid additional driver assignments. Review Transport Crew.");
  return crew;
}

// Secondary notification identities remain stable when another driver is removed.
// The original journey keeps its existing notification state and deduplication.
export function tripsForCrew(groups) {
  return groups.flatMap(group => {
    const crew = crewForPlan(group.plan);
    return crew.map((pair, index) => ({
      ...group,
      ...(index ? { id: JSON.stringify([group.id, "driver", pair.driver.toLowerCase()]), sourceTripId: group.id } : {}),
      crew,
      secondaryDriver: index > 0,
      plan: { ...group.plan, ...pair },
    })).filter((g, index) => index === 0 || g.plan.driver);
  });
}
