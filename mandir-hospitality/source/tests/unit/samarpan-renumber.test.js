import test from 'node:test';
import assert from 'node:assert/strict';
import { renumberSamarpanTables, SAMARPAN_ROOM_RENUMBER } from '../../shared/samarpan-renumber.js';
import { guestsFromRows } from '../../src/lib/sheets.js';
import { bedForGuest } from '../../src/lib/occupancy.js';
import { createWorkspaceEngine, TABLES } from '../../shared/workspace-engine.js';
import { tabularWorkspace } from '../../shared/tabular-workspace.js';

const header=()=>{const r=Array(33).fill('');Object.assign(r,{0:'Registration ID',8:'Attendee Full Name',29:'Lodging',30:'Room No.',31:'Room Code'});return r;};
const row=(id,room,bed,lodging='Samarpan')=>{const r=Array(33).fill('');Object.assign(r,{0:id,8:id,9:'Self',12:'2026-10-30',13:'2026-11-01',20:'YES',24:'Confirmed',29:lodging,30:room,31:`${lodging==='Sadhak'?'SD':'S'}${room}B${bed}`});return r;};

test('room correction moves all five rooms once, keeps bed positions and leaves other properties untouched',()=>{
  const rows=[header(),row('A','100',7),row('B',101,12),row('C','102',14),row('D','103',13),row('E','104',15),row('Sadhak','101',3,'Sadhak'),row('Upper','204',4)];
  // Keep a child sharing the same physical bed with their adult.
  const child=row('Child','100',7);child[9]='Child (under 12)';rows.push(child);
  const original=structuredClone(rows);
  const migrated=renumberSamarpanTables(rows,[TABLES.Housekeeping]);
  assert.deepEqual(rows,original);
  assert.deepEqual(migrated.counts,{'100':2,'101':1,'102':1,'103':1,'104':1});
  const guests=guestsFromRows(migrated.attendees);
  for(let i=1;i<rows.length;i++){
    const expected=rows[i][29]==='Samarpan'?(SAMARPAN_ROOM_RENUMBER[String(rows[i][30])]||String(rows[i][30])):String(rows[i][30]);
    assert.equal(String(migrated.attendees[i][30]),expected);
    assert.deepEqual(migrated.attendees[i].slice(0,30),rows[i].slice(0,30));
    assert.equal(migrated.attendees[i][32],rows[i][32]);
    assert.equal(bedForGuest(guests[i-1]),Number(String(rows[i][31]).match(/B(\d+)$/)[1]));
  }
  assert.equal(migrated.attendees[1][31],migrated.attendees.at(-1)[31]);
  assert.equal(typeof migrated.attendees[2][30],'number');
  assert.deepEqual(migrated.attendees[6],rows[6]);
});

test('checkout identities migrate with their beds, preserve linen state, and do not generate duplicate housekeeping tasks',()=>{
  const attendees=[header(),row('A','100',7),row('B','104',15)];
  const guests=guestsFromRows(attendees);
  const housekeeping=[TABLES.Housekeeping,...guests.map((g,i)=>[JSON.stringify([g.sourceIdentity,g.roomCode,'2026-10-30','2026-11-01']),g.roomNo,String(i?15:7),g.roomCode,g.name,'2026-11-01',i?'2026-11-02T08:00:00Z':'',i?'linen-receipt':'','Pending'])];
  const migrated=renumberSamarpanTables(attendees,housekeeping);
  assert.equal(migrated.housekeepingCount,2);
  for(let i=1;i<housekeeping.length;i++){
    assert.equal(JSON.parse(migrated.housekeeping[i][0])[1],migrated.attendees[i][31]);
    assert.deepEqual(migrated.housekeeping[i].slice(4),housekeeping[i].slice(4));
    assert.equal(migrated.housekeeping[i][2],housekeeping[i][2]);
  }
  const book=tabularWorkspace({Attendees:migrated.attendees,...Object.fromEntries(Object.entries(TABLES).map(([name,h])=>[name,[h]])),Housekeeping:migrated.housekeeping});
  const engine=createWorkspaceEngine({today:()=> '2026-11-02',uuid:()=> 'synthetic',flush(){}});
  engine.housekeeping(book,engine.roster(book).guests);
  assert.equal(book.data.Housekeeping.length,3);
});

test('mismatched bed codes, preexisting room 105 and broken checkout IDs reject the correction before changing input',()=>{
  for(const rows of [[header(),row('A','105',1)],[header(),row('A','100',8)]])assert.throws(()=>renumberSamarpanTables(rows,[TABLES.Housekeeping]));
  const rows=[header(),row('A','100',1)];const before=structuredClone(rows);
  assert.throws(()=>renumberSamarpanTables(rows,[TABLES.Housekeeping,['broken','100','1','S100B1','A','2026-11-01','','','Pending']]));
  assert.deepEqual(rows,before);
  rows[1][31]='S101B1';assert.throws(()=>renumberSamarpanTables(rows,[TABLES.Housekeeping]),/disagree/);
});
