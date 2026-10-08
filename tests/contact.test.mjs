import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJSON } from '../src/lib/site.mjs';
import { renderPage } from '../src/templates/page.mjs';
import { readContent } from '../scripts/build.mjs';
import { contactSettings,assertContactRecipient,contactMarkup } from '../src/lib/contact.mjs';
const page=lang=>loadJSON(`src/content/${lang}/${lang==='de'?'anfrage':'enquiry'}.json`);
const confirmed=url=>({url,confirmed:true});
const active={...loadJSON('src/data/contact.json'),enabled:true,email:'contact@exobasis.org',formEndpoint:'/api/enquiry',calendar:{de:confirmed('https://calendar.exobasis.org/de/'),en:confirmed('https://calendar.exobasis.org/en/')},cryptpad:{de:confirmed('https://forms.exobasis.org/form/#/view/example'),en:confirmed('https://forms.exobasis.org/form/#/view/example-en')},simplex:{de:confirmed('https://simplex.chat/contact#example-de'),en:confirmed('https://simplex.chat/contact#example-en')},booking:{de:confirmed('https://book.exobasis.org/de/'),en:confirmed('https://book.exobasis.org/en/')}};
test('public preview stays inactive even with configured contact destinations',()=>{for(const lang of ['de','en']){const html=renderPage(page(lang),{mode:'preview',contact:active},[]);assert.match(html,/data-send-enabled="false"/);assert.doesNotMatch(html,/class="exb-channel-live"/);assert.match(html,/exb-local-notice/);}});
test('connected rendering exposes true submit, public mail and explicit language-specific outbound channels',()=>{for(const lang of ['de','en']){const html=renderPage(page(lang),{mode:'production',domain:'https://exobasis.org',contact:active},[]);assert.match(html,/data-send-enabled="true"/);assert.match(html,/action="\/api\/enquiry"/);assert.doesNotMatch(html,/exb-local-notice|exb-check-form|type="submit" class="exb-btn" disabled/);assert.match(html,/name="website"/);assert.ok(html.includes('href="mailto:contact@exobasis.org"'));assert.ok(html.includes(`href="https://calendar.exobasis.org/${lang}/"`));assert.ok(html.includes(active.cryptpad[lang].url));assert.ok(html.includes(active.simplex[lang].url));}});
test('missing endpoint or malformed/missing language destination fails explicitly',()=>{for(const override of [{formEndpoint:'https://evil.example/send'},{email:'bad\nheader@example.org'},{calendar:{de:confirmed('https://calendar.exobasis.org/de/')}},{calendar:{de:confirmed('javascript:alert(1)'),en:confirmed('https://calendar.exobasis.org/en/')}}])assert.throws(()=>contactSettings({mode:'production',contact:{...active,...override}}));});
test('draft URLs and per-language unconfirmed channels stay blocked while enquiry and email work',()=>{
 const draft={...active,calendar:{de:'https://calendar.exobasis.org/de/',en:'https://calendar.exobasis.org/en/'},booking:{de:{...active.booking.de,confirmed:false},en:active.booking.en},cryptpad:{de:{...active.cryptpad.de,confirmed:false},en:{...active.cryptpad.en,confirmed:false}},simplex:{de:{...active.simplex.de,confirmed:false},en:{...active.simplex.en,confirmed:false}}};
 for(const lang of ['de','en']){
  const html=renderPage(page(lang),{mode:'production',domain:'https://exobasis.org',contact:draft},[]);
  assert.match(html,/data-send-enabled="true"/);assert.ok(html.includes('mailto:contact@exobasis.org'));
  assert.doesNotMatch(html,/href="https:\/\/calendar\.exobasis\.org/);
  assert.doesNotMatch(html,/href="https:\/\/forms\.exobasis\.org|href="https:\/\/simplex\.chat/);
  if(lang==='de')assert.doesNotMatch(html,/href="https:\/\/book\.exobasis\.org\/de\//);
 }
 assert.equal(contactSettings({mode:'production',contact:draft}).booking.de,null);
 assert.equal(contactSettings({mode:'production',contact:draft}).booking.en,active.booking.en.url);
});
test('startup binds the confirmed public, internal recipient and sender roles separately',()=>{
 const publicContact=contactSettings({mode:'production',contact:{...active,email:'info@exobasis.com'}});
 const runtime={recipient:'forminbox@exobasis.com',sender:'noreply@exobasis.com'};
 assert.doesNotThrow(()=>assertContactRecipient(runtime,publicContact));
 for(const recipient of ['info@exobasis.com','legal@exobasis.com','other@exobasis.org','visitor@exobasis.com','forminbox@exobasis.com,other@example.org','',undefined]){
  assert.throws(()=>assertContactRecipient({...runtime,recipient},publicContact),/EXOBASIS_MAIL_TO/);
 }
 for(const sender of ['info@exobasis.com','billing@exobasis.com','visitor@example.org','',undefined]){
  assert.throws(()=>assertContactRecipient({...runtime,sender},publicContact),/EXOBASIS_MAIL_FROM/);
 }
 for(const email of ['legal@exobasis.com','forminbox@exobasis.com','info@exobasis,com',null]){
  assert.throws(()=>assertContactRecipient(runtime,{...publicContact,email}),/öffentliche Kontaktadresse/);
 }
});
test('confirmed public mail is configured without exposing internal mail roles',async()=>{
 const configured=loadJSON('src/data/contact.json');
 assert.equal(configured.email,'info@exobasis.com');
 const pages=await readContent();
 const config={mode:'production',domain:'https://exobasis.com',contact:{...configured,enabled:true,formEndpoint:'/api/enquiry'}};
 for(const entry of pages){
  const html=renderPage(entry,config,pages);
  assert.doesNotMatch(html,/(?:forminbox|noreply|billing)@exobasis\.com/i,entry.route);
  if(['home','enquiry'].includes(entry.kind))assert.ok(html.includes('mailto:info@exobasis.com'),entry.route);
 }
 const publication=loadJSON('src/data/publication.json');
 assert.ok(JSON.stringify(publication).includes('legal@exobasis.com'));
});

const home=lang=>loadJSON(`src/content/${lang}/home.json`);
const homeSlots=html=>[...html.matchAll(/<(span|a)\b([^>]*\bdata-contact-channel="(email|cryptpad)"[^>]*)>/g)].map(([,tag,attrs,key])=>({tag,attrs,key}));
test('both homepages receive confirmed channels before JavaScript, keeping their existing design',()=>{
 for(const lang of ['de','en']){
  const html=renderPage(home(lang),{mode:'production',domain:'https://exobasis.org',contact:active},[]);
  const slots=homeSlots(html);
  assert.deepEqual(slots.map(slot=>[slot.key,slot.tag]),[['email','a'],['cryptpad','a']]);
  for(const slot of slots){assert.match(slot.attrs,/class="exb6-channel"/);assert.doesNotMatch(slot.attrs,/aria-disabled/);assert.match(slot.attrs,/rel="noreferrer"/);}
  assert.ok(slots[0].attrs.includes('href="mailto:contact@exobasis.org"'));
  assert.ok(slots[1].attrs.includes(`href="${active.cryptpad[lang].url}"`));
  assert.match(html,/<a\b[^>]*data-contact-channel="email"[^>]*><svg/);
 }
});
test('homepage preview and disabled publication do not activate configured channels',()=>{
 for(const lang of ['de','en'])for(const config of [{mode:'preview',contact:active},{mode:'production',domain:'https://exobasis.org',contact:{...active,enabled:false}}]){
  const slots=homeSlots(renderPage(home(lang),config,[]));
  assert.equal(slots.length,2);
  for(const slot of slots){assert.equal(slot.tag,'span');assert.match(slot.attrs,/aria-disabled="true"/);assert.doesNotMatch(slot.attrs,/href=/);}
 }
});
test('homepage channels honour each language confirmation and reject draft-only URLs',()=>{
 for(const deTarget of [active.cryptpad.de.url,{...active.cryptpad.de,confirmed:false},null]){
  const config={mode:'production',domain:'https://exobasis.org',contact:{...active,cryptpad:{de:deTarget,en:active.cryptpad.en}}};
  if(deTarget===null){assert.throws(()=>renderPage(home('de'),config,[]));continue;}
  assert.equal(homeSlots(renderPage(home('de'),config,[])).find(slot=>slot.key==='cryptpad').tag,'span');
  assert.equal(homeSlots(renderPage(home('en'),config,[])).find(slot=>slot.key==='cryptpad').tag,'a');
 }
});
test('contact activation preserves homepage labels and handles either attribute order once',()=>{
 const config={mode:'production',contact:active};
 const content='<svg aria-hidden="true"><use href="#exb-i-mail"></use></svg><span>Existing label</span>';
 for(const attrs of ['aria-disabled="true" class="exb6-channel" data-contact-channel="email"','data-contact-channel="email" class="exb6-channel extra" aria-disabled="true"']){
  const source=`<span ${attrs}>${content}</span>`;
  const html=contactMarkup(source,{lang:'en',kind:'home'},config);
  assert.match(html,/^<a\b/);assert.ok(html.endsWith(content+'</a>'));assert.doesNotMatch(html,/aria-disabled/);
  assert.equal(contactMarkup(html,{lang:'en',kind:'home'},config),html);
 }
 const unrelated=`<span class="other-component" aria-disabled="true" data-contact-channel="email">${content}</span>`;
 assert.equal(contactMarkup(unrelated,{lang:'en',kind:'home'},config),unrelated);
});

