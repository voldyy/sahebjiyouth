const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRegistrationHandler,createServices}=require('../src/registration');
const input={requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',phone:'4435550123',name:'Example Participant',email:'example@example.com',zipCode:'01234',cityState:'Test, MA',yajmanType:'Yajman Couple',lookupStatus:'Matched',whatsappOptIn:true};
function setup(overrides={}) {
 const rows=new Map(),calls=[];
 const table={
  async createEntity(e){const key=e.partitionKey+e.rowKey;if(rows.has(key))throw {statusCode:409};rows.set(key,{...e});},
  async getEntity(p,r){return rows.get(p+r);},
  async updateEntity(e){const key=e.partitionKey+e.rowKey;rows.set(key,{...rows.get(key),...e});},
 };
 const handler=createRegistrationHandler({table,allowRequest:async()=>true,allowRecipient:async()=>true,origins:new Set(['https://www.sahebjiyouth.org']),
  saveRegistration:async payload=>{calls.push(['save',payload]);return {ok:true,registrationId:'stored-id',emailStatus:'sent'};},
  sendWhatsApp:async payload=>{calls.push(['whatsapp',payload]);return {sid:'SM'+'1'.repeat(32)};},...overrides});
 const request=(body=input)=>handler({method:'POST',headers:new Headers({'content-type':'application/json',origin:'https://www.sahebjiyouth.org','x-forwarded-for':'198.51.100.1'}),text:async()=>JSON.stringify(body)});
 return {request,calls,rows};
}
test('saves first, then sends once; retried request returns saved outcome',async()=>{
 const app=setup();const first=await app.request();assert.equal(first.jsonBody.whatsappStatus,'queued');assert.deepEqual(app.calls.map(c=>c[0]),['save','whatsapp']);
 const second=await app.request();assert.deepEqual(second.jsonBody,first.jsonBody);assert.equal(app.calls.length,2);
 assert.equal((await app.request({...input,name:'Changed name'})).status,409);
});
test('concurrent duplicate cannot save or send twice',async()=>{
 let resume;const app=setup({saveRegistration:()=>new Promise(r=>{resume=r;})});
 const first=app.request();await new Promise(r=>setImmediate(r));
 assert.equal((await app.request()).status,409);
 resume({ok:true,registrationId:'id',emailStatus:'sent'});await first;
 assert.equal(app.calls.filter(c=>c[0]==='whatsapp').length,1);
});
test('no opt-in means no WhatsApp; opted-in registrations need email',async()=>{
 const app=setup();assert.equal((await app.request({...input,email:''})).status,400);assert.equal(app.calls.length,0);
 assert.equal((await app.request({...input,whatsappOptIn:false})).jsonBody.whatsappStatus,'not_requested');assert.equal(app.calls.length,1);
});
test('email failure or failed registration never sends template',async()=>{
 const mail=setup({saveRegistration:async()=>({ok:true,registrationId:'id',emailStatus:'failed'})});
 assert.equal((await mail.request()).jsonBody.whatsappStatus,'skipped');assert.equal(mail.calls.length,0);
 const failed=setup({saveRegistration:async()=>({ok:false})});assert.equal((await failed.request()).status,400);assert.equal(failed.calls.length,0);
});
test('uncertain saves and sends are not retried automatically',async()=>{
 const saved=setup({saveRegistration:async()=>{throw Error('timeout');}});assert.equal((await saved.request()).status,503);assert.equal((await saved.request()).status,409);
 let sends=0;const app=setup({sendWhatsApp:async()=>{sends++;throw Error('timeout');}});
 const result=await app.request();assert.equal(result.jsonBody.ok,true);assert.equal(result.jsonBody.whatsappStatus,'unknown');
 await app.request();assert.equal(sends,1);
});
test('recipient limit and invalid choices reject without side effects',async()=>{
 const limited=setup({allowRecipient:async()=>false});assert.equal((await limited.request()).status,429);assert.equal(limited.calls.length,0);
 const invalid=setup();assert.equal((await invalid.request({...input,yajmanType:''})).status,400);assert.equal(invalid.calls.length,0);
});
test('Twilio request uses server template and exact variables; Apps Script gets registration only',async()=>{
 const requests=[];const env={GOOGLE_SCRIPT_URL:'https://example.com/script',TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),TWILIO_API_KEY:'test-key',TWILIO_API_SECRET:'test-secret',TWILIO_CONTENT_SID:'HX'+'2'.repeat(32),TWILIO_WHATSAPP_FROM:'whatsapp:+15551234567',REGISTRATION_EVENT_NAME:'Dhan Teras Puja 2026'};
 const svc=createServices(env,async(url,options)=>{requests.push({url,...options});return {ok:true,json:async()=>({ok:true,sid:'SM'+'3'.repeat(32)})};});
 await svc.saveRegistration(input);assert.equal(JSON.parse(requests[0].body).whatsappOptIn,undefined);
 await svc.sendWhatsApp(input);const body=requests[1].body;
 assert.equal(body.get('ContentSid'),env.TWILIO_CONTENT_SID);assert.equal(body.get('To'),'whatsapp:+14435550123');
 assert.deepEqual(JSON.parse(body.get('ContentVariables')),{'1':input.name,'2':env.REGISTRATION_EVENT_NAME,'3':input.email});assert.equal(body.has('Body'),false);
});
