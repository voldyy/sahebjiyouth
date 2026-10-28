import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {assignmentIssue,bedState,isChildUnder12,lodgingOccupancy} from '../../src/lib/occupancy.js';
import {DEFAULT_OFFSITE_ROOMS} from '../../src/lib/offsite.js';
import {createHarness} from '../helpers/apps-script-harness.js';
import {guestsFromRows} from '../../src/lib/sheets.js';

const stay={start:'2026-11-06',end:'2026-11-09'};
const assignment={lodging:'Samarpan',roomNo:'204',roomCode:'S204B1'};
const person=(id,relationship='Self (Primary)',changes={})=>({id,sourceIdentity:id,name:id,relationship,status:'Registered',arrivalDate:stay.start,departureDate:stay.end,...assignment,...changes});

test('only the explicit under-12 classification can share an already reserved bed',()=>{
  const adult=person('Adult');
  for(const label of ['Child (under 12)',' child (under 12): ','CHILD (UNDER 12)']){
    const child=person('Child',label);assert.equal(isChildUnder12(child),true);assert.equal(assignmentIssue([adult],child,assignment),'');
  }
  for(const label of ['Child','Child (12 and over)','Spouse','Self (Primary)',''])assert.match(assignmentIssue([adult],person('Other',label),assignment),/occupied/);
});
test('adult coverage must span the full child stay and unknown or conflicting reservations stay blocked',()=>{
  const child=person('Child','Child (under 12)');
  assert.match(assignmentIssue([person('Early adult','Parent',{departureDate:'2026-11-08'})],child,assignment),/full stay/);
  assert.match(assignmentIssue([person('Late adult','Parent',{arrivalDate:'2026-11-07'})],child,assignment),/full stay/);
  assert.match(assignmentIssue([person('Other child','Child (under 12)')],child,assignment),/adult/);
  assert.match(assignmentIssue([person('Adult'),person('Second adult')],child,assignment),/adult/);
  assert.match(assignmentIssue([person('Unknown','Parent',{arrivalDate:''})],child,assignment),/missing dates/);
  assert.equal(assignmentIssue([person('Adult','Parent',{status:'Cancelled'})],child,assignment),''); // a separate empty bed remains available
});
test('shared beds show both occupants without double booking and count once toward capacity',()=>{
  const adult=person('Adult'),child=person('Child','Child (under 12)'),other=person('Other','Self',{roomCode:'S204B2'});
  const state=bedState([adult,child],'204',1,stay);
  assert.equal(state.shared,true);assert.equal(state.conflict,false);assert.equal(state.occupants.length,2);assert.equal(state.free,false);
  assert.equal(bedState([adult,person('Adult2')],'204',1,stay).conflict,true);
  assert.equal(bedState([child,person('Child2','Child (under 12)')],'204',1,stay).conflict,true);
  assert.equal(lodgingOccupancy([adult,child,other],'Samarpan',[{number:'204',beds:4}],['2026-11-06']).perDay[0].filled,2);
  assert.equal(assignmentIssue([adult,child],adult,assignment),'');
  assert.equal(assignmentIssue([adult,child],person('Child2','Child (under 12)'),assignment),'');
});
test('Sadhak and hotel places support the same sharing rule without crossing properties',()=>{
  const room=DEFAULT_OFFSITE_ROOMS[0];
  for(const value of [{lodging:'Sadhak',roomNo:'204',roomCode:'SD204B1'},{lodging:room.lodging,roomNo:'',roomCode:`O${room.id}B1`}]){
    const adult=person('Adult','Parent',value),child=person('Child','Child (under 12)',value);
    assert.equal(assignmentIssue([adult],child,value,DEFAULT_OFFSITE_ROOMS),'');
    assert.equal(bedState([adult,child],value.lodging==='Sadhak'?'204':room.id,1,stay,null,value.lodging,DEFAULT_OFFSITE_ROOMS).shared,true);
  }
});
test('the backend uses column J, preserves the adult, and rejects an overlapping second adult',()=>{
  const header=Array(33).fill('');Object.assign(header,{0:'Registration ID',8:'Attendee Full Name',29:'Lodging',30:'Room No.',31:'Room Code',32:'Departure Dropoff Needed?'});
  const row=(id,classification,assigned=false)=>{const r=Array(33).fill('');Object.assign(r,{0:id,8:id,9:classification,12:stay.start,13:stay.end,20:'YES',24:'Confirmed',32:'NO'});if(assigned)r.splice(29,3,...Object.values(assignment));return r;};
  const h=createHarness([header,row('Parent','Parent',true),row('Child','Child (under 12)'),row('Other','Self (Primary)')]);
  const originalParent=[...h.rows[1]];
  const assign=g=>h.request({action:'lodging',requestId:randomUUID(),identity:g.sourceIdentity,expected:g.sourceLodging,stay,assignment,relationship:'Child (under 12)'});
  assert.equal(assign(guestsFromRows(h.rows)[1]).ok,true);
  assert.deepEqual(h.rows[1],originalParent);assert.equal(h.rows[2][31],'S204B1');assert.equal(h.rows[2][32],'NO');
  assert.match(assign(guestsFromRows(h.rows)[2]).error,/occupied/);
  assert.equal(h.request({action:'snapshot'}).guests,undefined); // admin snapshot retains source-backed rows
  assert.equal(h.request({action:'snapshot',accessKey:''}).guests.filter(g=>g.roomCode==='S204B1').length,2);
});
