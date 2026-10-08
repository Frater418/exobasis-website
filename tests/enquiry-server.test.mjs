import test from 'node:test';
import assert from 'node:assert/strict';
import { SMTPServer } from 'smtp-server';
import nodemailer from 'nodemailer';
import { routeIndex,loadJSON } from '../src/lib/site.mjs';
import { createEnquiryServer, readEnquiryConfig } from '../src/server/enquiry.mjs';

// Every address is an explicit local test fixture. No external mail is sent.
async function fixture(t, options={}) {
 const messages=[];
 const smtp=new SMTPServer({authOptional:true,disabledCommands:['STARTTLS','AUTH'],onData(stream,session,done){
  const chunks=[];stream.on('data',x=>chunks.push(x));stream.on('end',()=>{
   if(options.rejectMail){const err=new Error('Local rejection fixture');err.responseCode=550;done(err);return;}
   messages.push({envelope:session.envelope,text:Buffer.concat(chunks).toString()});done();
  });
 }});
 await new Promise((resolve,reject)=>{smtp.once('error',reject);smtp.listen(0,'127.0.0.1',resolve);});
 const transport=nodemailer.createTransport({host:'127.0.0.1',port:smtp.server.address().port,secure:false,ignoreTLS:true});
 let now=1_000_000;
 const config={origin:'http://127.0.0.1',sender:'sender@exobasis.invalid',recipient:'inbox@exobasis.invalid',secureCookies:false,confirmationSeconds:30,rateLimit:options.rateLimit||100,trustProxy:options.trustProxy||false};
 const server=createEnquiryServer(config,transport,{now:()=>now});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 config.origin=origin;
 t.after(async()=>{transport.close();await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>smtp.close(resolve));});
 const request=(route,init={})=>fetch(origin+route,{...init,headers:{Origin:origin,...init.headers}});
 const payload={lang:'de',replyLanguage:'de',email:'visitor@exobasis.invalid',intent:'Allgemeine Anfrage',name:'Lokale Funktionsprobe',message:'Nur lokal abgefangene Testnachricht.',context:'/de/laender/uruguay/',website:''};
 const ref='a'.repeat(48);
 const send=(data=payload,headers={})=>request('/api/enquiry',{method:'POST',headers:{'Content-Type':'application/json','X-EXOBASIS-Receipt-Ref':ref,...headers},body:JSON.stringify(data)});
 return {request,send,payload,messages,ref,advance:ms=>now+=ms};
}

test('actual SMTP acceptance alone permits one language-bound confirmation',async t=>{
 const f=await fixture(t);const r=await f.send();assert.equal(r.status,202);
 const result=await r.json();
 assert.deepEqual(result,{status:'sent',confirmation:'/de/anfrage/bestaetigung/'});
 assert.ok(routeIndex.has(result.confirmation));
 const destination=loadJSON('src/content/de/bestaetigung.json');
 assert.equal(destination.route,result.confirmation);assert.equal(destination.kind,'confirmation');
 assert.equal(f.messages.length,1);
 assert.equal(f.messages[0].envelope.mailFrom.address,'sender@exobasis.invalid');
 assert.equal(f.messages[0].envelope.rcptTo[0].address,'inbox@exobasis.invalid');
 assert.match(f.messages[0].text,/Reply-To: visitor@exobasis\.invalid/);
 assert.match(f.messages[0].text,/uruguay/);
 const cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly; SameSite=Strict/);assert.match(cookie,/Path=\/api\/enquiry\/confirmation/);
 const token=cookie.split(';')[0];
 assert.equal((await f.request('/api/enquiry/confirmation?lang=en',{headers:{Cookie:token,'X-EXOBASIS-Receipt-Ref':f.ref}})).status,404);
 const receipt=await f.request('/api/enquiry/confirmation?lang=de',{headers:{Cookie:token,'X-EXOBASIS-Receipt-Ref':f.ref}});assert.equal(receipt.status,200);assert.equal(receipt.headers.get('cache-control'),'no-store, private');
 assert.deepEqual(await receipt.json(),{status:'sent',lang:'de'});
 assert.equal((await f.request('/api/enquiry/confirmation?lang=de',{headers:{Cookie:token,'X-EXOBASIS-Receipt-Ref':f.ref}})).status,200);
});

test('direct, invented, expired and unrelated visitor confirmations remain neutral',async t=>{
 const f=await fixture(t);
 assert.equal((await f.request('/api/enquiry/confirmation?lang=de&success=1')).status,404);
 assert.equal((await f.request('/api/enquiry/confirmation?lang=de',{headers:{Cookie:'exb_submission_'+f.ref+'='+'b'.repeat(48),'X-EXOBASIS-Receipt-Ref':f.ref}})).status,404);
 const r=await f.send();const cookie=r.headers.get('set-cookie').split(';')[0];f.advance(31_000);
 assert.equal((await f.request('/api/enquiry/confirmation?lang=de',{headers:{Cookie:cookie,'X-EXOBASIS-Receipt-Ref':f.ref}})).status,404);
});

test('SMTP rejection never sets a success cookie or claims acceptance',async t=>{
 const f=await fixture(t,{rejectMail:true});const r=await f.send();assert.equal(r.status,502);assert.deepEqual(await r.json(),{status:'error',code:'TRANSPORT_REJECTED'});assert.equal(r.headers.get('set-cookie'),null);assert.equal(f.messages.length,0);
});

test('invalid fields, headers, enums and private query data cannot change mail routing',async t=>{
 const f=await fixture(t);
 for(const change of [{email:'victim@exobasis.invalid\r\nBcc: other@exobasis.invalid'},{intent:'invented'},{lang:'xx'},{replyLanguage:'xx'},{name:'x'.repeat(121)},{message:'x'.repeat(4001)},{context:'https://outside.invalid/?secret=x'},{recipient:'attacker@exobasis.invalid'},{sender:'attacker@exobasis.invalid'},{name:{nested:true}}]) {
  const r=await f.send({...f.payload,...change});assert.equal(r.status,422,JSON.stringify(change));assert.equal(r.headers.get('set-cookie'),null);
 }
 assert.equal(f.messages.length,0);
 const foreign=await f.send(f.payload,{Origin:'https://outside.invalid'});assert.equal(foreign.status,403);
 const honeypot=await f.send({...f.payload,website:'spam'});assert.equal(honeypot.status,429);
 const type=await f.request('/api/enquiry',{method:'POST',headers:{'Content-Type':'text/plain'},body:'not JSON'});assert.equal(type.status,415);
 const bad=await f.request('/api/enquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(bad.status,400);
 const large=await f.request('/api/enquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(20_000)});assert.equal(large.status,413);
 assert.equal(f.messages.length,0);
});

test('optional field boundaries report exact server fields without mail',async t=>{
 const f=await fixture(t);
 for(const [key,value] of [['name','x'.repeat(121)],['message','x'.repeat(2001)],['email','a'.repeat(250)+'@x.org'],['website','x'.repeat(201)],['replyLanguage','zz']]){
  const r=await f.send({...f.payload,[key]:value});assert.equal(r.status,422,key);assert.ok((await r.json()).fields.includes(key),key);
 }
 const ok=await f.send({...f.payload,name:'x'.repeat(120),message:'x'.repeat(2000)});assert.equal(ok.status,202);assert.equal(f.messages.length,1);
});

test('English service choice and reply language stay independent; rate rejection is explicit',async t=>{
 const f=await fixture(t,{rateLimit:1});const r=await f.send({...f.payload,lang:'en',replyLanguage:'de',intent:'Arrange a trust structure',context:'/en/countries/uruguay/'});assert.equal(r.status,202);
 const duplicate=await f.send();assert.equal(duplicate.status,429);assert.deepEqual(await duplicate.json(),{status:'rejected',code:'RATE_LIMIT'});assert.equal(f.messages.length,1);
});

test('SMTP acceptance without browser storage has truthful form result but no confirmation cookie',async t=>{
 const f=await fixture(t);
 const response=await f.send(f.payload,{'X-EXOBASIS-Receipt-Ref':''});
 assert.equal(response.status,400); // A malformed explicit reference fails closed.
 const direct=await f.request('/api/enquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f.payload)});
 assert.equal(direct.status,202);assert.equal(direct.headers.get('set-cookie'),null);
 assert.equal((await direct.json()).status,'sent');assert.equal(f.messages.length,1);
});

test('two tabs retain separate receipts and a lost GET response is harmless',async t=>{
 const f=await fixture(t),a='a'.repeat(48),b='b'.repeat(48);
 const [first,second]=await Promise.all([f.send(f.payload,{'X-EXOBASIS-Receipt-Ref':a}),f.send({...f.payload,lang:'en',replyLanguage:'en',intent:'General enquiry',context:''},{'X-EXOBASIS-Receipt-Ref':b})]);
 assert.equal(first.status,202);assert.equal(second.status,202);assert.equal(f.messages.length,2);
 const cookies=[first,second].map(r=>r.headers.get('set-cookie').split(';')[0]).join('; ');
 const proof=(lang,ref,cookie=cookies)=>f.request('/api/enquiry/confirmation?lang='+lang,{headers:{Cookie:cookie,'X-EXOBASIS-Receipt-Ref':ref}});
 assert.equal((await proof('de',a)).status,200); // Response may be lost after the server sent it.
 assert.equal((await proof('en',b)).status,200);
 assert.equal((await proof('de',a)).status,200);
 assert.equal((await proof('de',b)).status,404);
 assert.equal((await proof('de',a,second.headers.get('set-cookie').split(';')[0])).status,404);
 assert.equal((await f.request('/api/enquiry/confirmation?lang=de',{headers:{Cookie:cookies}})).status,404);
 assert.equal((await proof('de','c'.repeat(48))).status,404);
});

test('trusted loopback proxy accepts one IP, rejects forged lists and separates rate keys',async t=>{
 const f=await fixture(t,{rateLimit:1,trustProxy:true});
 const post=ip=>f.send(f.payload,{'X-Real-IP':ip});
 assert.equal((await post('198.51.100.10')).status,202);
 assert.equal((await post('198.51.100.10')).status,429);
 assert.equal((await post('198.51.100.11')).status,202);
 for(const ip of ['198.51.100.10, 203.0.113.2','junk','198.51.100.10:443'])assert.equal((await post(ip)).status,400);
 assert.equal((await f.send(f.payload,{'X-Real-IP':''})).status,400);
 assert.equal(f.messages.length,2);
});

test('without trusted proxy a spoofed X-Real-IP cannot evade rate limit',async t=>{
 const f=await fixture(t,{rateLimit:1});
 assert.equal((await f.send(f.payload,{'X-Real-IP':'198.51.100.10'})).status,202);
 assert.equal((await f.send(f.payload,{'X-Real-IP':'198.51.100.11'})).status,429);
 assert.equal(f.messages.length,1);
});

test('production configuration fails closed without real scoped runtime values',()=>{
 assert.throws(()=>readEnquiryConfig({}),/EXOBASIS_ORIGIN/);
 const env={EXOBASIS_ORIGIN:'https://exobasis.example',EXOBASIS_SMTP_HOST:'smtp.example',EXOBASIS_SMTP_PORT:'587',EXOBASIS_MAIL_FROM:'from@example.org',EXOBASIS_MAIL_TO:'to@example.org'};
 assert.throws(()=>readEnquiryConfig(env),/origin|Origin|ORIGIN/);
});
