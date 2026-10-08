import nodemailer from 'nodemailer';
import { createEnquiryServer,readEnquiryConfig } from '../src/server/enquiry.mjs';
import { contactSettings,assertContactRecipient } from '../src/lib/contact.mjs';
import { loadJSON } from '../src/lib/site.mjs';
import { assertProductionReady } from '../src/lib/seo.mjs';
import { readContent } from './build.mjs';

const publication={...loadJSON('src/data/publication.json'),mode:'production'};
assertProductionReady(publication,await readContent());
const publicContact=contactSettings(publication);
if(!publicContact.active)throw new Error('Der bestätigte öffentliche Kontaktweg ist nicht aktiviert.');
const config=readEnquiryConfig();
if(config.origin!==publication.domain)throw new Error('EXOBASIS_ORIGIN stimmt nicht mit der freigegebenen Website überein.');
assertContactRecipient(config,publicContact);
const port=Number(process.env.EXOBASIS_ENQUIRY_PORT||'4180');
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('EXOBASIS_ENQUIRY_PORT muss zwischen 1024 und 65535 liegen.');
const transport=nodemailer.createTransport(config.smtp);
try {await transport.verify();}catch{throw new Error('SMTP_VERIFICATION_FAILED: Versandverbindung oder Anmeldung prüfen. Kein Server gestartet.');}
const server=createEnquiryServer(config,transport,{event:({code})=>console.log(JSON.stringify({at:new Date().toISOString(),code}))});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
console.log(`EXOBASIS enquiry endpoint: 127.0.0.1:${port}; HTTP reverse proxy with TLS is required.`);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close(()=>{transport.close();process.exit(0);});});
