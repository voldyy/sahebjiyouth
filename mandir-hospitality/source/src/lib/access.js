const storageKey = "mandir.admin-access.v1";
let accessKey = "";
let forcedTeam = false;
try { accessKey = sessionStorage.getItem(storageKey) || ""; } catch { /* Session storage is optional. */ }
function readLink() {
  const before = requestAccessKey();
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const supplied = params.get("admin");
  if (params.get("team") === "yogi-prasad") forcedTeam = true;
  else if (supplied) forcedTeam = false;
  if (supplied) {
    accessKey = supplied;
    try { sessionStorage.setItem(storageKey, supplied); } catch { /* Keep access in memory for this tab. */ }
    params.delete("admin");
    history.replaceState(null, "", `${location.pathname}${location.search}${location.hash.split("?")[0]}${params.size ? `?${params}` : ""}`);
  }
  return before !== requestAccessKey();
}
export function requestAccessKey() { return forcedTeam ? "" : accessKey; }
export function isTeamView() { return forcedTeam; }
readLink();
window.addEventListener("hashchange", () => {
  if (readLink()) window.dispatchEvent(new Event("mandir-access-change"));
});
export function yogiPrasadLink() {
  return `${location.origin}${location.pathname}#kitchen?team=yogi-prasad`;
}
