const { app } = require('@azure/functions');
const { ManagedIdentityCredential } = require('@azure/identity');
const { BlobServiceClient } = require('@azure/storage-blob');
const { TableClient } = require('@azure/data-tables');
const { createCachedIndex, createRateLimiter, createHandler } = require('./lookup');

const account = process.env.CONTACTS_STORAGE_ACCOUNT;
if (!account || !/^[a-z0-9]{3,24}$/.test(account)) throw Error('CONTACTS_STORAGE_ACCOUNT is required');
const credential = new ManagedIdentityCredential();
const blob = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential)
  .getContainerClient('reg-private-contacts').getBlobClient('contacts.json');
const table = new TableClient(`https://${account}.table.core.windows.net`, 'RegLookupLimits', credential, { retryOptions: { maxRetries: 2 } });
const getIndex = createCachedIndex(async () => {
  const properties = await blob.getProperties({ abortSignal: AbortSignal.timeout(10000) });
  if (!properties.contentLength || properties.contentLength > 5 * 1024 * 1024) throw Error('Invalid database size');
  const data = await blob.downloadToBuffer(0, properties.contentLength, { conditions: { ifMatch: properties.etag }, abortSignal: AbortSignal.timeout(10000) });
  return JSON.parse(data.toString('utf8'));
});
const origins = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
app.http('lookup', {
  route: 'lookup', methods: ['POST', 'OPTIONS'], authLevel: 'anonymous',
  handler: createHandler({ getIndex, allowRequest: createRateLimiter(table), origins }),
});

const {createRegistrationHandler, createServices} = require('./registration');
const registrationTable = new TableClient(`https://${account}.table.core.windows.net`, 'RegRegistrations', credential, {retryOptions:{maxRetries:2}});
app.http('register', {
  route:'register', methods:['POST','OPTIONS'], authLevel:'anonymous',
  handler:createRegistrationHandler({
    table:registrationTable,
    allowRequest:createRateLimiter(registrationTable,Date.now,{partitionKey:'registration-ip'}),
    allowRecipient:createRateLimiter(registrationTable,Date.now,{partitionKey:'registration-phone',limit:3,windowMs:24*60*60*1000}),
    ...createServices(process.env), origins,
  }),
});
