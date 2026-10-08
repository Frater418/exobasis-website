import nodemailer from 'nodemailer';
import { createEnquiryServer,readEnquiryConfig } from '../src/server/enquiry.mjs';
import { contactSettings,assertContactRecipient } from '../src/lib/contact.mjs';
import { ROOT,registry,loadJSON } from '../src/lib/site.mjs';
import { prepareRelease } from '../src/lib/release-readiness.mjs';
import path from 'node:path';
import { readContent } from './build.mjs';

export async function startEnquiry(env=process.env,transportFactory=nodemailer.createTransport,contentReader=readContent){
const publication={...loadJSON('src/data/publication.json'),mode:'production'};
const release=prepareRelease(publication,await contentReader(),registry,{root:ROOT});
const publicContact=contactSettings(publication);
if(!publicContact.active)throw new Error('Der bestätigte öffentliche Kontaktweg ist nicht aktiviert.');
const config=readEnquiryConfig(env);
if(config.origin!==publication.domain)throw new Error('EXOBASIS_ORIGIN stimmt nicht mit der freigegebenen Website überein.');
assertContactRecipient(config,publicContact);
const port=Number(env.EXOBASIS_ENQUIRY_PORT||'4180');
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('EXOBASIS_ENQUIRY_PORT muss zwischen 1024 und 65535 liegen.');
const transport=transportFactory(config.smtp);
try {await transport.verify();}catch{transport.close();throw new Error('SMTP_VERIFICATION_FAILED: Versandverbindung oder Anmeldung prüfen. Kein Server gestartet.');}
const server=createEnquiryServer(config,transport,{routes:release.routes,event:({code})=>console.log(JSON.stringify({at:new Date().toISOString(),code}))});
try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(error){server.emit('close');transport.close();throw error;}
console.log(`EXOBASIS enquiry endpoint: 127.0.0.1:${port}; HTTP reverse proxy with TLS is required.`);
return {server,transport};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.join(ROOT,'scripts/serve-enquiry.mjs')){
 const {server,transport}=await startEnquiry();
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close(()=>{transport.close();process.exit(0);});});
}
