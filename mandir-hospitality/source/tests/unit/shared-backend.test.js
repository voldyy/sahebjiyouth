import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHarness } from '../helpers/apps-script-harness.js';
import { guestsFromRows } from '../../src/lib/sheets.js';
import { transportGroups,transportWithPlans } from '../../src/lib/transport.js';
const header=()=>{const r=Array(32).fill('');Object.assign(r,{0:'Registration ID',8:'Attendee Full Name',29:'Lodging',30:'Room No.',31:'Room Code'});return r;};
const row=(id,name=id)=>{const r=Array(32).fill('');Object.assign(r,{0:id,8:name,9:'Self',11:'Flight',12:'10/18/2026 2:00 PM',13:'10/20/2026 3:30 PM',14:'PHL',15:'AA 123',16:'EWR',17:'UA 456',18:'YES',20:'YES',24:'Confirmed'});return r;};
const request=(h,req)=>h.request({...req,requestId:randomUUID()});
function lodging(h,guest,code='S204B1'){return request(h,{action:'lodging',identity:guest.sourceIdentity,expected:guest.sourceLodging,stay:{start:'2026-10-18',end:'2026-10-20'},assignment:{lodging:'Samarpan',roomNo:'204',roomCode:code}});}
test('serialized backend prevents overlapping reservations, preserves other fields and records changes',()=>{
  const h=createHarness([header(),row('A'),row('B')]); const [a,b]=guestsFromRows(h.rows);
  assert.equal(lodging(h,a).ok,true);
  const denied=lodging(h,b);assert.equal(denied.ok,false);assert.match(denied.error,/occupied/);
  assert.deepEqual(h.rows[1].slice(0,29),row('A').slice(0,29));
  assert.equal(h.sheets.get('Assignment History').rows.length,2);
});
test('fresh stay changes and stale lodging are rejected; row sorting uses stable identity',()=>{
  const h=createHarness([header(),row('A'),row('B')]);const [a,b]=guestsFromRows(h.rows);
  h.rows[1][12]='10/19/2026';assert.match(lodging(h,a).error,/dates changed/);
  h.rows[2][29]='Comfort Inn';assert.match(lodging(h,b).error,/Someone changed/);
  h.rows[1][12]='10/18/2026 2:00 PM';h.rows.reverse();h.rows.unshift(h.rows.pop());
  assert.equal(lodging(h,a).ok,true);assert.equal(h.rows.find(r=>r[0]==='A')[31],'S204B1');
});
test('transport groups share services by date/airport/direction and keep unknown services separate',()=>{
  const rows=[header(),row('A'),row('B'),row('C')];rows[3][14]='JFK';
  const guests=guestsFromRows(rows);assert.equal(transportGroups(guests,'Arrivals').length,2);assert.equal(transportGroups(guests,'Departures').length,1);
  guests[0].arrivalFlight='';guests[1].arrivalFlight='';assert.equal(transportGroups(guests,'Arrivals').length,3);
});
test('transport saves survive new snapshots, reject stale versions, and protect active resources',()=>{
  const h=createHarness([header(),row('A'),row('B')]);
  assert.equal(request(h,{action:'resource',type:'Driver',name:'Test Driver',active:true}).ok,true);
  assert.equal(request(h,{action:'resource',type:'Vehicle',name:'Test Van',active:true}).ok,true);
  const g=transportGroups(guestsFromRows(h.rows),'Arrivals')[0];
  const req={action:'transport',id:g.id,direction:g.direction,signature:g.signature,expectedRevision:'',plan:{driver:'Test Driver',vehicle:'Test Van',status:'Planned',pickup:'2026-10-18T14:30',notes:'Terminal 1'}};
  const saved=request(h,req);assert.equal(saved.ok,true);assert.equal(saved.transport.assignments[0].notes,'Terminal 1');
  assert.match(request(h,req).error,/Another admin/);
  assert.match(request(h,{action:'resource',type:'Driver',name:'Test Driver',active:false}).error,/active journey/);
  h.rows[1][12]='10/19/2026';assert.match(request(h,req).error,/travel details/);
});
test('retry identifiers do not duplicate mutations and formula-like fields remain literal text',()=>{
  const h=createHarness([header(),row('A')]); const req={action:'resource',type:'Vehicle',name:'=1+1',active:true,requestId:randomUUID()};
  assert.equal(h.request(req).ok,true);assert.equal(h.request(req).ok,true);
  assert.equal(h.sheets.get('Assignment History').rows.length,2);assert.equal(h.sheets.get('Transport Resources').rows[1][1],'=1+1');
});
test('suggested departure respects midnight and is calculated before display filtering',()=>{
  const g=transportGroups(guestsFromRows([header(),row('A')]),'Departures');g[0].time='01:00';
  assert.equal(transportWithPlans(g,[])[0].suggestedPickup,'2026-10-19T22:00');
});
