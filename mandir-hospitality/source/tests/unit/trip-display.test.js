import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHarness } from '../helpers/apps-script-harness.js';
import { guestsFromRows } from '../../src/lib/sheets.js';
import { transportGroups, tripCollapsed } from '../../src/lib/transport.js';
import { allentownInstant, dayCollapseAt, dayCollapsed, dayDisplayId, tripCollapseAt } from '../../src/lib/transportDisplay.js';
const headers=Array(32).fill('');Object.assign(headers,{0:'Registration ID',8:'Attendee Full Name',29:'Lodging',30:'Room No.',31:'Room Code'});
const row=Array(32).fill('');Object.assign(row,{0:'TEST',8:'Traveller',11:'BUS',12:'2026-10-11',13:'2026-11-01',14:'ABE'});
test('six elapsed hours collapses arrivals and departures and expires earlier shared expansion', () => {
  for (const direction of ['Arrivals','Departures']) {
    const group={id:direction,day:'2026-10-14',time:'10:30',direction};
    const cutoff=Date.parse('2026-10-14T20:30:00Z');
    assert.equal(tripCollapseAt(group),cutoff);
    assert.equal(tripCollapsed(group,[],cutoff-1),false);
    assert.equal(tripCollapsed(group,[],cutoff),true);
    assert.equal(tripCollapsed(group,[{id:group.id,collapsed:false,updatedAt:'2026-10-14T20:29:59Z'}],cutoff),true);
    assert.equal(tripCollapsed(group,[{id:group.id,collapsed:false,updatedAt:'2026-10-14T20:30:01Z'}],cutoff+2000),false);
  }
});
test('8 AM minimizes yesterday and every older date, including late trips and date-only trips', () => {
  const before=Date.parse('2026-10-14T11:59:59.999Z'), at=before+1;
  assert.equal(dayCollapsed('2026-10-13',[],before),false);
  assert.equal(dayCollapsed('2026-10-13',[],at),true);
  assert.equal(dayCollapsed('2026-10-12',[],before),true);
  assert.equal(dayCollapsed('2026-10-14',[],at),false);
  assert.equal(dayCollapsed('2026-10-15',[],at),false);
  const group={id:'late',day:'2026-10-13',time:'23:30'};
  assert.equal(tripCollapsed(group,[],Date.parse('2026-10-14T09:29:59Z')),false);
  assert.equal(tripCollapsed(group,[],Date.parse('2026-10-14T09:30:00Z')),true);
  const dateOnly={...group,time:'00:00',timeKnown:false};
  assert.equal(tripCollapseAt(dateOnly),null);
  assert.equal(tripCollapsed(dateOnly,[],before),false);
  assert.equal(tripCollapsed(dateOnly,[],at),true);
  assert.equal(dayCollapseAt('',at),null);
});
test('old days can be reopened after 8 AM and minimize again at the next morning cutoff', () => {
  const id=dayDisplayId('2026-10-13');
  const saved=[{id,collapsed:false,updatedAt:'2026-10-14T13:00:00Z'}];
  assert.equal(dayCollapsed('2026-10-13',saved,Date.parse('2026-10-14T14:00:00Z')),false);
  assert.equal(dayCollapsed('2026-10-13',saved,Date.parse('2026-10-15T11:59:59Z')),false);
  assert.equal(dayCollapsed('2026-10-13',saved,Date.parse('2026-10-15T12:00:00Z')),true);
  assert.equal(dayCollapsed('2026-10-13',[{id,collapsed:false,revision:'legacy-uuid'}],Date.parse('2026-10-14T12:00:00Z')),true);
});
test('cutoffs retain six elapsed hours across DST and wait for the last recorded time in grouped trips', () => {
  assert.equal(allentownInstant('2026-11-01','00:30'),Date.parse('2026-11-01T04:30:00Z'));
  assert.equal(tripCollapseAt({day:'2026-11-01',time:'00:30'}),Date.parse('2026-11-01T10:30:00Z'));
  assert.equal(allentownInstant('2026-11-01','01:30'),Date.parse('2026-11-01T06:30:00Z'));
  assert.equal(allentownInstant('2026-03-08','02:30'),null);
  assert.equal(allentownInstant('2026-02-30','12:00'),null);
  assert.equal(dayCollapseAt('2026-10-31',Date.parse('2026-11-01T13:00:00Z')),Date.parse('2026-11-01T13:00:00Z'));
  assert.equal(tripCollapseAt({day:'2026-10-14',time:'10:30',latestTime:'11:15'}),Date.parse('2026-10-14T21:15:00Z'));
});
test('viewer display changes reach all snapshots and cannot modify assignments or roster data', () => {
  const h=createHarness([headers,row]);
  const group=transportGroups(guestsFromRows(h.rows),'Arrivals')[0];
  assert.deepEqual(h.request({action:'trip-display-read',accessKey:''}).tripDisplay,[]);
  assert.equal(h.sheets.size,1);
  const request={action:'trip-display',id:group.id,collapsed:false,requestId:randomUUID(),accessKey:'',assignment:{lodging:'Samarpan',roomNo:'204',roomCode:'S204B1'}};
  assert.equal(h.request(request).ok,true);
  const saved=h.request({action:'snapshot'}).tripDisplay;
  assert.equal(saved[0].collapsed,false);
  assert.deepEqual(h.request({action:'snapshot',accessKey:''}).tripDisplay,saved);
  assert.deepEqual(h.rows,[headers,row]);assert.equal(h.writes.length,0);
  assert.equal(h.sheets.has('Transport Assignments'),true); // Created only by the admin snapshot above.
  assert.equal(h.sheets.get('Transport Assignments').rows.length,1);
  assert.equal(h.request(request).ok,true);
  assert.deepEqual(h.request({action:'trip-display-read'}).tripDisplay,saved);
  assert.equal(h.request({...request,id:'missing',requestId:randomUUID()}).ok,false);
  assert.equal(h.request({...request,collapsed:'Yes',requestId:randomUUID()}).ok,false);
  assert.match(h.request({action:'transport',accessKey:'',requestId:randomUUID()}).error,/Admin access/);
  const dayRequest={...request,id:dayDisplayId(group.day),requestId:randomUUID()};
  assert.equal(h.request(dayRequest).ok,true);
  const dayState=h.request({action:'snapshot',accessKey:''}).tripDisplay.find(r=>r.id===dayRequest.id);
  assert.equal(dayState.collapsed,false);assert.match(dayState.updatedAt,/^\d{4}-\d{2}-\d{2}T/);
  assert.equal(h.request({...dayRequest,id:dayDisplayId('2030-01-01'),requestId:randomUUID()}).ok,false);
  assert.deepEqual(h.rows,[headers,row]);
});
