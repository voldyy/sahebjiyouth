import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createHarness, TEST_ADMIN_KEY} from '../helpers/apps-script-harness.js';
import {guestsFromRows} from '../../src/lib/sheets.js';
import {transportGroups} from '../../src/lib/transport.js';
function fixture() {
  const headers=Array(32).fill(''); Object.assign(headers,{0:'Registration ID',8:'Attendee Full Name',29:'Lodging',30:'Room No.',31:'Room Code'});
  const row=Array(32).fill('');Object.assign(row,{0:'R1',2:'YES',8:'Test Person',11:'FLIGHT',12:'2026-10-14 16:00',13:'2026-10-20 12:00',14:'EWR',15:'UA308',20:'YES'});
  return createHarness([headers,row]);
}
test('driver phone column is accepted and preserved by resource edits',()=>{
  const h=fixture(); h.request({action:'snapshot'});
  const sheet=h.sheets.get('Transport Resources');
  sheet.rows=[['Type','Name','Active','Updated at','Phone number'],['Driver','Test Driver','Yes','','+12025550123']];
  assert.equal(h.request({action:'snapshot',accessKey:''}).ok,true);
  assert.equal(h.request({action:'resource',type:'Driver',name:'Test Driver',active:false,requestId:randomUUID()}).ok,true);
  assert.equal(sheet.rows[1][4],'+12025550123');
});
test('bulk requests require the existing admin key and authorization does not expose it',()=>{
  const h=fixture();let requests=0;
  h.setFetch(()=>{requests++;return{getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,eligible:2})};});
  assert.match(h.request({action:'accommodation-notifications',mode:'preview',accessKey:''}).error,/Admin access/);
  assert.equal(requests,0);
  assert.equal(h.request({action:'accommodation-notifications',mode:'preview'}).eligible,2);
  assert.equal(requests,1);
  assert.deepEqual(h.post({action:'notification-authorize',accessKey:TEST_ADMIN_KEY}),{ok:true,authorized:true});
  assert.deepEqual(h.post({action:'notification-authorize',accessKey:'bad'}),{ok:true,authorized:false});
  assert.equal(h.post({action:'lodging',accessKey:TEST_ADMIN_KEY}).ok,false);
});
test('pickup status supports the previous day, rejects arbitrary flights, and uses FlightStats ETA',()=>{
  const h=fixture();h.setToday('2026-10-13'); h.properties.set('FLIGHTSTATS_APP_ID','test-id');h.properties.set('FLIGHTSTATS_APP_KEY','test-key');
  let calls=0;h.setFetch(url=>{calls++;assert.match(url,/\/arr\/2026\/10\/14/);return{getResponseCode:()=>200,getContentText:()=>JSON.stringify({flightStatuses:[{flightId:123,status:'A',arrivalAirportFsCode:'EWR',operationalTimes:{actualRunwayDeparture:{dateUtc:'2026-10-13T20:00:00'},estimatedRunwayArrival:{dateUtc:'2026-10-14T19:30:00'},scheduledGateArrival:{dateUtc:'2026-10-14T20:00:00'}}}]})};});
  const group=transportGroups(guestsFromRows(h.rows),'Arrivals')[0];
  const result=h.post({action:'notification-flight',tripId:group.id});
  assert.equal(result.ok,true);assert.equal(result.flight.rawStatus,'A');assert.equal(result.flight.expectedArrivalUtc,'2026-10-14T19:30:00');assert.equal(calls,1);
  assert.equal(h.post({action:'notification-flight',tripId:'unregistered flight'}).ok,false);
  assert.equal(calls,1);
});
