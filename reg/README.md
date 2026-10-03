# Registration lookup

The registration page loads `contacts-db.js` from the repository and indexes it in memory. Typing two or more phone digits displays up to eight matching records. Selecting a record immediately fills name, email, ZIP code, and city/state. Exact lookup preserves separate records for shared phone numbers. No lookup network calls are made; only RSVP submission uses Google Apps Script.

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

The Azure Function and private storage from the previous implementation are retained but no longer used by the webapp. Their source remains in `api/` for reference; no cloud resources were deleted during this revert.

## GitHub publishing

Push changes to `main` to run `.github/workflows/main.yml`. GitHub Actions runs the tests, authenticates to Azure with a federated managed identity, uploads versioned assets, and switches the registration index. Access is scoped to the existing `$web` container. A copy of the previous index is retained as a workflow artifact for 14 days. The workflow does not deploy Apps Script or the retired private API.
