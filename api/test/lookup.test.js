const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone, buildIndex, createCachedIndex, createRateLimiter, createHandler, clientAddress } = require('../src/lookup');
const contacts = ['First', 'Second'].map((name, i) => ({ id: String(i), phone: '5551234567', name, email: 'test@example.com', zipCode: '01234', cityState: 'Test, MA', secretColumn: 'excluded' }));
const database = { version: 1, contacts };
function request(body, method = 'POST', origin = 'https://example.com') {
  return { method, headers: new Headers({ origin, 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.1' }), text: async () => JSON.stringify(body) };
}
const make = (overrides = {}) => createHandler({ getIndex: async () => buildIndex(database), allowRequest: async () => true, origins: new Set(['https://example.com']), ...overrides });

test('exact lookup returns only matches, preserving duplicates and ZIP codes', async () => {
  const result = await make()(request({ phone: '+1 (555) 123-4567' }));
  assert.equal(result.status, 200);
  assert.equal(result.jsonBody.contacts.length, 2);
  assert.equal(result.jsonBody.contacts[0].zipCode, '01234');
  assert.equal(result.jsonBody.contacts[0].secretColumn, undefined);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal((await make()(request({ phone: '5550000000' }))).jsonBody.contacts.length, 0);
});

test('partial numbers, bulk queries, malformed bodies, and unexpected methods are rejected', async () => {
  for (const body of [{phone:'55'}, {phone:['5551234567']}, {prefix:'55'}, {phone:'5551234567', all:true}, null]) {
    assert.equal((await make()(request(body))).status, 400);
  }
  assert.equal(normalizePhone('555123456700'), null);
  assert.equal((await make()(request({}, 'GET'))).status, 405);
  const bad = request({}); bad.text = async () => '{';
  assert.equal((await make()(bad)).status, 400);
  assert.equal((await make()(request({phone:'x'.repeat(300)}))).status, 413);
});

test('CORS allows configured websites, denies other origins', async () => {
  assert.equal((await make()(request({}, 'OPTIONS'))).status, 204);
  assert.equal((await make()(request({phone:'5551234567'}, 'POST', 'https://evil.example'))).status, 403);
});

test('storage and rate-limiter failures fail closed, with no private error details', async () => {
  const result = await make({getIndex: async () => {throw Error('private detail');}})(request({phone:'5551234567'}));
  assert.equal(result.status, 503);
  assert.ok(!JSON.stringify(result).includes('private detail'));
  assert.equal((await make({allowRequest: async () => false})(request({phone:'5551234567'}))).status, 429);
});

test('warm requests reuse one index, concurrent refreshes share a read, and failed reads retry', async () => {
  let count = 0, now = 1000, fail = false;
  const get = createCachedIndex(async () => { count++; if (fail) throw Error('offline'); return database; }, () => now);
  await Promise.all([get(), get(), get()]); assert.equal(count, 1);
  await get(); assert.equal(count, 1);
  now += 60001; fail = true;
  await assert.rejects(get(), /offline/);
  fail = false; await get(); assert.equal(count, 3);
});

test('durable rate limit survives separate handler instances and resets after ten minutes', async () => {
  const rows = new Map(); let now = 1000;
  const table = {
    async getEntity(p, key) { if (!rows.has(key)) throw {statusCode:404}; return {...rows.get(key)}; },
    async createEntity(entity) { if (rows.has(entity.rowKey)) throw {statusCode:409}; rows.set(entity.rowKey, {...entity, etag:'1'}); },
    async updateEntity(entity, mode, {etag}) {
      if (rows.get(entity.rowKey).etag !== etag) throw {statusCode:412};
      rows.set(entity.rowKey, {...entity, etag:String(Number(etag)+1)});
    },
  };
  const a = createRateLimiter(table, () => now), b = createRateLimiter(table, () => now);
  for (let i=0;i<30;i++) assert.equal(await (i%2 ? a : b)('198.51.100.1'), true);
  assert.equal(await a('198.51.100.1'), false);
  assert.equal(await a('198.51.100.2'), true);
  now += 600001; assert.equal(await b('198.51.100.1'), true);
  assert.ok(!JSON.stringify([...rows.keys()]).includes('198.51.100'));
});

test('IP extraction uses the proxy-appended address, not a spoofed first value', () => {
  const req = request({}); req.headers.set('x-forwarded-for','1.2.3.4, 198.51.100.1:1234');
  assert.equal(clientAddress(req), '198.51.100.1');
  req.headers.set('x-forwarded-for','[2001:db8::1]:1234');
  assert.equal(clientAddress(req), '2001:db8::1');
});
