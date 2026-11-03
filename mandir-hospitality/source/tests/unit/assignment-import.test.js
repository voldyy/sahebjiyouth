import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchAssignmentEntries,importedAssignment} from '../../shared/assignment-import.js';
import {withDefaultOffsiteRooms,offsiteRoomFor,readHotelInventory} from '../../src/lib/offsite.js';
import {bedForGuest,bedState} from '../../src/lib/occupancy.js';
import {roomAssignmentRows} from '../../src/lib/roomAssignmentsExport.js';
const guest=(id,name,city,start='2026-11-06',end='2026-11-08')=>({sourceIdentity:id,sourceWritable:true,registrationId:id,name,city,arrivalDate:start,departureDate:end});
test('name and city distinguish people, stay dates distinguish visits, and mismatched IDs do not redirect assignments',()=>{
 const guests=[guest('one','Jay Patel','Seattle, WA'),guest('two','Jay Patel','Toronto, ON'),guest('old','Jay Patel','Seattle, WA','2026-10-10','2026-10-12')];
 const entry={registrationId:'two',name:'JAY PATEL',city:'Seattle WA',start:'2026-11-06',end:'2026-11-08'};
 assert.equal(matchAssignmentEntries([entry],guests).matches[0].guest.registrationId,'one');
 assert.throws(()=>matchAssignmentEntries([entry,entry],guests),/Multiple worksheet/);
 assert.throws(()=>matchAssignmentEntries([{...entry,start:'2026-12-01'}],guests),/uniquely/);
 assert.equal(matchAssignmentEntries([{...entry,registrationId:'',name:'New Guest'}],guests).additions.length,1);
});
test('hotel inventory preserves numbering gaps and does not regenerate removed defaults or booked custom slots',()=>{
 const rooms=withDefaultOffsiteRooms([{id:'custom-king',lodging:'Hawthorn',label:'R16',beds:2}],{Hawthorn:['HR01','HR03','HR27'],Hilton:['HL01','HL02','HL03','HL04']});
 assert.deepEqual(rooms.filter(r=>r.lodging==='Hawthorn').map(r=>r.label),['HR01','HR03','HR27']);
 assert.equal(rooms.length,7);assert.equal(rooms.some(r=>r.label==='R16'),false);
 assert.throws(()=>readHotelInventory('["HR01","R01"]','Hawthorn'),/Invalid/);
 const retained=withDefaultOffsiteRooms([{id:'custom-king',lodging:'Hawthorn',label:'R16',beds:2}],{Hawthorn:['HR16']}).find(r=>r.lodging==='Hawthorn');
 assert.equal(retained.id,'custom-king');assert.equal(retained.beds,2);assert.equal(retained.label,'HR16');
});
test('HR and HL codes resolve bed positions and blank beds remain room-only reservations',()=>{
 const rooms=withDefaultOffsiteRooms([],{Hawthorn:['HR01'],Hilton:['HL01','HL02']});
 const value=importedAssignment({name:'Moved',lodging:'Hilton',roomNo:'HL02',roomCode:'HR12B2'});
 assert.equal(value.roomCode,'HL02B2');assert.equal(offsiteRoomFor(value,rooms).id,'hilton-r02');assert.equal(bedForGuest(value,rooms),2);
 const pending={...guest('pending','Pending','Toronto ON'),lodging:'Hilton',stay:'Hilton',roomNo:'HL01',roomCode:''};
 assert.equal(offsiteRoomFor(pending,rooms).id,'hilton-r01');assert.equal(bedForGuest(pending,rooms),null);
 assert.equal(bedState([pending],'hilton-r01',1,{start:'2026-11-06',end:'2026-11-07'},null,'Hilton',rooms).uncertain.length,1);
 assert.equal(roomAssignmentRows([pending],rooms)[0][1],'HL01');
 assert.equal(offsiteRoomFor({lodging:'Hawthorn',roomCode:'HR01B3'},rooms).id,'hawthorn-r01');
});

test('an adult host can keep an imported hotel bed after a child shares it',async()=>{
 const {assignmentIssue}=await import('../../src/lib/occupancy.js');
 const rooms=withDefaultOffsiteRooms([],{Hilton:['HL01']});
 const adult={...guest('adult','Parent','Toronto ON'),relationship:'Self',lodging:'Hilton',roomNo:'HL01',roomCode:'HL01B1',stay:'Hilton'};
 const child={...adult,sourceIdentity:'child',name:'Child',relationship:'Child (under 12)'};
 assert.equal(assignmentIssue([adult,child],adult,{lodging:'Hilton',roomNo:'',roomCode:'Ohilton-r01B1'},rooms),'');
});
