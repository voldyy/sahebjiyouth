import { requestAccessKey } from "./access";
import { sheetRequest } from "./appsScript";

// An explicit empty override is reserved for migration rollback and legacy tests.
const API = import.meta.env.VITE_WORKSPACE_API_URL ?? "https://mandir-hospitality-api.usayouth.workers.dev/api";
export const usesDatabase = Boolean(API);

export async function workspaceRequest(request) {
  if (!API) return sheetRequest(request);
  const body = JSON.stringify({ ...request, accessKey: requestAccessKey() });
  const retryable = Boolean(request.requestId) || ["snapshot", "trip-display-read"].includes(request.action);
  // Retries reuse the same request ID. The database commits a receipt alongside
  // each change, so a lost response cannot duplicate a guest or an assignment.
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body, cache: "no-store", signal: AbortSignal.timeout(["flight", "accommodation-notifications"].includes(request.action) ? 45000 : 12000) });
    } catch (_) {
      if (!attempt && retryable) continue;
      throw new Error("The dashboard could not confirm this request. Refresh before retrying; your change may already be saved.");
    }
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "The dashboard could not complete this request.");
    return result;
  }
}
