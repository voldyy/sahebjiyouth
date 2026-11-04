import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createHarness} from '../helpers/apps-script-harness.js';
const headers=Array(33).fill('');Object.assign(headers,{0:'Registration ID',8:'Attendee Full Name',29:'Lodging',30:'Room No.',31:'Room Code'});
const request=(h,r)=>h.request({requestId:randomUUID(),...r});
const snapshot=h=>h.request({action:'snapshot'});
test('onsite and hotel additions persist, reject stale changes and make the new slot assignable',()=>{
 const h=createHarness([headers]);
 for(const [lodging,number,code] of [['Samarpan','202','S202B4'],['Sadhak','201','SD201B2'],['Hawthorn','hawthorn-r01','Ohawthorn-r01B5']]){
  const before=snapshot(h),room=[...before.fixedRooms,...before.offsiteRooms].find(r=>r.lodging===lodging&&(r.id||r.number)===number);
  const action={action:'bed-slot',lodging,room:number,expectedRevision:room.revision};
  assert.equal(request(h,{...action,accessKey:''}).ok,false);
  const changed=request(h,action);assert.equal(changed.ok,true,changed.error);
  const after=snapshot(h),updated=[...after.fixedRooms,...after.offsiteRooms].find(r=>r.lodging===lodging&&r.number===room.number);
  assert.equal(updated.beds,room.beds+1);assert.notEqual(updated.revision,room.revision);
  assert.match(request(h,action).error,/changed/);
  const assignment={lodging,roomNo:lodging==='Hawthorn'?'':room.number,roomCode:code};
  const added=request(h,{action:'guest',guest:{name:lodging+' Guest',arrivalDate:'2026-11-06',departureDate:'2026-11-08',overnight:'YES'},assignment});assert.equal(added.ok,true,added.error);
  const duplicate=request(h,{action:'guest',guest:{name:lodging+' Conflict',arrivalDate:'2026-11-06',departureDate:'2026-11-08',overnight:'YES'},assignment});assert.match(duplicate.error,/occupied/);
 }
});
