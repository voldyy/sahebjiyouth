import { useCallback, useEffect, useRef, useState } from "react";
import { guestsFromRows } from "./sheets";
import { sheetRequest } from "./appsScript";
import { stayRange } from "./occupancy";
import { EMPTY_TRANSPORT } from "./transport";
export function useSheetWorkspace(enabled) {
  const [guests, setGuests] = useState([]);
  const [transport, setTransport] = useState(EMPTY_TRANSPORT);
  const [state, setState] = useState({
    loading: enabled,
    saving: false,
    connected: false,
    error: "",
    refreshedAt: null,
  });
  const generation = useRef(0),
    busy = useRef(false);
  const apply = useCallback((result) => {
    setGuests(guestsFromRows(result.rows));
    setTransport(result.transport);
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
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", focus);
      generation.current++;
    };
  }, [enabled, refresh]);
  const save = async (request) => {
    if (busy.current)
      throw new Error("Another change is being saved. Please wait.");
    busy.current = true;
    generation.current++;
    setState((s) => ({ ...s, saving: true, loading: false, error: "" }));
    try {
      apply(await sheetRequest({ ...request, requestId: crypto.randomUUID() }));
    } catch (error) {
      setState((s) => ({ ...s, error: error.message }));
      throw error;
    } finally {
      busy.current = false;
      setState((s) => ({ ...s, saving: false }));
    }
  };
  return {
    guests,
    transport,
    ...state,
    refresh,
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
    flightStatus: (group) =>
      sheetRequest({
        action: "flight",
        flight: group.flight,
        day: group.day,
        airport: group.airport,
        direction: group.direction,
      }),
  };
}
