const {createHash} = require('node:crypto');
const {normalizePhone, clientAddress} = require('./lookup');

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid registration.');
  if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.requestId)) throw Error('Invalid registration request ID.');
  const text = (key, max) => {
    const value = input[key] == null ? '' : input[key];
    if (typeof value !== 'string' || value.length > max) throw Error('Invalid ' + key + '.');
    return value.trim();
  };
  const phone = normalizePhone(input.phone);
  if (!phone) throw Error('Enter a valid 10 digit phone number.');
  const name = text('name', 300), email = text('email', 254);
  if (!name) throw Error('Please enter your name.');
  if (email && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) throw Error('Please enter a valid email address.');
  if (!['Yajman Couple', 'Yajman Single'].includes(input.yajmanType)) throw Error('Please choose Yajman Couple or Yajman Single.');
  if (typeof input.whatsappOptIn !== 'boolean') throw Error('Invalid WhatsApp preference.');
  if (input.whatsappOptIn && !email) throw Error('An email address is needed for this WhatsApp confirmation.');
  return {phone, name, email, zipCode: text('zipCode', 20), cityState: text('cityState', 150),
    yajman: 'Yes', yajmanType: input.yajmanType, lookupStatus: input.lookupStatus === 'Matched' ? 'Matched' : 'Manual', whatsappOptIn: input.whatsappOptIn};
}

function createRegistrationHandler({table, allowRequest, allowRecipient, saveRegistration, sendWhatsApp, origins}) {
  return async request => {
    const headers = {'Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    const reply = (status, jsonBody) => ({status, headers, jsonBody});
    const origin = request.headers.get('origin');
    if (origin && !origins.has(origin)) return reply(403,{ok:false,error:'Origin not allowed.'});
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods']='POST, OPTIONS'; headers['Access-Control-Allow-Headers']='Content-Type';
      return {status:204,headers};
    }
    if (request.method !== 'POST') return reply(405,{ok:false,error:'Use POST.'});
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415,{ok:false,error:'JSON required.'});
    let input, payload;
    try {
      const body = await request.text();
      if (Buffer.byteLength(body)>4096) return reply(413,{ok:false,error:'Request too large.'});
      input=JSON.parse(body); payload=validate(input);
    } catch (error) { return reply(400,{ok:false,error:error instanceof SyntaxError ? 'Invalid JSON.' : error.message}); }
    const partitionKey='dhan-teras-2026', rowKey=input.requestId;
    const fingerprint=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const update = values => table.updateEntity({partitionKey,rowKey,...values},'Merge');
    const finish = async (status, result) => {
      await update({phase:'complete',httpStatus:status,result:JSON.stringify(result)});
      return reply(status,result);
    };
    try {
      if (!await allowRequest(clientAddress(request))) return reply(429,{ok:false,error:'Too many requests. Please try again later.'});
      try { await table.createEntity({partitionKey,rowKey,fingerprint,phase:'processing',createdAt:new Date().toISOString(),whatsappOptIn:payload.whatsappOptIn}); }
      catch (error) {
        if (error.statusCode!==409) throw error;
        const prior=await table.getEntity(partitionKey,rowKey);
        if (prior.fingerprint!==fingerprint) return reply(409,{ok:false,error:'This request ID was already used for different registration details.'});
        if (prior.phase==='complete') return reply(prior.httpStatus,JSON.parse(prior.result));
        if (prior.phase==='saved' || prior.phase==='sending') {
          return reply(200,{ok:true,registrationId:prior.registrationId,emailStatus:prior.emailStatus,whatsappStatus:'unknown',warning:'Your RSVP is saved. Confirmation delivery is still being checked; please do not register again.'});
        }
        return reply(409,{ok:false,error:'This registration is processing or needs review. Please do not submit a new registration.',requestId:rowKey});
      }
      if (!await allowRecipient(payload.phone)) return await finish(429,{ok:false,error:'Too many registrations for this phone number. Please contact the mandir.'});
      let saved;
      try {
        // The server selects the Apps Script URL; callers cannot provide a destination.
        saved=await saveRegistration(payload);
      } catch {
        await update({phase:'review'});
        return reply(503,{ok:false,error:'We could not confirm whether your RSVP was saved. Please contact the mandir before registering again.',requestId:rowKey});
      }
      if (!saved?.ok) return await finish(400,{ok:false,error:'The registration service could not save your RSVP. Please check your details or contact the mandir.'});
      if (typeof saved.registrationId!=='string' || typeof saved.emailStatus!=='string') {
        await update({phase:'review'});
        return reply(503,{ok:false,error:'The RSVP service returned an unexpected response. Please contact the mandir before registering again.',requestId:rowKey});
      }
      await update({phase:'saved',registrationId:saved.registrationId,emailStatus:saved.emailStatus});
      const result={ok:true,registrationId:saved.registrationId,emailStatus:saved.emailStatus,whatsappStatus:'not_requested'};
      if (payload.whatsappOptIn) {
        if (saved.emailStatus!=='sent') {
          result.whatsappStatus='skipped';
          result.warning='Your RSVP is saved, but the email could not be sent. The WhatsApp confirmation was not sent because it refers to that email.';
        } else {
          // Persist this boundary before sending. Uncertain sends are never retried automatically.
          await update({phase:'sending'});
          try {
            const message=await sendWhatsApp(payload);
            result.whatsappStatus='queued';result.whatsappMessageSid=message.sid;
          } catch (error) {
            result.whatsappStatus=error.definiteFailure ? 'failed' : 'unknown';
            result.warning='Your RSVP is saved and your email was sent, but WhatsApp delivery could not be confirmed. Please check your email.';
          }
        }
      } else if (saved.emailStatus==='failed') result.warning='Your RSVP is saved, but the confirmation email could not be sent.';
      return await finish(200,result);
    } catch {
      return reply(503,{ok:false,error:'Registration is temporarily unavailable. Keep this page open and try again using the same details.',requestId:rowKey});
    }
  };
}

function createServices(env, fetchImpl=fetch) {
  return {
    async saveRegistration(payload) {
      const {whatsappOptIn,...registration}=payload;
      const response=await fetchImpl(env.GOOGLE_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(registration),signal:AbortSignal.timeout(45000)});
      if (!response.ok) throw Error('Registration service unavailable');
      return response.json();
    },
    async sendWhatsApp(payload) {
      const account=env.TWILIO_ACCOUNT_SID;
      if (!/^AC[0-9a-f]{32}$/i.test(account||'') || !env.TWILIO_API_KEY || !env.TWILIO_API_SECRET || !/^HX[0-9a-f]{32}$/i.test(env.TWILIO_CONTENT_SID||'')) {
        throw Object.assign(Error('WhatsApp is not configured'),{definiteFailure:true});
      }
      const form=new URLSearchParams({From:env.TWILIO_WHATSAPP_FROM,To:'whatsapp:+1'+payload.phone,ContentSid:env.TWILIO_CONTENT_SID,
        ContentVariables:JSON.stringify({'1':payload.name,'2':env.REGISTRATION_EVENT_NAME,'3':payload.email})});
      const response=await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages.json`,{
        method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.TWILIO_API_KEY+':'+env.TWILIO_API_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
        body:form,signal:AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Object.assign(Error('WhatsApp request rejected'),{definiteFailure:response.status<500});
      const data=await response.json();
      if (!/^SM[0-9a-f]{32}$/i.test(data.sid||'')) throw Error('Unexpected WhatsApp response');
      return {sid:data.sid};
    },
  };
}
module.exports={validate,createRegistrationHandler,createServices};
