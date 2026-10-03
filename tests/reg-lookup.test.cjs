const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../reg/data.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '../reg/app.js'), 'utf8');
const record = (id, phone, name) => ({ id, phone, name, email: 'test@example.com', zipCode: '01234', cityState: 'Test, MA' });
const fixtures = [record('1', '5551234567', 'First'), record('2', '5551234567', 'Second'), record('3', '5559876543', 'Third')];

function setup(database = { version: 1, contacts: fixtures }) {
  const requests = [];
  const context = vm.createContext({
    window: {REG_CONTACTS_DB: database},
    crypto: require("node:crypto").webcrypto, TextEncoder, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      if (url.includes('/api/lookup')) {
        if (!database) return {ok:false, json:async () => ({ok:false,error:'Unavailable'})};
        const phone = JSON.parse(options.body).phone;
        return {ok:true, json:async () => ({ok:true,contacts:database.contacts.filter(c => c.phone === phone)})};
      }
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  vm.runInContext(source, context);
  return { context, requests, run: (code) => vm.runInContext(code, context) };
}

// Exercise component event handlers and state transitions without a browser or network.
function component(database) {
  const app = setup(database);
  const values = [], effects = [], dependencies = [];
  let cursor = 0, dirty = false, tree;
  app.context.React = {
    Fragment: 'fragment',
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(Boolean) }),
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], value => {
        values[index] = typeof value === 'function' ? value(values[index]) : value;
        dirty = true;
      }];
    },
    useMemo: fn => fn(),
    useRef(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = {current: initial};
      return values[index];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!dependencies[index] || deps.some((v, i) => v !== dependencies[index][i])) effects.push(fn);
      dependencies[index] = deps;
    },
  };
  app.context.ReactDOM = { createRoot: () => ({ render() {} }) };
  app.context.document = { getElementById() {} };
  vm.runInContext(appSource, app.context);
  app.render = () => {
    for (let count = 0; count < 10; count++) {
      cursor = 0; dirty = false;
      tree = app.run('App()');
      while (effects.length) effects.shift()();
      if (!dirty) return tree;
    }
    throw new Error('Render did not settle');
  };
  app.findAll = predicate => {
    const found = [];
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (predicate(node)) found.push(node);
      (node.children || []).forEach(walk);
    }
    walk(tree);
    return found;
  };
  app.field = id => app.findAll(n => n.props.id === id)[0];
  app.lookup = () => app.findAll(n => n.props.className?.includes('lookup-button'))[0].props.onClick({ preventDefault() {} });
  app.render();
  return app;
}

test('two digits show matching dropdown; selecting fills every field with no request', () => {
  const app = component();
  app.field('phone').props.onChange('5'); app.render();
  assert.equal(app.findAll(n => n.props.role === 'option').length, 0);
  app.field('phone').props.onChange('55'); app.render();
  const choices = app.findAll(n => n.props.role === 'option');
  assert.equal(choices.length, 3);
  choices[1].props.onClick(); app.render();
  assert.equal(app.field('name').props.value, 'Second');
  assert.equal(app.field('email').props.value, 'test@example.com');
  assert.equal(app.field('zipCode').props.value, '01234');
  assert.equal(app.field('cityState').props.value, 'Test, MA');
  assert.equal(app.requests.length, 0);
});

test('changing the prefix updates or closes suggestions and clears previous details', () => {
  const app = component();
  app.field('phone').props.onChange('55'); app.render();
  app.findAll(n => n.props.role === 'option')[0].props.onClick(); app.render();
  app.field('phone').props.onChange('5559'); app.render();
  assert.equal(app.field('name'), undefined);
  assert.equal(app.findAll(n => n.props.role === 'option').length, 1);
  app.field('phone').props.onChange('99'); app.render();
  assert.equal(app.findAll(n => n.props.role === 'option').length, 0);
});

test('exact lookup preserves shared-number choices and manual fallback', () => {
  const app = component();
  app.field('phone').props.onChange('5551234567'); app.render();
  app.lookup(); app.render();
  assert.equal(app.findAll(n => n.props.role === 'option').length, 2);
  app.field('phone').props.onChange('5550000000'); app.render();
  app.lookup(); app.render();
  assert.equal(app.field('name').props.value, '');
  assert.equal(app.requests.length, 0);
});

test('missing database permits manual entry', () => {
  const app = component(null);
  app.field('phone').props.onChange('5550000000'); app.render();
  app.lookup(); app.render();
  assert.equal(app.field('name').props.value, '');
});

test('all generated records are queryable and suggestions are limited to eight', () => {
  const context = vm.createContext({window:{}});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../reg/contacts-db.js'), 'utf8'),context);
  const app = setup(context.window.REG_CONTACTS_DB);
  assert.equal(app.run('contactDatabase.error'),null);
  assert.equal(app.run('contactDatabase.contacts.length'),160);
  assert.equal(app.run('contactDatabase.contacts.every(c => loadContact(c.phone).contacts.includes(c))'),true);
  assert.equal(app.run('filterContacts(Array.from({length:20}, (_,i) => ({phone:"55"+i})),"55").length'),8);
  assert.equal(app.requests.length,0);
});

test('only RSVP submission uses the network', async () => {
  const app = component();
  app.field('phone').props.onChange('5559876543'); app.render();
  app.lookup(); app.render();
  assert.equal(app.requests.length,0);
  app.findAll(n => n.type === 'input' && n.props.value === 'Yajman Couple')[0].props.onChange(); app.render();
  await app.findAll(n => n.type === 'form')[0].props.onSubmit({preventDefault() {}});
  assert.equal(app.requests.length,1);
  assert.ok(app.requests[0].url.endsWith('/api/register'));
  assert.equal(JSON.parse(app.requests[0].body).name,'Third');
});

test('participation choice starts empty, blocks submission, and is included in payload', async () => {
 const app=component();app.field('phone').props.onChange('5559876543');app.render();app.lookup();app.render();
 const button=()=>app.findAll(n=>n.type==='button' && n.props.type==='submit')[0];
 assert.equal(button().props.disabled,true);
 assert.equal(app.findAll(n=>n.type==='input' && n.props.type==='radio' && n.props.checked).length,0);
 await app.findAll(n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});assert.equal(app.requests.length,0);
 app.findAll(n=>n.type==='input' && n.props.value==='Yajman Single')[0].props.onChange();app.render();
 assert.equal(button().props.disabled,false);
 await app.findAll(n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 assert.equal(JSON.parse(app.requests[0].body).yajmanType,'Yajman Single');
});

test('WhatsApp consent requires email and is sent in registration payload', async () => {
 const app=component();app.field('phone').props.onChange('5559876543');app.render();app.lookup();app.render();
 app.findAll(n=>n.type==='input' && n.props.value==='Yajman Couple')[0].props.onChange();app.render();
 app.findAll(n=>n.type==='input' && n.props.name==='whatsappOptIn')[0].props.onChange({target:{checked:true}});app.render();
 app.field('email').props.onChange('');app.render();
 assert.equal(app.findAll(n=>n.type==='button' && n.props.type==='submit')[0].props.disabled,true);
 app.field('email').props.onChange('test@example.com');app.render();
 await app.findAll(n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 assert.equal(JSON.parse(app.requests[0].body).whatsappOptIn,true);
 assert.ok(JSON.parse(app.requests[0].body).requestId);
});
test('network retries keep the same registration ID',async()=>{
 const app=setup();
 await app.run('submitRsvp({phone:"5559876543",name:"Test",yajmanType:"Yajman Single",whatsappOptIn:false})');
 await app.run('submitRsvp({phone:"5559876543",name:"Test",yajmanType:"Yajman Single",whatsappOptIn:false})');
 assert.equal(JSON.parse(app.requests[0].body).requestId,JSON.parse(app.requests[1].body).requestId);
});
