import http from 'node:http';
import { isIP } from 'node:net';
import { createHmac,randomBytes } from 'node:crypto';
import { loadJSON } from '../lib/site.mjs';
import { publicContexts } from '../lib/enquiry-context.mjs';

const contact=loadJSON('src/data/contact.json');
const fields=new Set(['lang','replyLanguage','email','intent','name','message','context','website']);
const languages=new Set(['de','en']);
const emailOK=value=>typeof value==='string'&&value.length<=254&&/^[^\s@<>\x00-\x1f\x7f]+@[^\s@<>\x00-\x1f\x7f]+\.[^\s@<>\x00-\x1f\x7f]+$/.test(value);
const confirmationPath=lang=>lang==='de'?'/de/anfrage/bestaetigung/':'/en/enquiry/confirmation/';
const cookiePath='/api/enquiry/confirmation';
const referencePattern=/^[a-f0-9]{48}$/;
const receiptHeader='x-exobasis-receipt-ref';
const cookieName=ref=>`exb_submission_${ref}`;

export function readEnquiryConfig(env=process.env) {
 const required=key=>{if(typeof env[key]!=='string'||!env[key].trim())throw new Error('Fehlender Laufzeitwert: '+key);return key==='EXOBASIS_SMTP_PASSWORD'?env[key]:env[key].trim();};
 const origin=required('EXOBASIS_ORIGIN');let url;
 try{url=new URL(origin);}catch{throw new Error('EXOBASIS_ORIGIN ist keine gültige HTTPS-Origin.');}
 if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password||/(?:^|\.)(?:example|invalid|test|localhost)$/.test(url.hostname)||!url.hostname.includes('.')||/^\d+(\.\d+){3}$/.test(url.hostname))throw new Error('EXOBASIS_ORIGIN muss die bestätigte öffentliche HTTPS-Origin sein.');
 const sender=required('EXOBASIS_MAIL_FROM'),recipient=required('EXOBASIS_MAIL_TO');
 if([sender,recipient].some(value=>!emailOK(value)||/@(?:[^@]*\.)?(?:example|invalid|test|localhost)$/.test(value)))throw new Error('Ungültige Versand- oder Empfängeradresse.');
 const port=Number(required('EXOBASIS_SMTP_PORT'));
 if(![465,587].includes(port))throw new Error('EXOBASIS_SMTP_PORT muss 465 oder 587 sein; TLS ist erforderlich.');
 return {origin,sender,recipient,secureCookies:true,confirmationSeconds:300,rateLimit:5,trustProxy:env.EXOBASIS_TRUST_PROXY==='true',smtp:{host:required('EXOBASIS_SMTP_HOST'),port,secure:port===465,requireTLS:port!==465,auth:{user:required('EXOBASIS_SMTP_USER'),pass:required('EXOBASIS_SMTP_PASSWORD')},connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:20_000,disableFileAccess:true,disableUrlAccess:true,tls:{minVersion:'TLSv1.2'}}};
}

function validate(data,allowedContexts) {
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!fields.has(k)))return ['form'];
 const errors=[];
 if(!languages.has(data.lang))errors.push('lang');
 if(!languages.has(data.replyLanguage))errors.push('replyLanguage');
 if(!emailOK(data.email))errors.push('email');
 if(!contact.languages[data.lang]?.options.includes(data.intent))errors.push('intent');
 for(const [key,max] of [['name',120],['message',2000],['context',200],['website',200]]) {
  if(data[key]!==undefined&&(typeof data[key]!=='string'||data[key].length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(data[key])))errors.push(key);
 }
 if(typeof data.name==='string'&&/[\r\n]/.test(data.name))errors.push('name');
 if(data.context&&!allowedContexts[data.lang]?.has(data.context))errors.push('context');
 return [...new Set(errors)];
}

async function readBody(req) {
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>16_384){const error=new Error('BODY_LIMIT');error.status=413;throw error;}chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{const error=new Error('JSON_INVALID');error.status=400;throw error;}
}

/** One process, transient receipt/rate metadata only. No message database or body logs. */
export function createEnquiryServer(config,transport,{now=Date.now,event=()=>{},routes}={}) {
 const allowedContexts={de:new Set(Object.keys(publicContexts('de',{routes}))),en:new Set(Object.keys(publicContexts('en',{routes})))};
 const receipts=new Map(),rates=new Map(),rateKey=randomBytes(32);
 const write=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers});res.end(JSON.stringify(data));};
 const cookie=(ref,token)=>`${cookieName(ref)}=${token}; Path=${cookiePath}; Max-Age=${config.confirmationSeconds}; HttpOnly; SameSite=Strict${config.secureCookies?'; Secure':''}`;
 const cleanup=()=>{const at=now();for(const [key,value] of receipts)if(value.expires<=at)receipts.delete(key);for(const [key,value] of rates)if(value.expires<=at)rates.delete(key);};
 const timer=setInterval(cleanup,60_000);timer.unref();
 const server=http.createServer(async(req,res)=>{
  try {
   cleanup();const url=new URL(req.url,'http://127.0.0.1');
   if(url.pathname===cookiePath&&req.method==='GET') {
    if(req.headers.origin&&req.headers.origin!==config.origin){write(res,403,{status:'rejected',code:'ORIGIN'});return;}
    const lang=url.searchParams.get('lang'),ref=req.headers[receiptHeader];
    if(typeof ref!=='string'||!referencePattern.test(ref)){write(res,404,{status:'neutral'});return;}
    const token=new RegExp(`(?:^|;\\s*)${cookieName(ref)}=([a-f0-9]{48})(?:;|$)`).exec(req.headers.cookie||'')?.[1];
    const receipt=token&&receipts.get(token);
    if(!receipt||receipt.ref!==ref||receipt.lang!==lang||receipt.expires<=now()){write(res,404,{status:'neutral'});return;}
    // Read is idempotent: a lost GET response must not destroy a confirmed submission.
    write(res,200,{status:'sent',lang});return;
   }
   if(url.pathname!=='/api/enquiry'){write(res,404,{status:'error',code:'NOT_FOUND'});return;}
   if(req.method!=='POST'){write(res,405,{status:'error',code:'METHOD'},{Allow:'POST'});return;}
   if(req.headers.origin!==config.origin){write(res,403,{status:'rejected',code:'ORIGIN'});return;}
   if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')){write(res,415,{status:'error',code:'CONTENT_TYPE'});return;}
   if(Number(req.headers['content-length'])>16_384){write(res,413,{status:'error',code:'BODY_LIMIT'});req.resume();return;}
   const ref=req.headers[receiptHeader];
   if(ref!==undefined&&(typeof ref!=='string'||!referencePattern.test(ref))){write(res,400,{status:'error',code:'RECEIPT_REF'});return;}
   // Only an explicitly trusted loopback proxy may supply one well-formed client IP.
   const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
   let address=req.socket.remoteAddress;
   if(config.trustProxy&&local){
    address=req.headers['x-real-ip'];
    if(typeof address!=='string'||!isIP(address)){write(res,400,{status:'error',code:'PROXY_IP'});return;}
   }
   const key=createHmac('sha256',rateKey).update(address||'unknown').digest('hex');
   const rate=rates.get(key)||{count:0,expires:now()+600_000};
   if(rate.count>=(config.rateLimit||5)||rates.size>=10_000&&!rates.has(key)){write(res,429,{status:'rejected',code:'RATE_LIMIT'},{'Retry-After':'600'});return;}
   rate.count++;rates.set(key,rate);
   const data=await readBody(req),errors=validate(data,allowedContexts);
   if(errors.length){write(res,422,{status:'invalid',fields:errors});return;}
   if(data.website){write(res,429,{status:'rejected',code:'SPAM'});return;}
   if(receipts.size>=10_000){write(res,503,{status:'error',code:'CAPACITY'});return;}
   const text=[`Sprache / Language: ${data.lang}`,`Antwortsprache / Reply language: ${data.replyLanguage}`,`Anliegen / Enquiry: ${data.intent}`,`Name / Alias: ${data.name||''}`,`Öffentlicher Seitenbezug / Public page context: ${data.context||''}`,'','Nachricht / Message:',data.message||''].join('\n');
   let result;
   try {result=await transport.sendMail({from:config.sender,to:config.recipient,replyTo:data.email,envelope:{from:config.sender,to:[config.recipient]},subject:`EXOBASIS: ${data.intent}`,text,disableFileAccess:true,disableUrlAccess:true});}
   catch(error){
    // A dropped connection after DATA can be ambiguous. Never auto-retry or assert failure as certainty.
    const rejected=Number.isInteger(error.responseCode)&&error.responseCode>=400;
    event({code:rejected?'TRANSPORT_REJECTED':'TRANSPORT_UNCERTAIN'});
    write(res,rejected?502:504,{status:rejected?'error':'unknown',code:rejected?'TRANSPORT_REJECTED':'TRANSPORT_UNCERTAIN'});return;
   }
   if(!result?.accepted?.includes(config.recipient)||result.rejected?.length){event({code:'TRANSPORT_REJECTED'});write(res,502,{status:'error',code:'TRANSPORT_REJECTED'});return;}
   const token=ref&&randomBytes(24).toString('hex');
   if(token)receipts.set(token,{ref,lang:data.lang,expires:now()+config.confirmationSeconds*1000});
   event({code:'TRANSPORT_ACCEPTED'});write(res,202,{status:'sent',confirmation:confirmationPath(data.lang)},token?{'Set-Cookie':cookie(ref,token)}:{});
  } catch(error) {event({code:error.status?'REQUEST_REJECTED':'SERVER_ERROR'});if(!res.headersSent)write(res,error.status||500,{status:'error',code:error.status?error.message:'SERVER_ERROR'});else res.end();}
 });
 server.headersTimeout=15_000;server.requestTimeout=25_000;server.on('close',()=>{clearInterval(timer);receipts.clear();rates.clear();});
 return server;
}
