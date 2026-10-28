import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { guestsFromRows } from '../../src/lib/sheets.js';
import { transportGroups, transportWithPlans } from '../../src/lib/transport.js';
import { createHarness } from '../helpers/apps-script-harness.js';

const header = () => { const r = Array(33).fill(''); Object.assign(r,{0:'Registration ID',8:'Attendee Full Name',18:'Airport Pickup Needed?',29:'Lodging',30:'Room No.',31:'Room Code',32:'Departure Dropoff Needed?'}); return r; };
const row = (id,pickup,dropoff) => { const r=Array(33).fill(''); Object.assign(r,{0:id,8:id,9:'Self',11:'FLIGHT',12:'2026-11-06 14:30',13:'2026-11-09 16:00',14:'ABE',15:'AA123',16:'EWR',17:'UA456',18:pickup,20:'YES',24:'Confirmed',32:dropoff});return r; };

test('pickup and dropoff choices independently include or exclude each flight leg',()=>{
  for(const pickup of ['YES','NO'])for(const dropoff of ['YES','NO']){
    const guests=guestsFromRows([header(),row('A',pickup,dropoff)]);
    assert.equal(transportGroups(guests,'Arrivals').length,pickup==='YES'?1:0);
    assert.equal(transportGroups(guests,'Departures').length,dropoff==='YES'?1:0);
  }
});
test('legacy and newly appended registration rows inherit the original transport choice until dropoff is set',()=>{
  for(const choice of ['YES','NO']){
    const r=row('A',choice,'');
    for(const headers of [header().slice(0,32),header()]){
      const g=guestsFromRows([headers,r])[0];
      assert.equal(g.airportPickup,g.airportDropoff);
    }
    r[32]=choice==='YES'?'NO':'YES';
    const g=guestsFromRows([header(),r])[0];assert.notEqual(g.airportPickup,g.airportDropoff);
  }
});
test('a Sheet edit removes only the unwanted passenger leg and retains the shared trip plan',()=>{
  const rows=[header(),row('A','YES','YES'),row('B','YES','YES')];
  const initial=guestsFromRows(rows),arrival=transportGroups(initial,'Arrivals')[0],departure=transportGroups(initial,'Departures')[0];
  rows[1][32]='NO';
  const changed=guestsFromRows(rows),afterArrival=transportGroups(changed,'Arrivals')[0],afterDeparture=transportGroups(changed,'Departures')[0];
  assert.equal(afterArrival.signature,arrival.signature);
  assert.equal(afterDeparture.id,departure.id);
  assert.notEqual(afterDeparture.signature,departure.signature);
  assert.deepEqual(afterDeparture.guests.map(g=>g.name),['B']);
  assert.equal(transportWithPlans([afterDeparture],[{id:departure.id,driver:'Assigned Driver'}])[0].plan.driver,'Assigned Driver');
});
test('admin guest creation stores both fields and lodging saves preserve the dropoff column',()=>{
  const h=createHarness([header()]);
  const saved=h.request({action:'guest',requestId:randomUUID(),guest:{name:'New Guest',arrivalDate:'2026-11-06',departureDate:'2026-11-09',overnight:'YES',airportPickup:'YES',airportDropoff:'NO'}});
  assert.equal(saved.ok,true,saved.error);assert.equal(h.rows[1][18],'YES');assert.equal(h.rows[1][32],'NO');
  const guest=guestsFromRows(saved.rows)[0];
  const assigned=h.request({action:'lodging',requestId:randomUUID(),identity:guest.sourceIdentity,expected:guest.sourceLodging,stay:{start:'2026-11-06',end:'2026-11-09'},assignment:{lodging:'Samarpan',roomNo:'201',roomCode:'S201B1'}});
  assert.equal(assigned.ok,true,assigned.error);assert.equal(h.rows[1][32],'NO');
  const invalid=h.request({action:'guest',requestId:randomUUID(),guest:{name:'Invalid',airportDropoff:'MAYBE'}});assert.equal(invalid.ok,false);
});
