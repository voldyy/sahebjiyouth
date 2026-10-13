import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import Sheet from "./Sheet";

export default function LodgingNotifications({ workspace, toast }) {
  const [open, setOpen] = useState(false), [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  async function load() {
    setOpen(true); setBusy(true); setError(""); setPreview(null);
    try {
      const result = await workspace.accommodationNotifications({ mode: "preview" });
      setPreview(result); setRequestId(crypto.randomUUID());
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function send() {
    setBusy(true); setError("");
    try {
      const result = await workspace.accommodationNotifications({ mode: "queue", previewHash: preview.previewHash, requestId });
      toast(`${result.queued} accommodation message${result.queued === 1 ? "" : "s"} queued for WhatsApp.`);
      setOpen(false); setPreview(null);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <>
    <button className="button secondary" onClick={load} disabled={busy || workspace.saving || !workspace.connected}><MessageCircle size={17} />Send room details</button>
    {open && <Sheet title="Send accommodation details" subtitle="One WhatsApp message per attendee with an assigned room." onClose={() => { if (!busy) setOpen(false); }}>
      <div className="op-form">
        <p>Each message addresses the attendee by name, gives their lodging and room number, and refers them to Monica Matalia for further details. Family members may share the same contact phone.</p>
        {busy && !preview && <p role="status">Checking current assignments and previous notifications…</p>}
        {preview && <>
          <p><strong>{preview.eligible} ready to send</strong>. Previously sent or queued details will be skipped.</p>
          {preview.skippedMissingContact > 0 && <p className="sheet-data-note">{preview.skippedMissingContact} attendees have no valid contact phone. Update their registration phone before sending.</p>}
          <ul className="notification-attendees" aria-label="Accommodation notification recipients">
            {preview.attendees.map((a, i) => <li key={`${a.name}-${i}`}><strong>{a.name}</strong><span>{a.lodging} · Room {a.roomNo}</span><small>Phone ending {a.phoneEnding} · {a.status}</small></li>)}
          </ul>
          {!preview.attendees.length && <p>No eligible room assignments are available.</p>}
          <button className="button primary" onClick={send} disabled={busy || !preview.eligible}><Send size={17} />{busy ? "Queuing…" : `Send ${preview.eligible} message${preview.eligible === 1 ? "" : "s"}`}</button>
        </>}
        {error && <p className="op-form-error" role="alert">{error}</p>}
        <button className="button secondary" onClick={load} disabled={busy}>Refresh preview</button>
      </div>
    </Sheet>}
  </>;
}
