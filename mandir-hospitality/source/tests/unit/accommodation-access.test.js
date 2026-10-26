import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHarness } from '../helpers/apps-script-harness.js';
import { guestsFromRows } from '../../src/lib/sheets.js';
import { transportGroups } from '../../src/lib/transport.js';
import { linenBeds, allentownDay } from '../../src/lib/housekeeping.js';
import { unassignedGuest } from '../../src/lib/occupancy.js';
const header = () => { const r = Array(32).fill(''); Object.assign(r, {0:'Registration ID',8:'Attendee Full Name',29:'Lodging',30:'Room No.',31:'Room Code'}); return r; };
const row = (id, start='2026-10-11', end='2026-10-14', bed='') => { const r=Array(32).fill(''); Object.assign(r,{0:id,8:id,9:'Self',12:start,13:end,20:'YES',24:'Confirmed',29:bed?'Samarpan':'',30:bed?'204':'',31:bed}); return r; };
const req = (h,r) => h.request({requestId:randomUUID(),...r});
const assign = (h, guest, assignment) => req(h, {action:'lodging',identity:guest.sourceIdentity,expected:guest.sourceLodging,stay:{start:guest.arrivalDate,end:guest.departureDate},assignment});
test('viewers receive all dashboard data but cannot mutate it', () => {
  const h=createHarness([header(),row('Private Guest')]);
  h.rows[1][7]='Edison, NJ';
  h.rows[1][5]='555-010-1234';
  for (const accessKey of ['',undefined,'forged']) {
    for (const action of ['lodging','offsite','linen','transport','resource']) {
      const result=req(h,{action,accessKey,role:'admin'});
      assert.equal(result.ok,false); assert.match(result.error,/Admin access/);
    }
    const snapshot=h.request({action:'snapshot',accessKey,role:'admin'});
    assert.equal(snapshot.role,'viewer');
    assert.equal(snapshot.rows,undefined);
    assert.deepEqual(snapshot.transport,{assignments:[],drivers:[],vehicles:[]});
    assert.equal(snapshot.offsiteRooms.filter(r=>r.lodging==='Hawthorn').length,15);
    assert.equal(snapshot.offsiteRooms.filter(r=>r.lodging==='Hilton Garden Inn').length,0);
    assert.deepEqual(snapshot.offsiteRooms.filter(r=>r.lodging==='Hawthorn').map(r=>r.label),Array.from({length:15},(_,i)=>`R${String(i+1).padStart(2,'0')}`));
    assert.ok(snapshot.offsiteRooms.every(r=>r.beds===4&&r.physicalBeds===2&&r.peoplePerBed===2));
    assert.deepEqual(snapshot.housekeeping,[]);
    assert.equal(snapshot.guests[0].name,'Private Guest');
    assert.equal(snapshot.guests[0].city,'Edison, NJ');
    assert.equal(snapshot.kitchenGuests[0].name,'Private Guest');
    assert.equal(snapshot.kitchenGuests[0].city,'Edison, NJ');
    assert.equal(snapshot.kitchenGuests[0].phone,undefined);
    assert.equal(snapshot.kitchenGuests[0].registrationId,undefined);
    assert.equal(snapshot.kitchenGuests[0].roomCode,undefined);
    assert.equal(snapshot.kitchenGuests[0].count,1);
  }
  h.rows[1][29]='Samarpan';h.rows[1][30]='204';h.rows[1][31]='S204B1';
  h.setToday('2026-10-14');
  assert.equal(h.request({action:'snapshot',accessKey:''}).housekeeping.length,1);
  assert.equal(h.sheets.size,1); assert.equal(h.writes.length,0);
  h.properties.delete('ADMIN_ACCESS_KEY');
  assert.match(req(h,{action:'resource',type:'Driver',name:'Intruder',active:true}).error,/Admin access/);
});
test('hotel slots fit two guests per bed, enforce four-person capacity and survive actual numbering', () => {
  const h=createHarness([header(),row('A'),row('B'),row('D'),row('C','2026-10-14','2026-10-16')]);
  const room=h.request({action:'snapshot'}).offsiteRooms.find(r=>r.id==='hawthorn-r01');
  assert.deepEqual([room.label,room.physicalBeds,room.peoplePerBed,room.beds],['R01',2,2,4]);
  const assignment={lodging:'Hawthorn',roomNo:'',roomCode:`O${room.id}B1`};
  assert.equal(assign(h,guestsFromRows(h.rows)[0],assignment).ok,true);
  assert.equal(unassignedGuest(guestsFromRows(h.rows)[0]),false);
  assert.equal(assign(h,guestsFromRows(h.rows)[1],{...assignment,roomCode:`O${room.id}B2`}).ok,true);
  assert.match(assign(h,guestsFromRows(h.rows)[2],assignment).error,/occupied/);
  assert.equal(assign(h,guestsFromRows(h.rows)[2],{...assignment,roomCode:`O${room.id}B3`}).ok,true);
  assert.equal(assign(h,guestsFromRows(h.rows)[3],assignment).ok,true);
  assert.match(assign(h,guestsFromRows(h.rows)[2],{...assignment,roomCode:`O${room.id}B5`}).error,/valid room and bed/);
  const updated=req(h,{action:'offsite',id:room.id,expectedRevision:room.revision,lodging:'Hawthorn',roomNo:'021',beds:4});
  assert.equal(updated.ok,true);assert.equal(h.rows[1][30],'021');assert.equal(h.rows[2][30],'021');assert.equal(h.rows[3][30],'021');assert.equal(h.rows[4][30],'021');
  assert.equal(h.rows[1][31],assignment.roomCode);
  assert.match(assign(h,guestsFromRows(h.rows)[1],{...assignment,roomCode:`O${room.id}B4`}).error,/room changed/);
  assert.match(req(h,{action:'offsite',id:room.id,expectedRevision:room.revision,lodging:'Hawthorn',roomNo:'022',beds:4}).error,/room changed/);
  assert.match(req(h,{action:'offsite',id:room.id,expectedRevision:updated.offsiteRooms.find(r=>r.id===room.id).revision,lodging:'Hawthorn',roomNo:'022',beds:2}).error,/fixed capacity/);
  assert.match(req(h,{action:'offsite',lodging:'Hawthorn',roomNo:'021',beds:2}).error,/already/);
  assert.equal(req(h,{action:'offsite',lodging:'Hilton Garden Inn',roomNo:'021',beds:2}).ok,false);
});
test('Hawthorn room type changes switch a default slot between four and two spots', () => {
  const h=createHarness([header(),row('A')]);
  const room=h.request({action:'snapshot'}).offsiteRooms.find(r=>r.id==='hawthorn-r01');
  assert.equal(room.beds,4); assert.equal(room.physicalBeds,2);
  const changed=req(h,{action:'offsite',id:room.id,expectedRevision:room.revision,lodging:'Hawthorn',roomNo:'',roomType:'king',beds:2});
  assert.equal(changed.ok,true);
  const updated=changed.offsiteRooms.find(r=>r.id===room.id);
  assert.deepEqual([updated.beds,updated.physicalBeds,updated.peoplePerBed],[2,1,2]);
  const restored=req(h,{action:'offsite',id:updated.id,expectedRevision:updated.revision,lodging:'Hawthorn',roomNo:'',roomType:'doubleQueen',beds:4});
  assert.equal(restored.ok,true);
  assert.equal(restored.offsiteRooms.find(r=>r.id===room.id).beds,4);
});
test('checkout linen state persists, rejects stale clears, and becomes dirty on the next checkout', () => {
  const h=createHarness([header(),row('A','2026-10-11','2026-10-14','S204B1'),row('B','2026-10-14','2026-10-16','S204B1'),row('Cancelled','2026-10-11','2026-10-13','S204B2')]);
  h.rows[3][24]='Cancelled';
  assert.equal(h.request({action:'snapshot'}).housekeeping.length,0);
  h.setToday('2026-10-14');
  let snapshot=h.request({action:'snapshot'});let bed=linenBeds(snapshot.housekeeping)[0];
  assert.equal(bed.events.length,1);assert.equal(bed.roomCode,'S204B1');
  const cleanRequest={action:'linen',roomCode:bed.roomCode,expected:bed.events.map(e=>e.id),requestId:randomUUID()};
  assert.equal(h.request(cleanRequest).ok,true);assert.equal(h.request(cleanRequest).ok,true);
  assert.equal(linenBeds(h.request({action:'snapshot'}).housekeeping).length,0);
  h.setToday('2026-10-16');snapshot=h.request({action:'snapshot'});bed=linenBeds(snapshot.housekeeping)[0];
  assert.equal(bed.events.length,1);assert.equal(bed.events[0].name,'B');
  assert.match(req(h,{...cleanRequest,requestId:randomUUID()}).error,/checkout list changed/);
  const guest=guestsFromRows(h.rows)[1];
  assert.equal(assign(h,guest,{lodging:'',roomNo:'',roomCode:''}).ok,true);
  assert.equal(linenBeds(h.request({action:'snapshot'}).housekeeping)[0].events[0].name,'B');
  assert.equal(req(h,{action:'linen',roomCode:bed.roomCode,expected:bed.events.map(e=>e.id)}).ok,true);
});
test('Allentown checkout day does not roll forward at UTC midnight', () => {
  assert.equal(allentownDay(new Date('2026-10-15T02:00:00Z')),'2026-10-14');
  assert.equal(allentownDay(new Date('2026-11-02T04:59:00Z')),'2026-11-01');
});
test('bus arrival at ABE never uses a flight lookup or changes the return mode', () => {
  const r=row('Priya');Object.assign(r,{11:'Bus (arrival)',14:'ABE',15:'old flight',16:'PHL',17:'AA 123',18:'YES'});
  const guests=guestsFromRows([header(),r]);
  const arrival=transportGroups(guests,'Arrivals')[0];
  assert.equal(arrival.method,'Bus');assert.equal(arrival.airport,'ABE');assert.equal(arrival.flight,'');
  const departure=transportGroups(guests,'Departures')[0];assert.equal(departure.method,'Flight');assert.equal(departure.flight,'AA123');
});
test('extending a stay supersedes its pending linen task until the new checkout', () => {
  const h=createHarness([header(),row('A','2026-10-11','2026-10-14','S204B1')]);
  h.setToday('2026-10-14');
  assert.equal(linenBeds(h.request({action:'snapshot'}).housekeeping).length,1);
  h.rows[1][13]='2026-10-17';
  assert.equal(linenBeds(h.request({action:'snapshot'}).housekeeping).length,0);
  h.setToday('2026-10-17');
  assert.equal(linenBeds(h.request({action:'snapshot'}).housekeeping)[0].events[0].checkout,'2026-10-17');
});
