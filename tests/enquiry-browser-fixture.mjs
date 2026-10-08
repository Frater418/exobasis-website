// Isolated browser fixture: real loopback SMTP only. Never a production launch path.
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { SMTPServer } from 'smtp-server';
import nodemailer from 'nodemailer';
import { ROOT,loadJSON,resolveHTML } from '../src/lib/site.mjs';
import { readContent } from '../scripts/build.mjs';
import { renderPage } from '../src/templates/page.mjs';
import { createEnquiryServer } from '../src/server/enquiry.mjs';

let mode='accept',received=0,attempted=0;
const publicContexts=[],publicIntents=[];
const smtp=new SMTPServer({authOptional:true,disabledCommands:['STARTTLS','AUTH'],onData(stream,session,done){
 stream.resume();stream.on('end',()=>{attempted++;if(mode==='reject'){const error=new Error('Local browser rejection fixture');error.responseCode=550;done(error);}else{received++;done();}});
}});
await new Promise((resolve,reject)=>{smtp.once('error',reject);smtp.listen(0,'127.0.0.1',resolve);});
const transport=nodemailer.createTransport({host:'127.0.0.1',port:smtp.server.address().port,ignoreTLS:true,secure:false});
const config={origin:'http://127.0.0.1',sender:'fixture@exobasis.invalid',recipient:'inbox@exobasis.invalid',secureCookies:false,confirmationSeconds:300,rateLimit:100};
const api=createEnquiryServer(config,{sendMail:async mail=>{
 publicContexts.push(/^Öffentlicher Seitenbezug \/ Public page context: (.*)$/m.exec(mail.text)?.[1]??null);
 publicIntents.push(/^Anliegen \/ Enquiry: (.*)$/m.exec(mail.text)?.[1]??null);
 return transport.sendMail(mail);
}});
const pages=await readContent(),built=new Set(pages.map(p=>p.route));
const active={...loadJSON('src/data/contact.json'),enabled:true,email:'contact@exobasis.org',formEndpoint:'/api/enquiry'};
const html=new Map(pages.map(page=>[page.route,resolveHTML(renderPage(page,{mode:'production',domain:'https://exobasis.org',contact:active},pages),page.route,built,{mode:'production'})]));
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,config.origin);res.setHeader('X-Robots-Tag','noindex,nofollow');res.setHeader('Cache-Control','no-store');
 if(url.pathname.startsWith('/api/enquiry')){
  if(mode==='disconnect'&&req.method==='POST'){req.resume();req.on('end',()=>res.destroy());return;}
  if(mode==='proof-unavailable'&&req.method==='GET'){res.writeHead(503);res.end();return;}
  if(mode==='invalid-field'&&req.method==='POST'){req.resume();res.writeHead(422,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({status:'invalid',fields:['context']}));return;}
  api.emit('request',req,res);return;
 }
 if(url.pathname==='/__fixture/summary'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({received,attempted,mode,publicContexts,publicIntents}));return;}
 if(req.method==='POST'&&url.pathname.startsWith('/__fixture/mode/')){const candidate=url.pathname.split('/').at(-1);if(!['accept','reject','disconnect','proof-unavailable','invalid-field'].includes(candidate)){res.writeHead(400);res.end();return;}mode=candidate;res.end('ok');return;}
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 if(html.has(url.pathname)){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'"});res.end(html.get(url.pathname));return;}
 try{const file=path.resolve(ROOT,'public','.'+decodeURIComponent(url.pathname));if(!file.startsWith(path.join(ROOT,'public')+path.sep))throw new Error('scope');const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));config.origin=`http://127.0.0.1:${server.address().port}`;
console.log(JSON.stringify({origin:config.origin,pid:process.pid,smtpPort:smtp.server.address().port,fixture:true}));
const close=()=>{server.close(()=>{api.emit('close');transport.close();smtp.close(()=>process.exit(0));});};
process.stdin.on('data',close);process.once('SIGTERM',close);process.once('SIGINT',close);
