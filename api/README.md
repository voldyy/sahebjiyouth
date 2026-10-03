# Azure Function deployment

Node.js 22 / Azure Functions v4. Install dependencies with `npm ci` in this directory.

App settings (no contact data or credentials in source):

- `CONTACTS_STORAGE_ACCOUNT=sahebjiyouth`
- `ALLOWED_ORIGINS=https://sahebjiyouth.z13.web.core.windows.net,https://www.sahebjiyouth.org,https://sahebjiyouth.org`
- `FUNCTIONS_REQUEST_BODY_SIZE_LIMIT=4096`
- `WEBSITE_MAX_DYNAMIC_APPLICATION_SCALE_OUT=2`

`AzureWebJobsStorage` is the Azure-managed host configuration created by Function provisioning. Do not copy it into the repository. Contact reads use the Function's managed identity, not a browser key. The Function runtime also uses the existing storage account for its host files and deployment package.

Package `host.json`, `package.json`, `package-lock.json`, `src/`, and `node_modules/` at the ZIP root. Exclude tests, `.private/`, local settings, and all contact exports. Deploy the archive:

```sh
az functionapp deployment source config-zip --resource-group rg-sahebjiyouth-reg --name sahebjiyouth-reg-api --src /path/to/api-deploy.zip --build-remote false
```

Configure Azure Function platform CORS with the same three origins using `az functionapp cors add`; Azure intercepts preflight requests before the handler. Do not allow wildcard or `null` origins.

The Function must have a system-assigned identity with `Storage Blob Data Reader` on the `reg-private-contacts` container and `Storage Table Data Contributor` on `RegLookupLimits`. Provision both before deploying. The blob container must have anonymous access disabled. These settings must not change public access on the existing website container.

The handler returns no bulk listing or prefix search. A shared phone number returns each matching record, allowing the visitor to choose a name. Storage or limiter failures return a generic 503 and the frontend permits manual entry. Responses use `Cache-Control: no-store`.

To verify deployment, send POST JSON `{"phone":"5550000000"}` to `/api/lookup` from an allowed origin; expect an empty successful response. A prefix request must return 400, a disallowed origin 403, and anonymous access to the private contact blob 404 or 403. Never log response bodies for real contact lookups.

## Registration and WhatsApp endpoint

`POST /api/register` validates the registration and required couple/single choice, then claims the supplied request UUID in `RegRegistrations`. It rate-limits requests per IP and allows at most three registrations per phone per 24-hour window. This is basic abuse protection, not verification of phone ownership. Explicit `whatsappOptIn: true` and a valid email are required for WhatsApp.

The server calls the fixed Apps Script URL to save the eight-column RSVP and send email. Only an `ok: true` response with `emailStatus: sent` permits the WhatsApp template send. All other cases skip WhatsApp. The Azure table retains the request hash, consent, state, registration reference, and final response (including Twilio SID); it does not retain raw registration fields. Counters use hashed phone/IP keys.

Additional server settings:
- `GOOGLE_SCRIPT_URL`: the deployed registration Apps Script `/exec` URL.
- `REGISTRATION_EVENT_NAME=Dhan Teras Puja 2026`
- `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`: server-only credentials, never source-controlled.
- `TWILIO_WHATSAPP_FROM=whatsapp:+16105021100`
- `TWILIO_CONTENT_SID=HXd7a422d696a9f397dc00e37f9efa2bda` (`eventregistration2`).
- `FUNCTIONS_REQUEST_BODY_SIZE_LIMIT=4096` for registration payloads.

The system-assigned identity also needs Storage Table Data Contributor scoped to `RegRegistrations`. Deploy API changes separately before publishing a frontend that uses them; the GitHub workflow currently publishes only the static frontend. The function timeout is two minutes.

Do not blindly retry registrations marked `processing` or `review`, or message sends with `unknown` status. Apps Script and Twilio are external side effects and cannot be made atomic with Azure Table updates. After an uncertain network result, staff must check the sheet/Twilio before retrying manually. New request IDs do not deduplicate across sessions. Queued confirmations must be checked in Twilio for delivery; no background resend is configured.
