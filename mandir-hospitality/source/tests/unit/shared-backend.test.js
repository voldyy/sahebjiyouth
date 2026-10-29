import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHarness } from '../helpers/apps-script-harness.js';
import { guestsFromRows } from '../../src/lib/sheets.js';
import { stayRange } from '../../src/lib/occupancy.js';
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
test('room 203 accepts its four beds and rejects a fifth bed or overlapping stay',()=>{
  const h=createHarness([header(),row('A'),row('B')]);
  const [a,b]=guestsFromRows(h.rows);
  const assign=(guest,bed)=>request(h,{action:'lodging',identity:guest.sourceIdentity,expected:guest.sourceLodging,
    stay:stayRange(guest),assignment:{lodging:'Samarpan',roomNo:'203',roomCode:`S203B${bed}`}});
  assert.match(assign(a,5).error,/valid bed/);
  assert.equal(assign(a,4).ok,true);
  assert.deepEqual(h.rows[1].slice(29),['Samarpan','203','S203B4']);
  assert.match(assign(b,4).error,/occupied/);
  assert.equal(assign(b,1).ok,true);
});
test('fresh stay changes and stale lodging are rejected; row sorting uses stable identity',()=>{
  const h=createHarness([header(),row('A'),row('B')]);const [a,b]=guestsFromRows(h.rows);
  h.rows[1][12]='10/19/2026';assert.match(lodging(h,a).error,/dates changed/);
  h.rows[2][29]='Hawthorn';assert.match(lodging(h,b).error,/Someone changed/);
  h.rows[1][12]='10/18/2026 2:00 PM';h.rows.reverse();h.rows.unshift(h.rows.pop());
  assert.equal(lodging(h,a).ok,true);assert.equal(h.rows.find(r=>r[0]==='A')[31],'S204B1');
});
test('room assignments accept mixed date formats and reordered RPC stay keys',()=>{
  for (const departure of ['10/20/2026', '10/20/2026 3:30 PM', '2026-10-20']) {
    const attendee=row('Mixed dates');attendee[13]=departure;
    const h=createHarness([header(),attendee]);
    const guest=guestsFromRows(h.request({action:'snapshot'}).rows)[0];
    const stay=stayRange(guest);
    const result=request(h,{action:'lodging',identity:guest.sourceIdentity,expected:guest.sourceLodging,
      stay:{end:stay.end,start:stay.start},assignment:{roomCode:'S101B4',roomNo:'101',lodging:'Samarpan'}});
    assert.equal(result.ok,true,result.error);
    assert.deepEqual(h.rows[1].slice(29),['Samarpan','101','S101B4']);
    assert.deepEqual(h.rows[1].slice(0,29),attendee.slice(0,29));
  }
});
test('RPC stay comparison retains accommodation overrides, stale-date and conflict checks',()=>{
  const attendee=row('Override');attendee[13]='10/20/2026';attendee[21]='10/17/2026';attendee[22]='10/21/2026';
  const h=createHarness([header(),attendee,row('Other')]);
  const guest=guestsFromRows(h.rows)[0];const stay=stayRange(guest);
  const req={action:'lodging',identity:guest.sourceIdentity,expected:guest.sourceLodging,
    stay:{end:stay.end,start:stay.start},assignment:{lodging:'Samarpan',roomNo:'101',roomCode:'S101B4'}};
  for (const [column,date] of [[21,'10/16/2026'],[22,'10/22/2026']]) {
    const before=h.rows[1][column];h.rows[1][column]=date;
    assert.match(request(h,req).error,/dates changed/);h.rows[1][column]=before;
  }
  assert.match(request(h,{...req,stay:null}).error,/dates changed/);
  assert.equal(h.writes.length,0);
  assert.equal(request(h,req).ok,true);
  const other=guestsFromRows(h.rows)[1];
  assert.match(request(h,{...req,identity:other.sourceIdentity,expected:other.sourceLodging,
    stay:{end:other.departureDate,start:other.arrivalDate}}).error,/occupied/);
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
test('multiple driver pairs persist, validate resources, protect secondary resources and detect sheet edits',()=>{
  const h=createHarness([header(),row('A')]);
  for (const [type,names] of [['Driver',['First','Second','Third']],['Vehicle',['Van','Car','SUV']]]) for (const name of names) assert.equal(request(h,{action:'resource',type,name,active:true}).ok,true);
  const g=transportGroups(guestsFromRows(h.rows),'Arrivals')[0];
  const req={action:'transport',id:g.id,direction:g.direction,signature:g.signature,expectedRevision:'',plan:{driver:'First',vehicle:'Van',status:'Planned',pickup:'',notes:'',additionalDrivers:[{driver:'Second',vehicle:'Car'},{driver:'Third',vehicle:'SUV'}]}};
  const result=request(h,req);assert.equal(result.ok,true,result.error);
  let plan=h.request({action:'snapshot'}).transport.assignments[0];
  assert.deepEqual(plan.additionalDrivers,req.plan.additionalDrivers);
  for(const [type,name] of [['Driver','Second'],['Vehicle','SUV']]) assert.match(request(h,{action:'resource',type,name,active:false}).error,/active journey/);
  for(const additionalDrivers of [[{driver:'First',vehicle:'Car'}],[{driver:'Second',vehicle:'Van'}],[{driver:'Inactive',vehicle:'Car'}],[{driver:'Second',vehicle:'Missing'}]]) {
    const denied=request(h,{...req,expectedRevision:plan.revision,expectedPlan:plan,plan:{...plan,additionalDrivers}});
    assert.equal(denied.ok,false);assert.deepEqual(h.request({action:'snapshot'}).transport.assignments[0],plan);
  }
  const crewRow=h.sheets.get('Transport Crew').rows[1];
  const old=crewRow[1];crewRow[1]=JSON.stringify([{driver:'Third',vehicle:'SUV'}]);
  assert.match(request(h,{...req,expectedRevision:plan.revision,expectedPlan:plan}).error,/edited this journey/);crewRow[1]=old;
  const removed=request(h,{...req,expectedRevision:plan.revision,expectedPlan:plan,plan:{...plan,additionalDrivers:[]}});
  assert.equal(removed.ok,true);assert.deepEqual(removed.transport.assignments[0].additionalDrivers,[]);
  assert.equal(request(h,{action:'resource',type:'Driver',name:'Second',active:false}).ok,true);
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
