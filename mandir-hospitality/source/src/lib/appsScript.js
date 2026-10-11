import { requestAccessKey } from "./access";
// Apps Script HTML service handles the authenticated Sheets calls inside its own
// frame. The public website uses a nonce-bound postMessage channel, not no-cors
// fetch (which cannot confirm a save). This channel is not an access credential.
const ENDPOINT =
  import.meta.env.VITE_APPS_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbxYBR2sIywbufmytSNLiQvGRy2oYg_tsMTEqdUj855z1LX8OJcDf6rTI0gR14kzdzpGog/exec";
let connection;
export function createAppsScriptClient(endpoint = ENDPOINT) {
  const pending = new Map();
  let frame, peer, peerOrigin, resolveReady, rejectReady, timer;
  const channel = crypto.randomUUID();
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => {});
  const receive = (event) => {
    const data = event.data;
    if (
      !data ||
      data.service !== "mandir-hospitality" ||
      data.channel !== channel
    )
      return;
    let origin;
    try {
      origin = new URL(event.origin);
    } catch {
      return;
    }
    if (
      origin.protocol !== "https:" ||
      !(
        origin.hostname === "script.google.com" ||
        origin.hostname.endsWith(".googleusercontent.com")
      )
    )
      return;
    if (data.ready && !peer) {
      peer = event.source;
      peerOrigin = event.origin;
      clearTimeout(timer);
      resolveReady();
      return;
    }
    if (
      event.source !== peer ||
      event.origin !== peerOrigin ||
      !pending.has(data.id)
    )
      return;
    const task = pending.get(data.id);
    pending.delete(data.id);
    clearTimeout(task.timer);
    if (data.result?.ok) task.resolve(data.result);
    else
      task.reject(
        new Error(
          data.result?.error || "Google could not complete this request.",
        ),
      );
  };
  window.addEventListener("message", receive);
  if (
    !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint)
  )
    rejectReady(
      new Error("The shared sheet connection has not been configured."),
    );
  else {
    frame = document.createElement("iframe");
    frame.title = "Shared Google Sheets connection";
    frame.hidden = true;
    frame.src = `${endpoint}?${new URLSearchParams({ origin: location.origin, channel })}`;
    timer = setTimeout(
      () =>
        rejectReady(
          new Error(
            "The shared sheet connection did not respond. Refresh to reconnect.",
          ),
        ),
      30000,
    );
    document.body.appendChild(frame);
  }
  return {
    async request(request) {
      await ready;
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(
            new Error(
              "Google did not confirm the request. Refresh before retrying; a save may already have reached the sheet.",
            ),
          );
        }, 45000);
        pending.set(id, { resolve, reject, timer: timeout });
        peer.postMessage(
          { service: "mandir-hospitality", channel, id, request },
          peerOrigin,
        );
      });
    },
    get connected() {
      return !!peer;
    },
    dispose() {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      frame?.remove();
      pending.forEach((p) => {
        clearTimeout(p.timer);
        p.reject(new Error("Connection closed."));
      });
      pending.clear();
    },
  };
}
export function sheetRequest(request) {
  if (!connection) connection = createAppsScriptClient();
  const current = connection;
  return current.request({ ...request, accessKey: requestAccessKey() }).catch((error) => {
    if (!current.connected && connection === current) {
      current.dispose();
      connection = null;
    }
    throw error;
  });
}
