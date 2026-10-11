import { useState } from "react";
import { BedDouble, Check, Sparkles } from "lucide-react";
import { linenBeds } from "../lib/housekeeping";
import { shortDay, bedForGuest, stayRange } from "../lib/occupancy";

export default function Housekeeping({ workspace, toast, readOnly = false }) {
  const [error, setError] = useState("");
  const beds = linenBeds(workspace.housekeeping);
  const unresolved = workspace.guests.filter((g) => g.lodging === "Samarpan" && g.status !== "Cancelled" && (g.roomNo || g.roomCode) && (!bedForGuest(g) || !stayRange(g)));
  const refreshed = workspace.housekeeping.filter((e) => e.refreshedAt).sort((a, b) => b.refreshedAt.localeCompare(a.refreshedAt));
  const refresh = async (bed) => {
    if (readOnly) return;
    setError("");
    try { await workspace.refreshLinens(bed); toast(`${bed.roomCode}: linens marked refreshed.`); }
    catch (failure) { setError(failure.message); }
  };
  return <section className="stay-housekeeping" aria-label="Samarpan housekeeping">
    <header className="page-header"><div><p className="eyebrow">SAMARPAN</p><h1 className="page-title">Housekeeping</h1><p className="page-description">Beds needing fresh linens after checkout.</p></div><span className="stay-linen-count"><Sparkles size={19} />{beds.length} beds to refresh</span></header>
    <p className="sheet-data-note">The list updates from accommodation checkout dates in Allentown time.{!readOnly && " If a guest leaves early or extends their stay, update their checkout date in the source sheet. Tap only after the linens have been changed."}</p>
    {error && <p className="op-form-error" role="alert">{error}</p>}
    {unresolved.length > 0 && <p className="stay-review">{unresolved.length} Samarpan assignments need a valid bed code or checkout date before linen changes can be tracked. Review them in Samarpan.</p>}
    {beds.length ? <div className="stay-housekeeping-grid">{beds.map((bed) => <article className="stay-linen-card" key={bed.roomCode}>
      <span className="stay-section-icon"><BedDouble size={24} /></span><div><h2>Room {bed.roomNo} · Bed {bed.bed}</h2><p>{bed.roomCode}</p>{bed.events.map((event) => <p key={event.id}>{event.name} · Checkout {shortDay(event.checkout)}</p>)}</div>
      {!readOnly && <button className="button primary" disabled={workspace.saving || !workspace.connected} onClick={() => refresh(bed)}><Check size={17} />Linens refreshed</button>}
    </article>)}</div> : <div className="stay-clean-state"><Sparkles size={30} /><h2>No linens awaiting refresh</h2><p>Assigned Samarpan beds will appear here on their checkout date.</p></div>}
    {refreshed.length > 0 && <details className="stay-review"><summary>Recent linen refreshes</summary>{refreshed.slice(0, 20).map((event) => <p key={event.id}>{event.roomCode} · {event.name} · Refreshed {new Date(event.refreshedAt).toLocaleString("en-US", { timeZone: "America/New_York" })}</p>)}</details>}
  </section>;
}
