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
test('walk-in saves guest and bed together, rejects full-stay conflicts without creating a guest, and permits checkout reuse', () => {
  const h=createHarness([headers]);
  const assignment={lodging:'Samarpan',roomNo:'204',roomCode:'S204B3'};
  const request={action:'guest',requestId:randomUUID(),guest:{name:'Walk In',arrivalDate:'2026-10-18',departureDate:'2026-10-20',overnight:'YES'},assignment};
  assert.equal(h.request(request).ok,true);
  assert.deepEqual(h.rows[1].slice(29),['Samarpan','204','S204B3']);
  assert.equal(h.request(request).ok,true);assert.equal(h.rows.length,2);
  const conflict=h.request({...request,requestId:randomUUID(),guest:{...request.guest,name:'Overlapping',arrivalDate:'2026-10-19'}});
  assert.match(conflict.error,/occupied/);assert.equal(h.rows.length,2);
  assert.equal(h.request({...request,requestId:randomUUID(),guest:{...request.guest,name:'Next Guest',arrivalDate:'2026-10-20',departureDate:'2026-10-21'}}).ok,true);
  const invalid=h.request({...request,requestId:randomUUID(),assignment:{...assignment,roomCode:'S204B4'}});
  assert.match(invalid.error,/valid bed/);assert.equal(h.rows.length,3);
  assert.equal(h.request({...request,requestId:randomUUID(),accessKey:''}).ok,false);
});
test('walk-in supports provisional offsite beds and preserves the planning code', () => {
  const h=createHarness([headers]);
  const added=h.request({action:'offsite',requestId:randomUUID(),lodging:'Comfort Inn',roomNo:'',beds:2});
  const room=added.offsiteRooms[0];
  const assignment={lodging:'Comfort Inn',roomNo:'',roomCode:`O${room.id}B1`};
  const guest={name:'Offsite Walk In',arrivalDate:'2026-10-18',departureDate:'2026-10-20',overnight:'YES'};
  const result=h.request({action:'guest',requestId:randomUUID(),guest,assignment});
  assert.equal(result.ok,true,result.error);
  assert.deepEqual(h.rows[1].slice(29),['Comfort Inn','',assignment.roomCode]);
  assert.match(h.request({action:'guest',requestId:randomUUID(),guest:{...guest,name:'Conflict'},assignment}).error,/occupied/);
  assert.equal(h.rows.length,2);
});

test('Sadhak walk-ins preserve the building and reject out-of-range and overlapping beds', () => {
  const h=createHarness([headers]);
  const assignment={lodging:'Sadhak',roomNo:'201',roomCode:'SD201B1'};
  const request={action:'guest',requestId:randomUUID(),guest:{name:'Sadhak Walk In',arrivalDate:'2026-10-18',departureDate:'2026-10-20',overnight:'YES'},assignment};
  assert.equal(h.request(request).ok,true);
  assert.deepEqual(h.rows[1].slice(29),['Sadhak','201','SD201B1']);
  const send=assignment=>h.request({...request,requestId:randomUUID(),guest:{...request.guest,name:'Another Guest'},assignment});
  assert.match(send(assignment).error,/occupied/);
  assert.match(send({...assignment,roomCode:'SD201B2'}).error,/valid bed/);
  assert.equal(h.rows.length,2);
});
