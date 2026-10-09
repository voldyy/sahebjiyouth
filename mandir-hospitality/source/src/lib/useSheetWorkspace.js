import { useCallback, useEffect, useRef, useState } from "react";
import { guestsFromRows, loadGoogleIdentity, readAuthorizedRows, readPublicRows, writeLodging } from "./sheets";

// Public browser client ID, not a client secret. Keep builds reproducible.
const DEFAULT_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "543487197805-ekg07uohpopo0sh9sej4sqfv0j346f9j.apps.googleusercontent.com";
export function useSheetWorkspace(enabled) {
  const [guests, setGuests] = useState([]);
  const [state, setState] = useState({ loading: enabled, saving: false, connected: false, error: "", refreshedAt: null });
  const [clientId, setClientId] = useState(() => {
    try { return localStorage.getItem("mandir.google-client-id") || DEFAULT_CLIENT_ID; } catch { return DEFAULT_CLIENT_ID; }
  });
  const credentials = useRef(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const connecting = useRef(false);
  const refresh = useCallback(async () => {
    if (!enabled || busy.current) return;
    const request = ++generation.current;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const token = credentials.current?.expiresAt > Date.now() ? credentials.current.token : null;
      if (!token) credentials.current = null;
      const rows = token ? (await readAuthorizedRows(token)).rows : await readPublicRows();
      const next = guestsFromRows(rows);
      if (request === generation.current) {
        setGuests(next);
        setState((s) => ({ ...s, loading: false, error: "", connected: !!token, refreshedAt: new Date() }));
      }
    } catch (error) {
      if (error.status === 401) credentials.current = null;
      if (request === generation.current) setState((s) => ({ ...s, loading: false, connected: !!credentials.current, error: error.message }));
    }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    // Preload so the later sign-in request runs directly in a user gesture.
    loadGoogleIdentity().catch(() => {});
    const interval = setInterval(() => { if (!document.hidden && !busy.current) refresh(); }, 60000);
    return () => { clearInterval(interval); generation.current++; };
  }, [enabled, refresh]);
  const configureClientId = (value) => {
    const next = value.trim();
    if (next && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(next)) throw new Error("Enter a Google web OAuth client ID ending in .apps.googleusercontent.com, not a secret.");
    credentials.current = null;
    setClientId(next);
    setState((s) => ({ ...s, connected: false }));
    try { localStorage.setItem("mandir.google-client-id", next); } catch { /* Session-only configuration is fine. */ }
  };
  const connect = () => {
    if (connecting.current) return;
    if (!clientId) { setState((s) => ({ ...s, error: "Set the Google OAuth client ID in Workspace settings to enable assignment writes." })); return; }
    if (!window.google?.accounts?.oauth2) { loadGoogleIdentity().catch(() => {}); setState((s) => ({ ...s, error: "Google sign-in is loading. Please press Sign in again." })); return; }
    connecting.current = true;
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: "https://www.googleapis.com/auth/spreadsheets",
      callback: (response) => {
        connecting.current = false;
        if (response.error || !response.access_token) { setState((s) => ({ ...s, error: "Google did not authorize sheet access. No assignments were changed." })); return; }
        credentials.current = { token: response.access_token, expiresAt: Date.now() + Number(response.expires_in) * 1000 - 30000 };
        setState((s) => ({ ...s, connected: true, error: "" }));
        refresh();
      },
      error_callback: () => { connecting.current = false; setState((s) => ({ ...s, error: "Google sign-in was closed or blocked. Allow the popup and try again." })); },
    });
    client.requestAccessToken({ prompt: "select_account" });
  };
  const disconnect = () => {
    credentials.current = null;
    setGuests([]);
    generation.current++;
    setState((s) => ({ ...s, connected: false, refreshedAt: null }));
    refresh();
  };
  const saveAssignment = async (guest, assignment) => {
    if (busy.current) throw new Error("Another assignment is being saved. Please wait.");
    const auth = credentials.current;
    if (!auth || auth.expiresAt <= Date.now()) {
      credentials.current = null;
      setState((s) => ({ ...s, connected: false }));
      throw new Error("Sign in with a Google account that can edit the sheet before saving.");
    }
    busy.current = true;
    generation.current++; // Ignore older reads that could revert a saved assignment.
    setState((s) => ({ ...s, saving: true, loading: false, error: "" }));
    try {
      const values = await writeLodging(guest, assignment, auth.token);
      setGuests((previous) => previous.map((item) => item.sourceIdentity !== guest.sourceIdentity ? item : {
        ...item, lodging: values[0], stay: values[0] || "Pending lodging", roomNo: values[1], roomCode: values[2], room: values[2] || values[1], sourceLodging: values,
      }));
      setState((s) => ({ ...s, refreshedAt: new Date() }));
    } catch (error) {
      if (error.status === 401) { credentials.current = null; setState((s) => ({ ...s, connected: false })); }
      // A failed network response can have committed. Never retry automatically.
      setState((s) => ({ ...s, error: `${error.message} Refresh the sheet before retrying; the last write may already have reached Google.` }));
      throw error;
    } finally {
      busy.current = false;
      setState((s) => ({ ...s, saving: false }));
    }
  };
  return { guests, ...state, clientId, configureClientId, refresh, connect, disconnect, saveAssignment };
}
