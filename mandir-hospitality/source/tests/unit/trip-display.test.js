import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHarness } from '../helpers/apps-script-harness.js';
import { guestsFromRows } from '../../src/lib/sheets.js';
import { transportGroups, tripCollapsed } from '../../src/lib/transport.js';
const headers=Array(32).fill('');Object.assign(headers,{0:'Registration ID',8:'Attendee Full Name',29:'Lodging',30:'Room No.',31:'Room Code'});
const row=Array(32).fill('');Object.assign(row,{0:'TEST',8:'Traveller',11:'BUS',12:'2026-10-11',13:'2026-11-01',14:'ABE'});
test('past trips default collapsed while explicit shared settings override defaults', () => {
  const group={id:'past',day:'2026-10-11'};
  assert.equal(tripCollapsed(group,[],'2026-10-13'),true);
  assert.equal(tripCollapsed({...group,day:'2026-10-13'},[],'2026-10-13'),false);
  assert.equal(tripCollapsed({...group,day:'2026-11-01'},[],'2026-10-13'),false);
  assert.equal(tripCollapsed(group,[{id:'past',collapsed:false}],'2026-10-13'),false);
  assert.equal(tripCollapsed({...group,plan:{status:'Completed'}},[],'2026-10-13'),true);
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
});
