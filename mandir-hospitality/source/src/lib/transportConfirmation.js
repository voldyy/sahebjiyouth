const driverKey = name => String(name || "").trim().toLowerCase();
export const driverNames = plan => [plan.driver, ...(plan.additionalDrivers || []).map(pair => pair.driver)].filter(Boolean);

export function readDriverConfirmations(value) {
  const confirmations = JSON.parse(value || "{}");
  if (!confirmations || typeof confirmations !== "object" || Array.isArray(confirmations) || Object.entries(confirmations).some(([name, token]) => !name || name !== driverKey(name) || typeof token !== "string" || !/^(?:legacy|[a-zA-Z0-9-]{20,80})$/.test(token))) throw new Error("Invalid driver confirmations. Review Transport Confirmations.");
  return confirmations;
}

// Existing assignments retain their confirmation and message identities at rollout.
// Every new save stores an explicit map, including an empty map for draft drivers.
export function driverConfirmationsFor(plan = {}) {
  return plan.driverConfirmations === undefined
    ? Object.fromEntries(driverNames(plan).map(name => [driverKey(name), "legacy"]))
    : plan.driverConfirmations;
}
export function driverConfirmation(plan, name) {
  const confirmations = driverConfirmationsFor(plan);
  return Object.hasOwn(confirmations, driverKey(name)) ? confirmations[driverKey(name)] : "";
}
