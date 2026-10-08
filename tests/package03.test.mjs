import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT,loadJSON,routeIndex} from '../src/lib/site.mjs';
import {readContent} from '../scripts/build.mjs';
const contracts=loadJSON('editorial/checks/package03-content-contract.json');
const pages=await readContent();const index=new Map(pages.map(p=>[p.route,p]));
const html=r=>readFileSync(path.join(ROOT,'dist',r,'index.html'),'utf8');
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const section=(h,id)=>h.match(new RegExp('<section\\b[^>]*\\bid="'+esc(id)+'"[^>]*>([\\s\\S]*?)</section>'))?.[1]||'';
const hasDestination=(block,target)=>[...block.matchAll(/data-route="([^"]+)"/g)].some(([,route])=>new URL(route.replaceAll('&amp;','&'),'https://example.invalid').pathname===target);
test('Package 03 adds 36 unique source-bound variants; within the integrated 150, 76 DE and 74 EN',()=>{
 assert.equal(contracts.length,36);assert.equal(new Set(contracts.map(c=>c.route)).size,36);
 assert.equal(pages.length,150);assert.equal(pages.filter(p=>p.lang==='de').length,76);assert.equal(pages.filter(p=>p.lang==='en').length,74);
 for(const c of contracts){const p=index.get(c.route);assert.ok(p,c.route);assert.equal(p.editorial.package,'03');assert.equal(p.lang,c.lang);assert.equal(p.kind,'knowledge');}
});
test('All knowledge and origin identities now have substantive targets, not placeholders',()=>{
 for(const r of routeIndex.values())if(['themenhub','fachbeitrag','herkunft'].includes(r.model))assert.ok(index.has(r.route),r.route);
 const remaining=[...routeIndex.values()].filter(r=>!index.has(r.route));assert.equal(remaining.length,0);
 assert.equal(remaining.filter(r=>['laenderprofil','laenderuebersicht'].includes(r.model)).length,0);
});
test('Each knowledge section keeps its individual fragment and rendered H2',()=>{
 for(const c of contracts){const p=index.get(c.route);assert.deepEqual(p.sections.map(({id})=>id),c.sectionOrder.map(({id})=>id),c.route);const h=html(c.route);for(const s of c.sectionOrder){const block=section(h,s.id);assert.ok(block,c.route+' '+s.id);assert.match(block,/<h2\b[^>]*>\s*[^<\s]/,c.route+' '+s.id);}}
});
test('Every original section-specific contextual destination is retained at its assigned location',()=>{
 for(const c of contracts){const h=html(c.route);for(const l of c.links){if(!l.position.startsWith('#'))continue;const block=section(h,l.position.slice(1));assert.ok(hasDestination(block,l.target),c.route+' '+l.position+' '+l.target);}}
});
test('Six unpaired source cases stay unpaired and use a labelled language-home fallback',()=>{
 const singles=contracts.filter(c=>!routeIndex.get(c.route).translation);assert.equal(singles.length,6);
 for(const c of singles){const p=index.get(c.route);assert.equal(p.translation,null);const h=html(c.route);assert.doesNotMatch(h,/<link[^>]+hreflang=/i);assert.ok(h.includes(c.lang==='de'?'English homepage':'Deutsche Startseite')||h.includes(c.lang==='de'?'English: homepage':'Deutsch: Startseite'),c.route);}
});
test('Fifteen real new language pairs retain reciprocal identities',()=>{
 const paired=contracts.filter(c=>routeIndex.get(c.route).translation);assert.equal(paired.length,30);
 for(const c of paired){const target=routeIndex.get(c.route).translation;assert.ok(contracts.some(x=>x.route===target));assert.equal(routeIndex.get(target).translation,c.route);}
});
test('Every knowledge section has useful body content and an explicit review state',()=>{
 for(const c of contracts){const p=index.get(c.route);assert.ok(p.reviewStatus?.trim(),c.route);for(const s of p.sections)assert.ok(s.body.replace(/<[^>]+>/g,' ').trim().length>100,c.route+' '+s.id);assert.doesNotMatch(JSON.stringify(p),/Lorem ipsum|TODO:|INSERT HERE/i);}
});
test('Swiss origin page keeps all eight differentiated insurance and pension cases',()=>{
 const p=index.get('/de/wissen/ausweg-vorbereiten/aus-schweiz/');const s=p.sections.find(s=>s.id==='abschnitt-3');
 // PB-D86 binds five comparison roles while preserving all eight cases.
 assert.equal(s.criteria.rows.length,8);assert.equal(s.criteria.headers.length,5);assert.ok(s.criteria.rows.every(r=>r.length===5&&r.every(c=>typeof c==='string'&&c.trim())));
 const roles=[/Konstellation.*Ziel/,/Frage/,/Wer.*bestätigt/,/Anschlussnachweis/,/Quelle.*Geltungsbereich/];roles.forEach((role,i)=>assert.match(s.criteria.headers[i],role));
 const cases=[/Erwerbstätigkeit.*EU-\/EFTA/,/Erwerbstätige.*außerhalb/,/Entsandte/,/Schweizer Rente/,/Rentenbezug.*außerhalb/,/Nichterwerbstätige.*Haushaltsmitglieder/,/freiwillig.*AHV\/IV/,/Pensionskassen.*Freizügigkeitsguthaben/];cases.forEach((kind,i)=>assert.match(s.criteria.rows[i][0],kind));
 assert.match(s.body,/AHV\/IV/);assert.match(s.body,/beruflichen? Vorsorge/);
});
test('German military article presents statute and exception together, not blanket restriction',()=>{
 const s=index.get('/de/wissen/ausweg-vorbereiten/einberufung-ausreise-deutschland/').sections[0];for(const word of ['§ 3','Allgemeinverfügung','Ausnahme','Erfassung','Musterung','Einberufung'])assert.ok(s.body.includes(word),word);
});
test('Public context maps remain language-bound and origin links keep their source route',()=>{
 const origin=pages.filter(p=>p.model==='herkunft'&&p.departureContext);assert.ok(origin.length>=5);
 for(const p of origin){assert.equal(p.departureContext,p.route);assert.ok(html(p.route).includes('kontext='+encodeURIComponent(p.route)));}
 for(const lang of ['de','en']){const h=html(lang==='de'?'/de/anfrage/':'/en/enquiry/');const raw=h.match(/<script type="application\/json" id="exb-public-contexts">([\s\S]*?)<\/script>/)?.[1];assert.ok(raw);const map=JSON.parse(raw);for(const route of Object.keys(map)){assert.ok(route.startsWith('/'+lang+'/'),route);assert.ok(index.has(route),route);}}
});
test('Public context script does not submit or persist private messages',()=>{
 const js=readFileSync(path.join(ROOT,'public/js/departure-context.js'),'utf8');assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|localStorage|sessionStorage|\.innerHTML\s*=/);
});
test('Knowledge media has accessible labels and a real local asset',()=>{
 for(const c of contracts){const s=index.get(c.route).knowledgeSummary;assert.ok(s.imageAlt.trim(),c.route);assert.ok(readFileSync(path.join(ROOT,'public/assets',s.image)).length>10000,c.route);}
});
test('Editorial source references resolve to preserved modules and source units',()=>{
 const units=loadJSON('editorial/source-index.json');for(const c of contracts)for(const ref of index.get(c.route).sourceRefs)assert.ok(units.some(x=>x.module===ref.module&&x.anchor===ref.anchor),c.route+' '+JSON.stringify(ref));
});
test('Preview articles stay noindex and route enquiries to the dedicated page',()=>{
 for(const c of contracts){const h=html(c.route);assert.match(h,/name="robots" content="noindex,nofollow"/);assert.doesNotMatch(h,/<form\b/);}
});
