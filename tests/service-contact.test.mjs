import test from 'node:test';
import assert from 'node:assert/strict';
import {readContent} from '../scripts/build.mjs';
import {loadJSON} from '../src/lib/site.mjs';
import {renderPage} from '../src/templates/page.mjs';

const pages=await readContent();
const services=pages.filter(page=>page.kind==='service');
const confirmed=url=>({url,confirmed:true});
const active={...loadJSON('src/data/contact.json'),enabled:true,email:'contact@exobasis.org',formEndpoint:'/api/enquiry',cryptpad:{de:confirmed('https://forms.exobasis.org/form/#/view/example'),en:confirmed('https://forms.exobasis.org/form/#/view/example-en')}};
const section=(html,pattern)=>html.match(pattern)?.[1]||'';
const zones=html=>[
 section(html,/<section class="exb-page-hero\b[^>]*>([\s\S]*?)<\/section>/),
 section(html,/<section class="exb-page-scope\b[^>]*>([\s\S]*?)<\/section>/)
];
const alternatives=html=>[...html.matchAll(/<div class="exb-section-action" data-contact-alternative="encrypted">([\s\S]*?)<\/div>/g)].map(match=>match[1]);
const urls=html=>[...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(([,href])=>new URL(href.replaceAll('&amp;','&'),'https://local.invalid'));
const stripTags=html=>html.replace(/<[^>]*>/g,' ');

function assertChoice(block,page,{connected=false}={}){
 assert.ok(block,page.route+' has the required section');
 const options=alternatives(block);
 assert.equal(options.length,1,page.route+' has one encrypted alternative in this section');
 assert.ok(stripTags(options[0]).includes('CryptPad'),page.route+' names CryptPad in visible text');
 assert.ok(stripTags(options[0]).includes(page.lang==='de'?'Freiwilliger geschützter Einstieg':'Optional protected contact'),page.route+' makes the choice optional');
 const local=urls(options[0]).filter(url=>url.origin==='https://local.invalid');
 assert.equal(local.length,1,page.route+' provides one local explanation link');
 assert.equal(local[0].pathname,page.lang==='de'?'/de/anfrage/':'/en/enquiry/');
 assert.equal(local[0].hash,page.lang==='de'?'#verschluesselt':'#encrypted-contact');
 assert.equal(local[0].searchParams.get('anliegen'),page.primary.intent);
 const channels=[...options[0].matchAll(/<(span|a)\b([^>]*data-contact-channel="cryptpad"[^>]*)>/g)];
 assert.equal(channels.length,1,page.route+' uses the existing channel component once');
 assert.equal(channels[0][1],connected?'a':'span');
 if(connected){
  assert.ok(channels[0][2].includes('class="exb-channel-live"'));
  assert.ok(urls(options[0]).some(url=>url.href===active.cryptpad[page.lang].url));
  assert.ok(!/aria-disabled/.test(channels[0][2]));
 }else{
  assert.ok(channels[0][2].includes('aria-disabled="true"'));
  assert.ok(!/href=/.test(channels[0][2]));
  assert.ok(stripTags(options[0]).includes(page.lang==='de'?'Vorgesehen, noch nicht angeschlossen':'Planned, not connected yet'));
  assert.ok(!urls(options[0]).some(url=>url.origin==='https://forms.exobasis.org'));
 }
 const ordinary=urls(block).filter(url=>url.origin==='https://local.invalid'&&url.pathname===(page.lang==='de'?'/de/anfrage/':'/en/enquiry/')&&url.hash===(page.lang==='de'?'#kurzanfrage':'#short-enquiry'));
 assert.ok(ordinary.some(url=>url.searchParams.get('anliegen')===page.primary.intent),page.route+' keeps the normal service enquiry');
}

test('all 34 service variants expose the optional encrypted alternative in their opening and scope',()=>{
 assert.equal(services.length,34);
 for(const page of services){
  const html=renderPage(page,{mode:'preview'},pages);
  for(const block of zones(html))assertChoice(block,page);
  assert.equal(alternatives(html).length,2,page.route+' does not repeat this addition in every section');
  assert.ok(!/<form\b|<iframe\b/.test(html),page.route+' does not embed a new contact service');
 }
});

test('normal primary labels and the existing optional orientation remain in each service opening',()=>{
 for(const page of services){
  const opening=zones(renderPage(page,{mode:'preview'},pages))[0];
  assert.ok(stripTags(opening).includes(page.primary.label));
  assert.ok(urls(opening).some(url=>url.searchParams.get('anliegen')===(page.lang==='de'?'Orientierungsgespräch':'Orientation call')));
 }
});

test('confirmed language-specific contact targets activate through the existing shared gate',()=>{
 for(const lang of ['de','en']){
  const page=services.find(page=>page.lang===lang&&page.route.includes(lang==='de'?'kommunikation-wiederzugang':'communications-recovery'));
  const html=renderPage(page,{mode:'production',domain:'https://exobasis.org',contact:active},pages);
  for(const block of zones(html))assertChoice(block,page,{connected:true});
 }
});

test('preview and disabled publication keep configured encrypted targets inactive on services',()=>{
 for(const page of services.filter(page=>page.route.includes('trust-'))){
  for(const config of [{mode:'preview',contact:active},{mode:'production',domain:'https://exobasis.org',contact:{...active,enabled:false}}]){
   for(const block of zones(renderPage(page,config,pages)))assertChoice(block,page);
  }
 }
});

test('draft URLs and per-language unconfirmed targets cannot bypass the contact gate',()=>{
 for(const lang of ['de','en']){
  const page=services.find(page=>page.lang===lang);
  for(const target of [active.cryptpad[lang].url,{...active.cryptpad[lang],confirmed:false}]){
   const contact={...active,cryptpad:{...active.cryptpad,[lang]:target}};
   for(const block of zones(renderPage(page,{mode:'production',domain:'https://exobasis.org',contact},pages)))assertChoice(block,page);
  }
 }
});

test('language confirmation is independent for the added service channel slots',()=>{
 const contact={...active,cryptpad:{de:{...active.cryptpad.de,confirmed:false},en:active.cryptpad.en}};
 for(const lang of ['de','en']){
  const page=services.find(page=>page.lang===lang);
  for(const block of zones(renderPage(page,{mode:'production',domain:'https://exobasis.org',contact},pages)))assertChoice(block,page,{connected:lang==='en'});
 }
});

test('encrypted alternative links land on the existing protected section in each language',()=>{
 for(const lang of ['de','en']){
  const page=loadJSON(`src/content/${lang}/${lang==='de'?'anfrage':'enquiry'}.json`);
  const html=renderPage(page,{mode:'preview'},pages);
  assert.ok(html.includes(`id="${lang==='de'?'verschluesselt':'encrypted-contact'}"`));
  assert.equal(alternatives(html).length,0);
 }
});

test('a connected initial-assessment booking cannot hijack the encrypted-contact explanation link',()=>{
 const contact={...active,booking:{de:confirmed('https://book.exobasis.org/de/'),en:confirmed('https://book.exobasis.org/en/')}};
 for(const lang of ['de','en']){
  const page=services.find(page=>page.lang===lang&&page.primary.intent===(lang==='de'?'Persönliche Erstklärung':'Personal initial assessment'));
  const html=renderPage(page,{mode:'production',domain:'https://exobasis.org',contact},pages);
  assert.ok(urls(html).some(url=>url.href===contact.booking[lang].url),'normal booking remains connected');
  for(const block of zones(html)){
   const options=alternatives(block);
   assert.equal(options.length,1);
   const local=urls(options[0]).filter(url=>url.origin==='https://local.invalid');
   assert.equal(local.length,1,'encrypted-contact explanation must remain on the local enquiry page');
   assert.equal(local[0].hash,lang==='de'?'#verschluesselt':'#encrypted-contact');
   assert.equal(local[0].searchParams.get('anliegen'),page.primary.intent);
   assert.ok(!urls(options[0]).some(url=>url.href===contact.booking[lang].url));
  }
 }
});

test('non-service pages receive no service-specific contact additions',()=>{
 for(const page of pages.filter(page=>page.kind!=='service')){
  assert.equal(alternatives(renderPage(page,{mode:'preview'},pages)).length,0,page.route);
 }
});

test('rendering the alternative never rewrites candidate objects',()=>{
 for(const page of services){
  const original=structuredClone(page);
  renderPage(page,{mode:'preview'},pages);
  assert.deepEqual(page,original,page.route);
 }
});
