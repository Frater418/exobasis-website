import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ROOT,loadJSON,routeIndex } from '../src/lib/site.mjs';
import { readContent } from '../scripts/build.mjs';
import { renderPage } from '../src/templates/page.mjs';

const photos=loadJSON('src/data/country-photos.json').photos;
test('27 real local photographs cover exactly the 54 original country variants',async()=>{
 const pages=(await readContent()).filter(p=>p.kind==='country');
 const expected=pages.map(p=>p.route).sort(),actual=photos.flatMap(p=>[p.deRoute,p.enRoute]).sort();
 assert.equal(photos.length,27);assert.equal(expected.length,54);assert.deepEqual(actual,expected);assert.equal(new Set(actual).size,54);
 for(const p of photos){
  assert.equal(routeIndex.get(p.deRoute).translation,p.enRoute);
  const data=readFileSync(path.join(ROOT,'public',p.path));
  assert.equal(data.subarray(0,4).toString(),'RIFF');assert.equal(data.subarray(8,12).toString(),'WEBP');
  assert.equal(createHash('sha256').update(data).digest('hex'),p.sha256,p.country);
  assert.equal(p.width,1200);assert.equal(p.height,800);assert.match(p.path,/^assets\/countries\/[a-z-]+\.webp$/);
  assert.equal(new URL(p.sourceUrl).hostname,'commons.wikimedia.org');assert.equal(new URL(p.licenseUrl).hostname,'creativecommons.org');
  assert.ok(p.author&&p.adaptation&&p.license&&p.alt.de&&p.alt.en&&p.caption.de&&p.caption.en,p.country);
 }
});
test('every country hero renders its photograph, language alternative, attribution and original orientation map',async()=>{
 const pages=await readContent();
 for(const page of pages.filter(p=>p.kind==='country')){
  const p=photos.find(p=>p.deRoute===page.route||p.enRoute===page.route),html=renderPage(page,{mode:'preview'},pages);
  assert.ok(html.includes(`src="/${p.path}"`),page.route+' photo');
  assert.ok(html.includes(p.alt[page.lang].replaceAll('&','&amp;').replaceAll('"','&quot;')),page.route+' alt');
  assert.ok(html.includes(p.sourceUrl.replaceAll('&','&amp;')),page.route+' source');
  assert.ok(html.includes(p.licenseUrl),page.route+' license');assert.ok(html.includes(p.author),page.route+' creator');
  assert.ok(html.includes(`/assets/${page.country.map}`),page.route+' map');
  assert.ok(html.includes(page.lang==='de'?'Ausschnitt angepasst':'Cropped'),page.route+' modification notice');
 }
});
