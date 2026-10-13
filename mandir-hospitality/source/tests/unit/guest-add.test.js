import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHarness } from '../helpers/apps-script-harness.js';
const headers = Array(32).fill('');
Object.assign(headers, {0:'Registration ID',8:'Attendee Full Name',29:'Lodging',30:'Room No.',31:'Room Code'});
test('admin guest creation saves a single attendee, preserves optional blanks and is retry-safe', () => {
  const h=createHarness([headers]);
  const request={action:'guest',requestId:randomUUID(),guest:{name:'Synthetic Guest',arrivalDate:'2026-10-18',departureDate:'2026-10-20',overnight:'YES',phone:'00123',notes:'First line\nSecond line'}};
  const result=h.request(request);
  assert.equal(result.ok,true,result.error);
  assert.equal(h.rows.length,2);
  assert.equal(h.rows[1][5],'00123');assert.equal(h.rows[1][8],'Synthetic Guest');
  assert.equal(h.rows[1][12],'2026-10-18');assert.equal(h.rows[1][21],'2026-10-18');
  assert.equal(h.rows[1][24],'');assert.deepEqual(h.rows[1].slice(29),['','','']);
  assert.equal(h.request(request).ok,true);assert.equal(h.rows.length,2);
  h.sheets.get('Assignment History').rows.splice(1);
  assert.equal(h.request(request).ok,true);assert.equal(h.rows.length,2);
});
test('guest creation rejects viewers and invalid dates without adding roster rows', () => {
  const h=createHarness([headers]);
  const send=(guest,extra={})=>h.request({action:'guest',requestId:randomUUID(),guest,...extra});
  assert.match(send({name:'Guest'},{accessKey:''}).error,/Admin access/);
  for(const guest of [{name:''},{name:'Guest',arrivalDate:'2026-02-30'},{name:'Guest',arrivalDate:'2026-10-20',departureDate:'2026-10-18'},{name:'Guest',arrivalTime:'12:00'}]) assert.equal(send(guest).ok,false);
  assert.equal(h.rows.length,1);
  assert.equal(send({name:'=Literal Name'}).ok,true);assert.equal(h.rows[1][8],'=Literal Name');
});
