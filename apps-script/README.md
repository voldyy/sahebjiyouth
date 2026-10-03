# Registration receiver and confirmation email

Copy `Code.gs` into a Google Apps Script project (Google Sheet → Extensions → Apps Script).

1. Set `PUJA_CONFIG.SPREADSHEET_ID` to the ID between `/d/` and `/edit` in your Google Sheet URL. Set `SHEET_NAME` to your existing tab's name. Review event details and optional reply-to address.
2. Select `authorizeGoogleAppsScript` and click Run. Approve Sheets and email permissions as the deployment owner. This function sends no email and writes no rows.
3. Deploy as a web app: **Execute as: Me**, **Who has access: Anyone**. Workspace policies may restrict anonymous access.
4. Set `GOOGLE_SCRIPT_URL` in `reg/data.js` to the deployment's `/exec` URL and republish the site. For an existing deployment, deploy a new version to keep the same URL.
5. Test using your own email. A form submission creates a real registration and sends an email; running the authorization function does not test delivery.

## Exact sheet layout

| Column | Header | Value |
|---|---|---|
| A | Timestamp | Submission date/time |
| B | Phone | Phone number stored as text |
| C | Name | Participant name(s) |
| D | C or S | C for Yajman Couple; S for Yajman Single |
| E | Email | Email address, if supplied |
| F | Zip Code | ZIP code stored as text |
| G | City, State | City/state |
| H | Lookup Status | Matched or Manual |

No additional columns are added. A new/empty tab receives these headers; an existing tab must match them. Existing data is not automatically rearranged. The required `yajmanType` field accepts only `Yajman Couple` or `Yajman Single`, and the email includes the full choice.

The form posts JSON as `text/plain;charset=utf-8` to avoid a CORS preflight. Apps Script returns JSON containing `ok`; the frontend checks it instead of relying solely on HTTP status codes.

Email is optional. Missing email saves the RSVP with `emailStatus: skipped`. Invalid email rejects the request before saving. If MailApp fails, the RSVP stays saved and the response has `ok: true` with `emailStatus: failed`. Failures are recorded in Apps Script execution logs with the row number and reference, not in extra spreadsheet columns. The frontend does not display email status separately. MailApp accepting a message does not prove delivery; check spam/bounces as needed.

Mail is sent from the deployment's executing account and is subject to its daily quota. The script escapes formula-like sheet input and HTML email text. Each accepted POST creates a new row; there is no automatic retry or deduplication. Review failures before manually resending. Anonymous submissions do not verify email ownership.

The source has been tested with mocked Google services. It must be copied and redeployed in Google to change live spreadsheet/email behavior.

## HTML email styling

The confirmation uses the registration form's cream, gold, deep red, and dark navy colors, with a centered mandir logo. Layout uses presentation tables and inline styles for email compatibility. Inter is preferred when installed, with system/Arial fallbacks because email clients do not consistently support web fonts. A plain-text alternative is included.

`PUJA_CONFIG.LOGO_URL` points to the existing public HTTPS logo. Recipients whose email client blocks remote images may need to enable images. The preview was visually checked in a browser; rendering in Gmail/Outlook and actual delivery should be tested after redeploying the script.
