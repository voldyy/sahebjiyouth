// A receipt is valid only for the exact current attendee, contact, stay and room.
export const lodgingNoticeSignature = guest => JSON.stringify([
  guest.sourceIdentity, guest.lodging, guest.roomNo, guest.arrivalDate,
  guest.arrivalTime, guest.phone,
].map(value => String(value || "")));

export const hasSentLodgingNotice = guest => guest.lodgingNotification?.sent === true &&
  ["sent", "delivered", "read"].includes(guest.lodgingNotification.status);

export function withLodgingNotices(guests, notifications = []) {
  return guests.map(guest => {
    const matches = notifications.filter(notice => notice.identity === guest.sourceIdentity && notice.signature === lodgingNoticeSignature(guest));
    const notice = matches.length === 1 ? matches[0] : null;
    return { ...guest, lodgingNotification: notice ? { sent: notice.sent === true, status: notice.status, at: notice.at } : null };
  });
}
