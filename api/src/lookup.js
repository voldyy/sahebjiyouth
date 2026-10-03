const { createHash } = require('node:crypto');
const { isIP } = require('node:net');

function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 32 || /[^0-9+().\s-]/.test(value)) return null;
  const digits = value.replace(/[^0-9]/g, '');
  return /^[0-9]{10}$/.test(digits) ? digits : /^1[0-9]{10}$/.test(digits) ? digits.slice(1) : null;
}

function buildIndex(database) {
  if (database?.version !== 1 || !Array.isArray(database.contacts) || !database.contacts.length) throw Error('Invalid database');
  const index = new Map();
  const ids = new Set();
  for (const record of database.contacts) {
    const fields = ['id', 'phone', 'name', 'email', 'zipCode', 'cityState'];
    if (!fields.every(key => typeof record?.[key] === 'string') || !/^[0-9]{10}$/.test(record.phone) || !record.name || ids.has(record.id)) throw Error('Invalid record');
    ids.add(record.id);
    // Whitelist fields so future source columns cannot accidentally be exposed.
    const contact = Object.fromEntries(fields.map(key => [key, record[key]]));
    if (!index.has(record.phone)) index.set(record.phone, []);
    index.get(record.phone).push(contact);
  }
  return index;
}

function createCachedIndex(readDatabase, now = Date.now) {
  let index, refreshedAt = 0, pending;
  return async () => {
    if (index && now() - refreshedAt < 60000) return index;
    if (!pending) {
      pending = readDatabase().then(database => {
        const next = buildIndex(database);
        index = next;
        refreshedAt = now();
        return next;
      }).finally(() => { pending = null; });
    }
    return pending;
  };
}

// App Service appends the connecting client to X-Forwarded-For. Never trust
// a caller-supplied first entry, which would allow trivial rate-limit bypass.
function clientAddress(request) {
  let value = (request.headers.get('x-forwarded-for') || '').split(',').at(-1).trim();
  if (/^\[[^\]]+\](?::\d+)?$/.test(value)) value = value.slice(1, value.indexOf(']'));
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) value = value.split(':')[0];
  return isIP(value) ? value : 'unknown';
}

function createRateLimiter(table, now = Date.now) {
  return async (address) => {
    // One durable counter per hashed IP, shared across all Function instances.
    const partitionKey = 'lookup';
    const rowKey = createHash('sha256').update(address).digest('hex');
    const windowMs = 10 * 60 * 1000;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        let previous;
        try { previous = await table.getEntity(partitionKey, rowKey); }
        catch (error) { if (error.statusCode !== 404) throw error; }
        const currentTime = now();
        const active = previous && currentTime < previous.resetAt;
        if (active && previous.count >= 30) return false;
        const entity = { partitionKey, rowKey, count: active ? previous.count + 1 : 1, resetAt: active ? previous.resetAt : currentTime + windowMs };
        if (previous) await table.updateEntity(entity, 'Replace', { etag: previous.etag });
        else await table.createEntity(entity);
        return true;
      } catch (error) {
        if (error.statusCode !== 409 && error.statusCode !== 412) throw error;
      }
    }
    return false;
  };
}

function createHandler({ getIndex, allowRequest, origins }) {
  return async (request) => {
    const headers = { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
    const reply = (status, jsonBody) => ({ status, headers, jsonBody });
    const origin = request.headers.get('origin');
    // CORS is a browser restriction, not authentication. Exact-phone lookup is
    // deliberately available to registrants without an account.
    if (origin && !origins.has(origin)) return reply(403, { ok: false, error: 'Origin not allowed.' });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type';
      headers['Access-Control-Max-Age'] = '600';
      return { status: 204, headers };
    }
    if (request.method !== 'POST') return reply(405, { ok: false, error: 'Use POST.' });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, { ok: false, error: 'JSON required.' });
    try {
      if (!(await allowRequest(clientAddress(request)))) {
        headers['Retry-After'] = '600';
        return reply(429, { ok: false, error: 'Too many lookups. Please try again later or enter your details manually.' });
      }
      if (Number(request.headers.get('content-length')) > 256) return reply(413, { ok: false, error: 'Request too large.' });
      const body = await request.text();
      if (Buffer.byteLength(body) > 256) return reply(413, { ok: false, error: 'Request too large.' });
      let input;
      try { input = JSON.parse(body); } catch { return reply(400, { ok: false, error: 'Invalid JSON.' }); }
      const phone = normalizePhone(input?.phone);
      if (!phone || Object.keys(input).some(key => key !== 'phone')) return reply(400, { ok: false, error: 'Enter a complete 10 digit phone number.' });
      const contacts = (await getIndex()).get(phone) || [];
      return reply(200, { ok: true, found: contacts.length > 0, contacts });
    } catch {
      // Do not log request bodies, matched records, or storage errors with credentials.
      return reply(503, { ok: false, error: 'Lookup is temporarily unavailable. Please enter your details manually.' });
    }
  };
}

module.exports = { normalizePhone, buildIndex, createCachedIndex, createRateLimiter, createHandler, clientAddress };
