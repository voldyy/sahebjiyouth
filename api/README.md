# Azure Function deployment

Node.js 22 / Azure Functions v4. Install dependencies with `npm ci` in this directory.

App settings (no contact data or credentials in source):

- `CONTACTS_STORAGE_ACCOUNT=sahebjiyouth`
- `ALLOWED_ORIGINS=https://sahebjiyouth.z13.web.core.windows.net,https://www.sahebjiyouth.org,https://sahebjiyouth.org`
- `FUNCTIONS_REQUEST_BODY_SIZE_LIMIT=256`
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
