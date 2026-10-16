import { hasSentLodgingNotice } from "../lib/lodgingNotifications.js";

export default function WhatsAppSent({ guest }) {
  if (!hasSentLodgingNotice(guest)) return null;
  const label = "Current room details sent via WhatsApp";
  return <span className="whatsapp-sent" role="img" aria-label={label} title={label}>
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Z" />
      <path fill="white" d="M7.5 6.2c-.5 0-1.5.6-1.5 2 0 3.2 4.2 7.3 7.4 7.4 1.4 0 2.1-1 2.1-1.5 0-.4-2-1.5-2.4-1.5-.4 0-.9.9-1.2.9-.8 0-3.2-2.4-3.2-3.2 0-.3.9-.8.9-1.2 0-.4-1.2-2.9-1.6-2.9Z" />
      <circle cx="18.5" cy="18.5" r="5" fill="white" />
      <path d="m15.8 18.5 1.7 1.7 3.4-3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>;
}
