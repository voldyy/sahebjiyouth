import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHarness } from '../helpers/apps-script-harness.js';
import { guestsFromRows } from '../../src/lib/sheets.js';
import { transportGroups } from '../../src/lib/transport.js';
import { crewForPlan } from '../../src/lib/transportCrew.js';
import { readDriverConfirmations } from '../../src/lib/transportConfirmation.js';
const request = (h, req) => h.request({ ...req, requestId: randomUUID() });
function fixture() {
  const header = Array(32).fill(''); Object.assign(header, { 0:'Registration ID', 8:'Attendee Full Name', 29:'Lodging', 30:'Room No.', 31:'Room Code' });
  const row = Array(32).fill(''); Object.assign(row, { 0:'TEST',8:'Traveller',9:'Self',11:'Flight',12:'11/4/2026 2:00 PM',13:'11/8/2026 4:00 PM',14:'ABE',15:'AA123',18:'YES',24:'Confirmed' });
  const h = createHarness([header,row]);
  for (const name of ['First','Second','Third']) assert.equal(request(h,{action:'resource',type:'Driver',name,active:true}).ok,true);
  const group = transportGroups(guestsFromRows(h.rows),'Arrivals')[0];
  const plan = () => h.request({action:'snapshot'}).transport.assignments[0];
  const save = (next, confirmation, expected = plan()) => request(h, {action:'transport',id:group.id,direction:group.direction,signature:group.signature,expectedRevision:expected?.revision || '',expectedPlan:expected,plan:next, ...(confirmation ? { confirmation } : {})});
  return {h,group,plan,save};
}
test('draft drivers persist, confirmation locks without a vehicle, and unlock/reconfirm gets a new token', () => {
  const {h,plan,save}=fixture();
  assert.equal(save({driver:'First',vehicle:'',status:'Planned',pickup:'',notes:'',additionalDrivers:[{driver:'Second',vehicle:''}]}).ok,true);
  assert.deepEqual(plan().driverConfirmations,{});
  assert.ok(crewForPlan(plan()).every(pair=>!pair.confirmation));
  assert.equal(save(plan(),{driver:'First',confirmed:true}).ok,true);
  const locked=plan(),token=locked.driverConfirmations.first;
  assert.match(token,/^[a-zA-Z0-9-]{20,80}$/);
  assert.equal(locked.vehicle,''); assert.equal(crewForPlan(locked)[1].confirmation,'');
  assert.match(save({...locked,driver:'Third'}).error,/Unlock/);
  assert.match(save(locked,{driver:'Second',confirmed:true}, {...locked,revision:'stale'}).error,/Another admin/);
  assert.equal(save(locked,{driver:'First',confirmed:false}).ok,true);
  assert.deepEqual(plan().driverConfirmations,{});
  assert.equal(save(plan(),{driver:'First',confirmed:true}).ok,true);
  assert.notEqual(plan().driverConfirmations.first,token);
  assert.equal(save(plan(),{driver:'Second',confirmed:true}).ok,true);
  assert.ok(crewForPlan(plan()).every(pair=>pair.confirmation));
  assert.deepEqual(JSON.parse(h.sheets.get('Transport Confirmations').rows[1][1]),plan().driverConfirmations);
});
test('unconfirmed changes and older clients cannot confirm a driver by submitting a map', () => {
  const {plan,save}=fixture();
  assert.equal(save({driver:'First',vehicle:'',status:'Planned',pickup:'',notes:'',driverConfirmations:{first:'legacy'}}).ok,true);
  assert.deepEqual(plan().driverConfirmations,{});
  assert.match(save({...plan(),driver:'Second'},{driver:'Second',confirmed:true}).error,/Save a driver selection/);
  assert.equal(save({...plan(),driver:'Second'}).ok,true);
  assert.deepEqual(plan().driverConfirmations,{});
  assert.equal(save(plan(),{driver:'Third',confirmed:true}).ok,false);
});
test('legacy assignments retain their lock and invalid confirmation records fail closed', () => {
  const {h,group,plan}=fixture();
  h.request({action:'snapshot'});
  h.sheets.get('Transport Assignments').rows.push([group.id,group.direction,group.day,'AA123','ABE','Traveller','First','','','Planned','','legacy-revision','','']);
  assert.deepEqual(plan().driverConfirmations,{first:'legacy'});
  assert.equal(crewForPlan(plan())[0].confirmation,'legacy');
  for(const raw of ['[]','null','{"First":"legacy"}','{"first":false}']) assert.throws(()=>readDriverConfirmations(raw),/Invalid/);
});

test('direct Sheet driver changes become drafts and stale confirmation keys do not block repair', () => {
  const {h,plan,save}=fixture();
  assert.equal(save({driver:'First',vehicle:'',status:'Planned',pickup:'',notes:''}).ok,true);
  assert.equal(save(plan(),{driver:'First',confirmed:true}).ok,true);
  h.sheets.get('Transport Assignments').rows[1][6]='Second';
  assert.equal(crewForPlan(plan())[0].confirmation,'');
  assert.equal(save(plan(),{driver:'Second',confirmed:true}).ok,true);
  assert.deepEqual(Object.keys(plan().driverConfirmations),['second']);
});
