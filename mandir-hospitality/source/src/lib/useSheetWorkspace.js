import { useCallback, useEffect, useRef, useState } from "react";
import { guestsFromRows } from "./sheets";
import { sheetRequest } from "./appsScript";
import { stayRange } from "./occupancy";
import { EMPTY_TRANSPORT } from "./transport";
import { isTeamView } from "./access";
export function useSheetWorkspace(enabled) {
  const [guests, setGuests] = useState([]);
  const [transport, setTransport] = useState(EMPTY_TRANSPORT);
  const [offsiteRooms, setOffsiteRooms] = useState([]);
  const [housekeeping, setHousekeeping] = useState([]);
  const [tripDisplay, setTripDisplay] = useState([]);
  const [role, setRole] = useState(null);
  const [state, setState] = useState({
    loading: enabled,
    saving: false,
    connected: false,
    error: "",
    refreshedAt: null,
  });
  const generation = useRef(0),
    busy = useRef(false);
  const displayGeneration = useRef(0);
  const refreshTripDisplay = useCallback(async () => {
    const version = ++displayGeneration.current;
    const result = await sheetRequest({ action: "trip-display-read" });
    if (version === displayGeneration.current) setTripDisplay(result.tripDisplay || []);
  }, []);
  const setTripCollapsed = useCallback(async (id, collapsed) => {
    const version = ++displayGeneration.current;
    const result = await sheetRequest({ action: "trip-display", id, collapsed, requestId: crypto.randomUUID() });
    if (version === displayGeneration.current) setTripDisplay(result.tripDisplay || []);
  }, []);
  const apply = useCallback((result) => {
    setRole(result.role || "viewer");
    setTripDisplay(result.tripDisplay || []);
    setGuests(result.role === "admin" ? guestsFromRows(result.rows) : result.guests || result.kitchenGuests || []);
    setTransport(result.transport || EMPTY_TRANSPORT);
    setOffsiteRooms(result.offsiteRooms || []);
    setHousekeeping(result.housekeeping || []);
    setState((s) => ({
      ...s,
      connected: true,
      loading: false,
      error: "",
      refreshedAt: new Date(result.refreshedAt),
    }));
  }, []);
  const refresh = useCallback(async () => {
    if (!enabled || busy.current) return;
    const request = ++generation.current;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const result = await sheetRequest({ action: "snapshot" });
      if (request === generation.current) apply(result);
    } catch (error) {
      if (request === generation.current)
        setState((s) => ({ ...s, loading: false, error: error.message }));
    }
  }, [enabled, apply]);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 60000);
    const focus = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", focus);
    const accessChanged = () => {
      generation.current++;
      setRole(null); setGuests([]); setTransport(EMPTY_TRANSPORT); setHousekeeping([]); setOffsiteRooms([]);
      setState((s) => ({ ...s, refreshedAt: null, connected: false }));
      refresh();
    };
    window.addEventListener("mandir-access-change", accessChanged);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("mandir-access-change", accessChanged);
      generation.current++;
    };
  }, [enabled, refresh]);
  const save = async (request) => {
    if (role !== "admin" || isTeamView()) throw new Error("This link is view-only. Open your private admin link to make changes.");
    if (busy.current)
      throw new Error("Another change is being saved. Please wait.");
    busy.current = true;
    const saveGeneration = ++generation.current;
    setState((s) => ({ ...s, saving: true, loading: false, error: "" }));
    try {
      const result = await sheetRequest({ requestId: crypto.randomUUID(), ...request });
      if (saveGeneration === generation.current) apply(result);
    } catch (error) {
      setState((s) => ({ ...s, error: error.message }));
      throw error;
    } finally {
      busy.current = false;
      setState((s) => ({ ...s, saving: false }));
      if (saveGeneration !== generation.current) refresh();
    }
  };
  return {
    guests,
    transport,
    offsiteRooms,
    housekeeping,
    tripDisplay,
    role,
    ...state,
    refresh,
    accommodationNotifications: async (request) => {
      if (role !== "admin" || isTeamView()) throw new Error("Admin access is required to send accommodation messages.");
      return sheetRequest({ action: "accommodation-notifications", ...request });
    },
    addGuest: (guest, requestId) => save({ action: "guest", guest, requestId }),
    addWalkIn: (guest, assignment, requestId) => save({ action: "guest", guest, assignment, requestId }),
    refreshTripDisplay,
    setTripCollapsed,
    saveAssignment: (guest, assignment) =>
      save({
        action: "lodging",
        identity: guest.sourceIdentity,
        expected: guest.sourceLodging,
        stay: stayRange(guest),
        assignment,
      }),
    saveTransport: (group, plan) =>
      save({
        action: "transport",
        id: group.id,
        direction: group.direction,
        signature: group.signature,
        expectedRevision: group.plan.revision,
        expectedPlan: group.plan,
        plan,
      }),
    saveResource: (type, name, active) =>
      save({ action: "resource", type, name, active }),
    saveOffsiteRoom: (room) => save({ action: "offsite", ...room }),
    refreshLinens: (bed) => save({ action: "linen", roomCode: bed.roomCode, expected: bed.events.map((e) => e.id) }),
    flightStatus: (group) =>
      sheetRequest({
        action: "flight",
        manual: true,
        flight: group.flight,
        day: group.day,
        airport: group.airport,
        direction: group.direction,
      }),
  };
}
