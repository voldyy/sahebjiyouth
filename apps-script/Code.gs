/**
 * Registration receiver for reg/app.js.
 * Deploy as a web app: Execute as Me; access Anyone.
 * POST body: JSON sent with Content-Type: text/plain;charset=utf-8.
 */
const PUJA_CONFIG = {
  SPREADSHEET_ID: '1gY4G6BveSiZ8TF1eplxsRoaTmMTn7LLl8xihnDaD7kQ',
  SHEET_NAME: 'Sheet1',
  EVENT_NAME: 'Dhan Teras Puja 2026',
  EVENT_DATE: 'Friday, November 6, 2026',
  EVENT_TIME: '5:30 PM Eastern Time',
  VENUE: 'Allentown Mandir',
  SENDER_NAME: 'Anoopam Mission USA',
  LOGO_URL: 'https://sahebjiyouth.z13.web.core.windows.net/reg/HIRES_AMLOGO_color_sm.png',
  REPLY_TO: '', // Optional monitored email address.
};

const RSVP_HEADERS = [
  'Timestamp', 'Phone', 'Name', 'C or S', 'Email', 'Zip Code', 'City, State', 'Lookup Status',
];

/**
 * Run this dummy function once from the Apps Script editor to authorize
 * Sheets and email access. It does not send email or create a registration.
 * Set SPREADSHEET_ID above before running it.
 */
function authorizeGoogleAppsScript() {
  const spreadsheet = openRegistrationSpreadsheet_();
  const remaining = MailApp.getRemainingDailyQuota();
  console.log('Authorization successful. Sheet: ' + spreadsheet.getName());
  console.log('Remaining daily email recipient quota: ' + remaining);
}

/** A browser visit verifies deployment without exposing registration data. */
function doGet() {
  return jsonResponse_({ ok: true, service: 'Mahapuja registration', method: 'POST' });
}

function doPost(e) {
  let registration;
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Missing request body.');
    if (e.postData.contents.length > 10000) throw new Error('Request is too large.');
    let input;
    try { input = JSON.parse(e.postData.contents); }
    catch (_) { throw new Error('Request must contain valid JSON.'); }
    registration = validateRegistration_(input);
  } catch (error) {
    return jsonResponse_({ ok: false, error: error.message });
  }

  const registrationId = Utilities.getUuid();
  let sheet;
  let row;
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(20000)) {
      return jsonResponse_({ ok: false, error: 'Registration is busy. Please try again shortly.' });
    }
    try {
      sheet = getRegistrationSheet_();
      row = sheet.getLastRow() + 1;
      const values = [
        new Date(), sheetText_(registration.phone), sheetText_(registration.name),
        registration.yajmanType === 'Yajman Couple' ? 'C' : 'S',
        sheetText_(registration.email), sheetText_(registration.zipCode),
        sheetText_(registration.cityState), registration.lookupStatus,
      ];
      // Preserve phone and ZIP leading zeroes. Escape formula-like user input too.
      sheet.getRange(row, 2, 1, 7).setNumberFormat('@');
      sheet.getRange(row, 1, 1, RSVP_HEADERS.length).setValues([values]);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  } catch (_) {
    console.error('Registration storage failed. Reference: ' + registrationId);
    return jsonResponse_({ ok: false, error: 'Could not save your registration. Please try again.' });
  }

  // Save first. An email failure must not cause the form to report a lost RSVP.
  let emailStatus = 'skipped';
  if (registration.email) {
    try {
      if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Email quota exhausted');
      sendConfirmationEmail_(registration, registrationId);
      emailStatus = 'sent';
    } catch (_) {
      emailStatus = 'failed';
      console.error('Confirmation email failed. Sheet row: ' + row + '. Reference: ' + registrationId);
    }

  }
  return jsonResponse_({ ok: true, registrationId: registrationId, emailStatus: emailStatus });
}

function validateRegistration_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid registration.');
  const read = function (key, max) {
    const value = input[key] == null ? '' : String(input[key]).trim();
    if (value.length > max) throw new Error(key + ' is too long.');
    return value;
  };
  const rawPhone = read('phone', 32);
  if (/[^0-9+().\s-]/.test(rawPhone)) throw new Error('Enter a valid 10 digit phone number.');
  let phone = rawPhone.replace(/[^0-9]/g, '');
  if (/^1[0-9]{10}$/.test(phone)) phone = phone.slice(1);
  if (!/^[0-9]{10}$/.test(phone)) throw new Error('Enter a valid 10 digit phone number.');
  const yajmanType = read('yajmanType', 30);
  if (['Yajman Couple', 'Yajman Single'].indexOf(yajmanType) === -1) {
    throw new Error('Please select Yajman Couple or Yajman Single.');
  }
  const name = read('name', 300);
  if (!name) throw new Error('Please enter your name.');
  const email = read('email', 254);
  if (email && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) {
    throw new Error('Please enter a valid email address.');
  }
  return {
    phone: phone, name: name, email: email, yajmanType: yajmanType,
    zipCode: read('zipCode', 20), cityState: read('cityState', 150),
    yajman: input.yajman === 'No' ? 'No' : 'Yes',
    lookupStatus: input.lookupStatus === 'Matched' ? 'Matched' : 'Manual',
  };
}

function openRegistrationSpreadsheet_() {
  if (!PUJA_CONFIG.SPREADSHEET_ID || PUJA_CONFIG.SPREADSHEET_ID === 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE') {
    throw new Error('Set PUJA_CONFIG.SPREADSHEET_ID before running this script.');
  }
  return SpreadsheetApp.openById(PUJA_CONFIG.SPREADSHEET_ID);
}

function getRegistrationSheet_() {
  const spreadsheet = openRegistrationSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(PUJA_CONFIG.SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(PUJA_CONFIG.SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, RSVP_HEADERS.length).setValues([RSVP_HEADERS]);
    sheet.setFrozenRows(1);
  } else {
    const actual = sheet.getRange(1, 1, 1, RSVP_HEADERS.length).getValues()[0];
    if (actual.join('|') !== RSVP_HEADERS.join('|')) throw new Error('Sheet headers do not match. Use a new sheet name.');
  }
  return sheet;
}

function sendConfirmationEmail_(registration, registrationId) {
  const lines = [
    'Jai Swaminarayan ' + registration.name + ',', '',
    'Your registration for ' + PUJA_CONFIG.EVENT_NAME + ' has been received.', '',
    'Date: ' + PUJA_CONFIG.EVENT_DATE,
    'Time: ' + PUJA_CONFIG.EVENT_TIME,
    'Venue: ' + PUJA_CONFIG.VENUE, '',
    'The puja will begin promptly at 5:30 PM. Please plan to arrive before the start time. Reply to this email if you have any questions.', '',
    'Participants: ' + registration.name,
  ];
  const message = {
    to: registration.email,
    subject: 'Registration confirmed: ' + PUJA_CONFIG.EVENT_NAME,
    body: lines.join('\n'),
    htmlBody: buildConfirmationHtml_(registration, registrationId),
    name: PUJA_CONFIG.SENDER_NAME,
  };
  if (PUJA_CONFIG.REPLY_TO) message.replyTo = PUJA_CONFIG.REPLY_TO;
  MailApp.sendEmail(message);
}

/** Table layout and inline styling for Gmail, Outlook, and mobile mail clients. */
function buildConfirmationHtml_(registration, registrationId) {
  const e = escapeHtml_;
  const font = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
  const eventRow = function (label, value) {
    return '<tr><td style="padding:10px 0;border-bottom:1px solid #ead7b7;">' +
      '<p style="margin:0 0 3px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#a83224;">' + e(label) + '</p>' +
      '<p style="margin:0;font-size:16px;line-height:24px;font-weight:600;color:#172033;overflow-wrap:anywhere;">' + e(value) + '</p></td></tr>';
  };
  return `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${e(PUJA_CONFIG.EVENT_NAME)} confirmation</title></head>
<body style="margin:0;padding:0;background-color:#fff8ec;color:#172033;font-family:${font};-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;color:#fff8ec;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Your registration is confirmed. ${e(PUJA_CONFIG.EVENT_DATE)} at ${e(PUJA_CONFIG.EVENT_TIME)}.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fff8ec" style="width:100%;background-color:#fff8ec;">
<tr><td align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:560px;table-layout:fixed;background-color:#ffffff;border:1px solid #ead7b7;border-top:4px solid #a83224;border-radius:8px;border-spacing:0;font-family:${font};">
<tr><td align="center" bgcolor="#fff1cf" style="padding:30px 24px 26px;text-align:center;background-color:#fff1cf;background-image:linear-gradient(135deg,#fff1cf,#fffdf8);border-bottom:1px solid #ead7b7;border-radius:6px 6px 0 0;">
<img src="${e(PUJA_CONFIG.LOGO_URL)}" width="156" alt="Allentown Mandir" border="0" style="display:block;width:156px;max-width:100%;height:auto;margin:0 auto 22px;">
<p style="margin:0 0 10px;color:#a83224;font-size:11px;line-height:17px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">Registration confirmed</p>
<h1 style="margin:0;color:#172033;font-size:30px;line-height:35px;font-weight:800;overflow-wrap:anywhere;">${e(PUJA_CONFIG.EVENT_NAME)}</h1>
</td></tr>
<tr><td style="padding:26px 24px 0;">
<p style="margin:0 0 12px;color:#172033;font-size:17px;line-height:26px;font-weight:700;overflow-wrap:anywhere;">Jai Swaminarayan ${e(registration.name)},</p>
<p style="margin:0;color:#667085;font-size:15px;line-height:24px;">Your registration has been received. Please find your puja details below.</p>
</td></tr>
<tr><td style="padding:20px 24px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;table-layout:fixed;">
${eventRow('Date', PUJA_CONFIG.EVENT_DATE)}
${eventRow('Time', PUJA_CONFIG.EVENT_TIME)}
${eventRow('Venue', PUJA_CONFIG.VENUE)}
</table>
</td></tr>
<tr><td style="padding:22px 24px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fffdf8" style="width:100%;table-layout:fixed;background-color:#fffdf8;border:1px solid #ead7b7;border-radius:8px;">
<tr><td style="padding:18px;">
<p style="margin:0 0 14px;color:#172033;font-size:16px;line-height:22px;font-weight:700;">Your registration</p>
<p style="margin:0 0 3px;color:#667085;font-size:12px;line-height:18px;">Participants</p>
<p style="margin:0 0 14px;color:#172033;font-size:15px;line-height:23px;overflow-wrap:anywhere;">${e(registration.name)}</p>
<p style="margin:0 0 3px;color:#667085;font-size:12px;line-height:18px;">Participation</p>
<p style="margin:0;color:#a83224;font-size:15px;line-height:23px;font-weight:700;">${e(registration.yajmanType)}</p>
</td></tr></table>
</td></tr>
<tr><td style="padding:20px 24px 26px;">
<p style="margin:0;color:#6b4c1f;font-size:14px;line-height:23px;">The puja will begin promptly. Please plan to arrive before the start time.</p>
</td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}

function sheetText_(value) {
  return /^[=+\-@\t\r\n]/.test(value) ? "'" + value : value;
}

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
