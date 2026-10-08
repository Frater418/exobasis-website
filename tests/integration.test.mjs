import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import path from 'node:path';
import {ROOT,loadJSON,registry,descriptions} from '../src/lib/site.mjs';
import {readContent} from '../scripts/build.mjs';
const pages=await readContent(),byRoute=new Map(pages.map(p=>[p.route,p]));
const html=p=>readFileSync(path.join(ROOT,'dist',p.route,'index.html'),'utf8');
test('Integration retains all registered source-page identities',()=>{
 assert.equal(new Set(pages.map(p=>p.route)).size,150);
 assert.deepEqual(new Set(pages.map(p=>p.route)),new Set(registry.map(p=>p.route)));
});
test('All 54 country profiles retain eleven authored sections and matching language routes',()=>{
 const cp=pages.filter(p=>p.kind==='country');assert.equal(cp.length,54);
 for(const p of cp){assert.equal(p.sections.length,11,p.route);assert.equal(byRoute.get(p.translation).translation,p.route);for(const s of p.sections)assert.ok(html(p).includes('id="'+s.id+'"'),p.route+'#'+s.id);}
});
test('Both country directories contain all 27 active country targets',()=>{
 for(const p of pages.filter(p=>p.kind==='country-hub')){
  assert.equal(p.countryDirectoryCount,27);const h=html(p);
  assert.equal((h.match(/class="exb-country-directory-item"/g)||[]).length,27);
  for(const c of pages.filter(c=>c.lang===p.lang&&c.kind==='country'))assert.ok(h.includes('data-route="'+c.route+'"'),c.route);
 }
});
test('No registered website target is left disabled by an old package boundary',()=>{
 for(const p of pages){const h=html(p);for(const tag of h.matchAll(/<(?:span|a)\b[^>]*>/g))if(tag[0].includes('data-route='))assert.doesNotMatch(tag[0],/aria-disabled="true"|data-package-dependency/);}
});
test('Shared footer is identical across every page of the same language',()=>{
 for(const lang of ['de','en']){const variants=pages.filter(p=>p.lang===lang);const signatures=new Set(variants.map(p=>html(p).match(/<footer\b[\s\S]*?<\/footer>/)?.[0].replace(/(?:href|src)="[^"]*"/g,'href="route-resolved"').replace(/exb-static-desc-\d+/g,'description-id')));assert.equal(signatures.size,1,lang);assert.ok(!signatures.has(undefined));}
});
test('All page types use one V6 stylesheet and one common site stylesheet',()=>{
 for(const p of pages){const h=html(p);assert.equal((h.match(/href="[^"]*css\/v6.css"/g)||[]).length,1);assert.equal((h.match(/href="[^"]*css\/site.css"/g)||[]).length,1);assert.equal((h.match(/href="[^"]*css\/countries.css"/g)||[]).length,['country','country-hub'].includes(p.kind)?1:0);}
});
test('All country contexts merge into both enquiry maps without language leakage',()=>{
 const contexts=loadJSON('src/data/country-contexts.json');assert.equal(Object.keys(contexts).length,54);
 for(const lang of ['de','en']){const p=pages.find(p=>p.lang===lang&&p.kind==='enquiry');const blob=JSON.parse(html(p).match(/id="exb-public-contexts">([\s\S]*?)<\/script>/)[1]);for(const r of Object.keys(blob)){assert.ok(r.startsWith('/'+lang+'/'),r);assert.ok(byRoute.has(r),r);}for(const r of Object.keys(contexts).filter(r=>r.startsWith('/'+lang+'/')))assert.deepEqual(blob[r],contexts[r]);}
});
test('Unresolved legal drafts retain release blockers rather than invented operator details',()=>{
 const lp=pages.filter(p=>p.kind==='legal');assert.equal(lp.length,6);
 for(const p of lp){if(p.reviewStatus==='blocked_required_facts'){assert.ok(p.releaseBlockers.length,p.route);assert.match(html(p),/class="exb-legal-warning"/);assert.match(html(p),/class="exb-review-requirements"/);}}
});
test('Every linked target has its own nonempty description',()=>{
 for(const r of registry){assert.ok(descriptions[r.route]?.trim(),r.route);assert.ok(byRoute.get(r.route)?.description?.trim(),r.route);}
});
test('Country maps remain accessible regardless of later licensed photos',()=>{
 for(const p of pages.filter(p=>p.kind==='country')){assert.ok(p.country.map.endsWith('.svg'));assert.ok(p.country.imageAlt?.trim(),p.route);assert.ok(readFileSync(path.join(ROOT,'dist/assets',p.country.map)).length>1000);}
});
