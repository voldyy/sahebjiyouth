# Registration lookup

The registration page loads `contacts-db.js` from the repository and indexes it in memory. Typing two or more phone digits displays up to eight matching records. Selecting a record immediately fills name, email, ZIP code, and city/state. Exact lookup preserves separate records for shared phone numbers. No lookup network calls are made. RSVP submission goes through the Azure registration API, which saves the RSVP and sends email through Google Apps Script, then sends the approved Twilio WhatsApp template when requested.

The source HTML works when opened as a local file as well as on the hosted website. React still loads from its CDN. If the contact database fails to load, Look Up permits manual registration.

## Refresh and deploy

```sh
python3 scripts/build_contacts.py /path/to/Contacts.xlsx
node --test tests/reg-lookup.test.cjs
python3 scripts/deploy_registration.py
```

The generator defaults to `reg/contacts-db.js`, intentionally included in Git. Use `--output .private/contacts.json` for an additional private JSON export. Keep the source workbook and credentials outside Git.

The deployment script backs up the previous index under `.private/`, uploads content-hashed database and application scripts, then switches the live index. The database is served with `Cache-Control: no-store`; this does not prevent downloading or copying it.

## Privacy and encryption

The complete database is browser-readable and publicly downloadable when published. Encrypting it with a key included in the app does not provide meaningful confidentiality: a visitor can obtain the key or inspect the decrypted records. Minification and obfuscation do not protect it either. Effective encryption needs a secret supplied by an authenticated user or retained on a server. A public two-digit contact dropdown necessarily exposes its matching records.

The Azure Function now handles registration and WhatsApp confirmation. Its older private lookup route is retained but is not used by the form; phone lookup still uses the local database.

## GitHub publishing

Push changes to `main` to run `.github/workflows/main.yml`. GitHub Actions runs the tests, authenticates to Azure with a federated managed identity, uploads versioned assets, and switches the registration index. Access is scoped to the existing `$web` container. A copy of the previous index is retained as a workflow artifact for 14 days. The workflow does not deploy Apps Script or the retired private API.

## WhatsApp confirmation

Registrants may select “Send me a WhatsApp confirmation at this phone number.” This requires an email address because the approved `eventregistration2` template tells them to check that address. The template is sent automatically after the RSVP is saved and Apps Script reports the email sent. The form reports a warning if the email or WhatsApp request fails, without asking the user to create another registration.

Template variables are name, `Dhan Teras Puja 2026`, and email address. Credentials are stored only in Azure app settings. A queued message is not proof of delivery; inspect its SID in Twilio to confirm delivery or failure.

The browser retains a random request ID keyed by a hash of the form values in session storage. Retrying unchanged details in the same tab/session uses the same ID. With storage disabled, this survives only until the page is refreshed. Changing fields or starting a new browser session creates a different request ID. The backend records request outcomes and does not repeat uncertain saves or sends automatically. Staff must investigate requests marked `review`, `processing`, or `sending` if they do not complete.

The production API accepts the configured HTTPS website origins. Local-file previews can show the form but cannot submit to this API. To change the Apps Script deployment URL, update the Azure `GOOGLE_SCRIPT_URL` setting as well as the reference in `reg/data.js`.
