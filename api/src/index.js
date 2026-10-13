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

const { createYogiPrasadHandler, TIMER_SCHEDULE } = require('./yogi-prasad');
app.timer('yogiPrasadDaily', {
  schedule: TIMER_SCHEDULE,
  runOnStartup: false,
  useMonitor: true,
  handler: createYogiPrasadHandler({ table: registrationTable, env: process.env }),
});

const { createHospitalityWorker, createAccommodationHandler, loadSnapshot, SCHEDULE } = require('./hospitality-notifications');
app.timer('hospitalityNotifications', {
  schedule: SCHEDULE, runOnStartup: false, useMonitor: true,
  handler: createHospitalityWorker({ table: registrationTable, env: process.env }),
});
app.http('hospitalityNotificationActions', {
  route: 'hospitality-notifications', methods: ['POST'], authLevel: 'anonymous',
  handler: createAccommodationHandler({ table: registrationTable }),
});
app.http('hospitalityNotificationHealth', {
  route: 'hospitality-notifications/health', methods: ['GET'], authLevel: 'function',
  handler: async () => {
    let stage = 'source';
    try {
      const snapshot = await loadSnapshot();
      stage = 'storage';
      let initialized = false;
      try { await registrationTable.getEntity('hospitality-notification-state', 'initialized'); initialized = true; }
      catch (error) { if (error.statusCode !== 404) throw error; }
      return { jsonBody: { ok: true, enabled: process.env.HOSPITALITY_NOTIFICATIONS_ENABLED === 'true', attendees: snapshot.guests.length, initialized } };
    } catch (error) {
      return { status: 503, jsonBody: { ok: false, stage, error: String(error.message).slice(0, 200), code: error.code || error.cause?.code || '' } };
    }
  },
});
