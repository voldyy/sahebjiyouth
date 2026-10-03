const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../apps-script/Code.gs'),'utf8');
function setup({mailFails=false}={}) {
  const rows=[],emails=[];let released=0,quotaCalls=0;
  const sheet={getLastRow:()=>rows.length,setFrozenRows(){},getRange(row,col,height,width){return {
    setNumberFormat(){return this;},
    setValues(values){values.forEach((value,i)=>{rows[row-1+i]??=[];value.forEach((v,j)=>rows[row-1+i][col-1+j]=v);});return this;},
    getValues:()=>Array.from({length:height},(_,i)=>(rows[row-1+i]||[]).slice(col-1,col-1+width)),
    createTextFinder(id){return {matchEntireCell(){return this;},findNext(){const i=rows.findIndex(r=>r[1]===id);return i<0?null:{getRow:()=>i+1};}};},
  };}};
  const context=vm.createContext({
    console:{log(){},error(){}},
    SpreadsheetApp:{openById:()=>({getName:()=> 'Test Sheet',getSheetByName:()=>sheet,insertSheet:()=>sheet}),flush(){}},
    MailApp:{getRemainingDailyQuota(){quotaCalls++;return 100;},sendEmail(message){if(mailFails)throw Error('Mail unavailable');emails.push(message);}},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){released++;}})},
    Utilities:{getUuid:()=> 'test-registration-id'},
    ContentService:{MimeType:{JSON:'json'},createTextOutput(body){return {body,setMimeType(){return this;}};}},
  });
  vm.runInContext(source,context);vm.runInContext('PUJA_CONFIG.SPREADSHEET_ID="test-sheet"',context);
  return {context,rows,emails,get released(){return released;},get quotaCalls(){return quotaCalls;},
    post(data){context.event={postData:{contents:JSON.stringify(data)}};return JSON.parse(vm.runInContext('doPost(event)',context).body);}};
}
const registration={phone:'(443) 555-0123',name:'Example Participant',email:'person@example.com',zipCode:'01234',cityState:'Test, MA',yajman:'Yes',yajmanType:'Yajman Couple',lookupStatus:'Matched'};
test('saves current form fields and sends confirmation',()=>{
 const app=setup();const result=app.post(registration);
 assert.equal(result.ok,true);assert.equal(result.emailStatus,'sent');assert.equal(app.rows.length,2);
 assert.equal(app.rows[1][1],'4435550123');assert.equal(app.rows[1][5],'01234');assert.equal(app.rows[1][3],'C');assert.equal(app.rows[1].length,8);
 assert.equal(app.emails[0].to,registration.email);assert.match(app.emails[0].body,/November 6, 2026/);assert.equal(app.released,1);
});
test('blank email saves without sending; malformed email rejects before saving',()=>{
 const app=setup();assert.equal(app.post({...registration,email:''}).emailStatus,'skipped');assert.equal(app.emails.length,0);
 const invalid=setup();assert.equal(invalid.post({...registration,email:'a@example.com,b@example.com'}).ok,false);assert.equal(invalid.rows.length,0);
});
test('mail failure retains successful registration with failure status',()=>{
 const app=setup({mailFails:true});const result=app.post(registration);
 assert.equal(result.ok,true);assert.equal(result.emailStatus,'failed');assert.equal(app.rows.length,2);assert.equal(app.rows[1].length,8);
});
test('authorization function does not send mail or write rows',()=>{
 const app=setup();vm.runInContext('authorizeGoogleAppsScript()',app.context);
 assert.equal(app.emails.length,0);assert.equal(app.rows.length,0);assert.equal(app.quotaCalls,1);
});
test('formula and HTML input are escaped',()=>{
 const app=setup();app.post({...registration,name:'=1+1 <b>test</b>'});
 assert.ok(app.rows[1][2].startsWith("'="));assert.match(app.emails[0].htmlBody,/&lt;b&gt;test&lt;\/b&gt;/);
});
test('incompatible existing headers are not overwritten',()=>{
 const app=setup();app.rows.push(['Existing data']);assert.equal(app.post(registration).ok,false);
 assert.deepEqual(app.rows,[['Existing data']]);assert.equal(app.emails.length,0);assert.equal(app.released,1);
});

test('participation choice is mandatory and stored as S in column D',()=>{
 const app=setup();assert.equal(app.post({...registration,yajmanType:''}).ok,false);assert.equal(app.rows.length,0);
 assert.equal(app.post({...registration,yajmanType:'Yajman Single'}).ok,true);
 assert.equal(app.rows[1][3],'S');assert.match(app.emails[0].htmlBody,/Yajman Single/);
});
test('matches the supplied eight-column sheet without changing existing rows',()=>{
 const app=setup();const headers=['Timestamp','Phone','Name','C or S','Email','Zip Code','City, State','Lookup Status'];
 app.rows.push(headers.slice(),['old registration']);assert.equal(app.post(registration).ok,true);
 assert.deepEqual(app.rows[0],headers);assert.equal(app.rows[1][0],'old registration');
 assert.deepEqual(Array.from(app.rows[2].slice(1)),['4435550123','Example Participant','C','person@example.com','01234','Test, MA','Matched']);
});
