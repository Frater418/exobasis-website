import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT,loadJSON,routeIndex,enquiry} from '../src/lib/site.mjs';
import {readContent} from '../scripts/build.mjs';
const contracts=loadJSON('editorial/checks/package02-content-contract.json');
const pages=await readContent();const byRoute=new Map(pages.map(p=>[p.route,p]));
const content=c=>readFileSync(path.join(ROOT,'dist',c.route,'index.html'),'utf8');
const escapeRE=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const section=(h,id)=>h.match(new RegExp('<section\\b[^>]*\\bid="'+escapeRE(id)+'"[^>]*>([\\s\\S]*?)</section>'))?.[1]||'';
const hasDestination=(block,target)=>[...block.matchAll(/data-route="([^"]+)"/g)].some(([,route])=>new URL(route.replaceAll('&amp;','&'),'https://example.invalid').pathname===target);
test('Package 02 route assignments remain individually present',()=>{
 assert.equal(contracts.length,30);assert.equal(new Set(contracts.map(x=>x.route)).size,30);
 assert.equal(contracts.filter(x=>x.lang==='de').length,15);assert.ok(pages.length>=50);
 for(const c of contracts){const p=byRoute.get(c.route);assert.ok(p,c.route);assert.equal(p.lang,c.lang);assert.equal(p.editorial.package,'02');assert.ok(p.sourceRefs.length>=2,c.route);}
});
test('Fifteen added pairs retain explicit source translations',()=>{
 for(const c of contracts){const r=routeIndex.get(c.route);assert.ok(contracts.some(x=>x.route===r.translation));assert.equal(routeIndex.get(r.translation).translation,c.route);}
});
test('Each individual section task keeps its fragment identity and a rendered heading',()=>{
 for(const c of contracts){const p=byRoute.get(c.route);assert.deepEqual(p.sections.map(({id})=>id),c.sectionOrder.map(({id})=>id),c.route);const h=content(c);for(const s of c.sectionOrder){const block=section(h,s.id);assert.ok(block,c.route+' '+s.id);assert.match(block,/<h2\b[^>]*>\s*[^<\s]/,c.route+' '+s.id);}}
});
test('Every new primary enquiry has a configured, editable public intent',()=>{
 const cfg=loadJSON('src/data/contact.json');
 for(const c of contracts){const primary=byRoute.get(c.route).primary;assert.ok(primary.label.trim(),c.route);assert.ok(cfg.languages[c.lang].options.includes(primary.intent),c.route);const url=new URL(enquiry(c.lang,primary.intent),'http://example.invalid');assert.equal(url.searchParams.get('anliegen'),primary.intent);}
});
test('All new contextual relationships are placed in their assigned section',()=>{
 for(const c of contracts){const h=content(c);for(const l of c.mappedLinks){
  const m=l.position.match(/Kernabschnitt\s+(\d+)|#(?:abschnitt|section)-(\d+)/);let id;
  if(m)id=c.sectionOrder[Number(m[1]||m[2])-1].id;
  else if(/nächste Arbeit|next work/.test(l.position))id=c.lang==='de'?'anschluss':'next-work';
  else if(/Dein Auftrag|Your enquiry/.test(l.position))id=c.lang==='de'?'auftrag':'enquiry';
  else if(/Zusammenarbeit|Working together/.test(l.position))id=c.lang==='de'?'zusammenarbeit':'working-together';
  else assert.fail('Unmapped source position: '+l.position);
  assert.ok(hasDestination(section(h,id),l.target),c.route+' -> '+l.target+' in '+id);
 }}
});
test('All eighteen catalogue tasks per language are now authored',()=>{
 for(const p of pages.filter(p=>p.kind==='catalogue'))for(const item of p.groups.flatMap(x=>x.items))assert.ok(byRoute.has(item.route),item.route);
 assert.equal(pages.filter(p=>p.kind==='service').length,34);
});
test('Emergency records remain articles with setup service and seven source sections',()=>{
 for(const c of contracts.filter(x=>/notfallunterlagen|emergency-documents/.test(x.route))){const p=byRoute.get(c.route);assert.equal(p.kind,'article');assert.equal(p.model,'fachbeitrag');assert.equal(p.sections.length,7);assert.equal(p.sections[5].callToAction,true);assert.ok(p.sections[4].illustration.note);assert.ok(!p.scope);}
});
test('New material contains substantive body text, not only placeholder headings',()=>{
 for(const c of contracts){const p=byRoute.get(c.route);for(const s of p.sections)assert.ok(s.body.replace(/<[^>]+>/g,' ').trim().length>100,c.route+' '+s.id);assert.doesNotMatch(JSON.stringify(p),/Lorem ipsum|INSERT HERE|TODO:/i);}
});
test('Preview stays noindex and keeps the enquiry on its dedicated route',()=>{
 for(const c of contracts){const h=content(c);assert.match(h,/name="robots" content="noindex,nofollow"/);assert.doesNotMatch(h,/<form\b/);}
});
