import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {ROOT,registry} from '../src/lib/site.mjs';
import {pageDesign,designHero,layoutFamily} from '../src/lib/page-design.mjs';
import {readContent} from '../scripts/build.mjs';
import {renderMain} from '../src/templates/page.mjs';
const pages=await readContent();

test('All 150 actual routes have an explicit page family and existing hero assignment',async()=>{
 assert.equal(Object.keys(pageDesign.pages).length,150);
 assert.deepEqual(Object.keys(pageDesign.pages).sort(),registry.map(p=>p.route).sort());
 for(const p of pages){
  assert.ok(layoutFamily(p),p.route);
  const assigned=pageDesign.pages[p.route].hero;
  if(['service','catalogue','knowledge','article','country-hub','collaboration'].includes(p.kind)){
   assert.ok(assigned && !assigned.startsWith('existing-'),p.route);
   assert.ok(designHero(p).includes('class="exb-page-hero-media"'),p.route);
  }
 }
 for(const asset of Object.values(pageDesign.assets)){
  for(const variant of asset.srcset)assert.ok((await stat(path.join(ROOT,'public',variant.src))).size>0);
 }
 assert.throws(()=>layoutFamily({route:'/de/not-assigned/'}),/Missing per-page design/);
});
test('Actual main-page renderers expose real image areas, not just inherited thin summary strips',()=>{
 for(const p of pages){
  if(['service','catalogue','knowledge','article','country-hub','collaboration'].includes(p.kind)){
   const html=renderMain(p,{mode:'preview'},pages);
   assert.match(html,/class="exb-page-hero-media"/,p.route);
   assert.match(html,/width="(?:1600|1448)" height="(?:900|1086)"/,p.route);
   assert.match(html,/srcset="[^"]+800w/,p.route);
  }
 }
});
test('Existing home and country image identities are protected',()=>{
 for(const p of pages.filter(p=>['home','country'].includes(p.kind))){
  assert.equal(designHero(p),'');
  const main=renderMain(p,{mode:'preview'},pages);
  assert.doesNotMatch(main,/data-hero-motif=/,p.route);
  if(p.kind==='country')assert.match(main,/rel="license noreferrer"/,p.route);
 }
});
