import { e,loadJSON } from './site.mjs';

const localEnquiry=lang=>lang==='de'?'/de/anfrage/':'/en/enquiry/';
const orientation=lang=>lang==='de'?'Orientierungsgespräch':'Orientation call';
const initial=lang=>lang==='de'?'Persönliche Erstklärung':'Personal initial assessment';
const labels={de:{calendar:'Kostenloses Orientierungsgespräch buchen',booking:'Erstklärung buchen',cryptpad:'Verschlüsselte Anfrage öffnen',simplex:'Vertrauliches Gespräch über SimpleX',email:'E-Mail schreiben'},en:{calendar:'Book a free orientation call',booking:'Book your initial assessment',cryptpad:'Open encrypted enquiry',simplex:'Confidential conversation through SimpleX',email:'Write an email'}};

function publicURL(value,key){
 if(value==null)return null;
 let url;try{url=new URL(value);}catch{throw new Error('Ungültiges öffentliches Kontaktziel: '+key);}
 if(url.protocol!=='https:'||url.username||url.password||url.hostname==='localhost'||/(?:^|\.)(?:invalid|test|example)$/.test(url.hostname))throw new Error('Kontaktziel benötigt bestätigtes HTTPS: '+key);
 return url.href;
}

function confirmedTarget(value,key){
 if(value==null)return null;
 // A URL alone is a draft, never evidence that the external channel is staffed.
 if(typeof value==='string')return null;
 if(typeof value!=='object'||Array.isArray(value)||typeof value.url!=='string')throw new Error('Kontaktziel benötigt URL und Bestätigung: '+key);
 const url=publicURL(value.url,key);
 return value.confirmed===true?url:null;
}

export function assertContactRecipient(config, publicContact){
 // EXOBASIS-MAILROLLEN-20261008: bind trusted startup configuration, not inbound mail filters.
 if(publicContact.email!=='info@exobasis.com')throw new Error('Die öffentliche Kontaktadresse muss der bestätigten info-Adresse entsprechen.');
 if(config.recipient!=='forminbox@exobasis.com')throw new Error('EXOBASIS_MAIL_TO muss den bestätigten internen Formularempfänger verwenden.');
 if(config.sender!=='noreply@exobasis.com')throw new Error('EXOBASIS_MAIL_FROM muss den bestätigten automatischen Absender verwenden.');
}

export function contactSettings(config={mode:'preview'}){
 const data=config.contact||loadJSON('src/data/contact.json');
 if(config.mode!=='production'||data.enabled!==true)return {...data,active:false};
 if(data.formEndpoint!=='/api/enquiry')throw new Error('Aktiver Anfrageweg benötigt /api/enquiry auf derselben Origin.');
 if(typeof data.email!=='string'||!/^[^\s@<>\x00-\x1f]+@[^\s@<>\x00-\x1f]+\.[^\s@<>\x00-\x1f]+$/.test(data.email))throw new Error('Öffentliche Anfrageadresse fehlt.');
 const channels={};
 for(const key of ['calendar','cryptpad','simplex','booking']){
  if(data[key]==null)continue;
  if(typeof data[key]!=='object'||!data[key].de||!data[key].en)throw new Error('Kontaktziel benötigt DE und EN: '+key);
  channels[key]={};
  for(const lang of ['de','en'])channels[key][lang]=confirmedTarget(data[key][lang],key+'.'+lang);
 }
 return {...data,...channels,active:true};
}

/** Bind only confirmed public destinations. External services load only on a deliberate click. */
export function contactMarkup(html,page,config){
 const data=contactSettings(config),lang=page.lang,de=lang==='de',text=labels[lang];
 if(!data.active)return html;
 html=html.replace(/<span\b([^>]*\bdata-contact-channel="(email|cryptpad|simplex)"[^>]*)>([\s\S]*?<\/span>)\s*<\/span>/g,(whole,attrs,key,body)=>{
  const classes=attrs.match(/\bclass="([^\"]*)"/)?.[1].split(/\s+/)||[];
  if(!/\baria-disabled="true"/.test(attrs)||!classes.some(name=>name==='exb-channel-disabled'||name==='exb6-channel'))return whole;
  const target=key==='email'?'mailto:'+data.email:data[key]?.[lang];
  if(!target)return whole;
  if(classes.includes('exb6-channel'))return `<a${attrs.replace(/\s+aria-disabled="true"/,'')} href="${e(target)}" rel="noreferrer">${body}</a>`;
  const help=key==='email'?data.email:key==='cryptpad'?(de?'Du wechselst zum verschlüsselten Anfragebereich in CryptPad.':'You are opening the encrypted enquiry area in CryptPad.'):(de?'Öffnet den vereinbarten privaten Kontakt.':'Opens the agreed private contact.');
  return `<a class="exb-channel-live" data-contact-channel="${key}" href="${e(target)}" rel="noreferrer"><span><strong>${text[key]}</strong><small>${e(help)}</small></span></a>`;
 });
 // Compiled enquiry links still use canonical source routes at this rendering seam.
 html=html.replace(/<a\b([^>]*\bhref="([^\"]+)"[^>]*)>([\s\S]*?)<\/a>/g,(whole,attrs,href,body)=>{
  let url;try{url=new URL(href.replaceAll('&amp;','&'),'https://local.invalid');}catch{return whole;}
  if(url.origin!=='https://local.invalid'||url.pathname!==localEnquiry(lang))return whole;
  // A section explaining another contact route is not a booking action.
  if(url.hash&&url.hash!==(de?'#kurzanfrage':'#short-enquiry'))return whole;
  const intent=url.searchParams.get('anliegen');
  const key=intent===orientation(lang)?'calendar':intent===initial(lang)?'booking':null;
  if(!key||!data[key]?.[lang])return whole;
  return `<a${attrs.replace(/\bhref="[^\"]+"/,`href="${e(data[key][lang])}"`)} rel="noreferrer">${text[key]}</a>`;
 });
 if(page.kind==='enquiry'){
  html=html.replace(/<div class="exb-local-notice" role="note">[\s\S]*?<\/div>/,'');
  html=html.replace('action="" data-send-enabled="false"','action="/api/enquiry" data-send-enabled="true"');
  html=html.replace('<button type="submit" class="exb-btn" disabled>','<button type="submit" class="exb-btn">');
  html=html.replace(/<button type="button" id="exb-check-form"[^>]*>[\s\S]*?<\/button>/,'');
  html=html.replace('</fieldset>',`<div class="exb-sr-only" aria-hidden="true"><label for="exb-website">${de?'Dieses Feld leer lassen':'Leave this field empty'}</label><input id="exb-website" name="website" type="text" tabindex="-1" autocomplete="off" maxlength="200"/></div></fieldset>`);
  if(data.calendar?.[lang])html=html.replace(/(<div class="exb-contact-call[^>]*>[\s\S]*?)<a\b[^>]*href="#[^\"]+"[^>]*>[\s\S]*?<\/a>/,(whole,start)=>`${start}<a class="exb-btn" href="${e(data.calendar[lang])}" rel="noreferrer">${text.calendar}</a>`);
 }
 if(page.kind==='confirmation')html=html.replace('</body>','<script src="/js/confirmation.js" defer></script></body>');
 return html;
}
