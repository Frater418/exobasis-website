import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir,stat } from 'node:fs/promises';
import path from 'node:path';
import { ROOT,registry,routeIndex,assertRoute,resolveHTML,toFileHref,loadJSON } from '../src/lib/site.mjs';
import { readContent } from '../scripts/build.mjs';
import { createPreviewServer } from '../scripts/serve.mjs';
import { approvedFontIssue, brandAssets } from '../src/lib/brand.mjs';
const pages=await readContent();const built=new Set(pages.map(p=>p.route));
test('150 exact source identities, 76 DE and 74 EN',()=>{assert.equal(registry.length,150);assert.equal(new Set(registry.map(r=>r.route)).size,150);assert.equal(registry.filter(r=>r.lang==='de').length,76);});
test('72 explicit language pairs and six unpaired variants',()=>{assert.equal(registry.filter(r=>r.translation).length,144);for(const r of registry)if(r.translation)assert.equal(routeIndex.get(r.translation).translation,r.route);});
test('All source parents exist and stay in the same language',()=>{for(const r of registry)if(r.parent){assert.ok(routeIndex.has(r.parent));assert.equal(routeIndex.get(r.parent).lang,r.lang);}});
test('All 1534 source relations keep known source/target identities',()=>{const links=loadJSON('src/data/link-plan.json');assert.equal(links.length,1534);for(const l of links){assert.ok(routeIndex.has(l.quellpfad_vorschlag));assert.ok(routeIndex.has(l.zielpfad_vorschlag));}});
test('The integrated package contains all 150 authored route variants',()=>{assert.equal(pages.length,150);assert.equal(pages.filter(p=>p.kind==='error').length,2);});
test('Every page keeps its individual source binding and an explicit review state',()=>{const units=loadJSON('editorial/source-index.json');for(const p of pages){assert.ok(p.sourceRefs.length>=2,p.route);for(const ref of p.sourceRefs)assert.ok(units.some(x=>x.module===ref.module&&x.anchor===ref.anchor),p.route+' '+JSON.stringify(ref));assert.ok(p.reviewStatus?.trim(),p.route);}});
test('Route validation rejects traversal and invented path shapes',()=>{for(const r of ['/de/a/','/en/'])assert.doesNotThrow(()=>assertRoute(r));for(const r of ['/de/../x/','/fr/','https://x','/de/a'])assert.throws(()=>assertRoute(r));});
test('Relative paths work for deep file browsing and preserve public intent',()=>{assert.equal(toFileHref('/de/anfrage/?anliegen=x#kurzanfrage','/de/leistungen/erstklaerung/'),'../../anfrage/index.html?anliegen=x#kurzanfrage');});
test('Targets stay disabled when a caller deliberately supplies an incomplete build set',()=>{const h=resolveHTML('<a href="/de/laender/">Länder</a>','/de/',new Set(['/de/']));assert.match(h,/aria-disabled="true"/);assert.doesNotMatch(h,/<a\b/);});
test('A built target stays a real HTML anchor',()=>{const h=resolveHTML('<a href="/de/anfrage/">Kontakt</a>','/de/',built);assert.match(h,/href="anfrage\/index.html"/);});
test('Unknown internal targets fail the build instead of guessing',()=>{assert.throws(()=>resolveHTML('<a href="/de/erfunden/">x</a>','/de/',built));});
test('Executable URI schemes are rejected',()=>{assert.throws(()=>resolveHTML('<a href="javascript:alert(1)">x</a>','/de/',built));});
test('Each catalogue has exactly 18 distinct commercial tasks',()=>{for(const p of pages.filter(p=>p.kind==='catalogue')){const rs=p.groups.flatMap(g=>g.items.map(x=>x.route));assert.equal(rs.length,18);assert.equal(new Set(rs).size,18);assert.ok(rs.some(r=>r.includes('notfallunterlagen')||r.includes('emergency-documents')));}});
test('Assessment has 6, plan 8 and country selection 6 core sections',()=>{for(const p of pages.filter(p=>p.kind==='service'&&!p.editorial?.package))assert.equal(p.sections.length,p.route.includes('flucht-notfallplan')||p.route.includes('departure-contingency')?8:6);});
test('Three general and eighteen commercial enquiry choices stay intact in both languages',()=>{const c=loadJSON('src/data/contact.json');for(const lang of ['de','en']){assert.equal(c.languages[lang].options.length,21);assert.equal(new Set(c.languages[lang].options).size,21);}});
test('No accidental automatic translation of six unpaired country-of-origin cases',()=>{const r=routeIndex.get('/en/knowledge/prepare-your-way-out/leaving-uae/');assert.equal(r.translation,null);});
test('Portrait is a nonempty file asset rather than a generated text placeholder',async()=>{const f=path.join(ROOT,'public/assets/raphael-rechberger-original.png');assert.ok((await stat(f)).size>10000);});
test('Outputs contain only the approved self-hosted fonts and no private editorial files',async()=>{async function walk(d){let out=[];for(const e of await readdir(d,{withFileTypes:true})){const p=path.join(d,e.name);out.push(...e.isDirectory()?await walk(p):[p]);}return out;}const output=path.join(ROOT,'dist'),files=await walk(output);assert.ok(files.every(f=>!(/\.(md|csv)$/i.test(f))));const fonts=files.filter(f=>/\.(woff2?|ttf|otf|eot)$/i.test(f));assert.equal(fonts.length,brandAssets.fonts.length);for(const f of fonts)assert.equal(approvedFontIssue(path.relative(output,f).split(path.sep).join('/'),await readFile(f)),null);});
test('Preview confirmation never treats a query flag as delivery proof',async()=>{for(const lang of ['de','en']){const p=pages.find(p=>p.lang===lang&&p.kind==='confirmation');const h=await readFile(path.join(ROOT,'dist',p.route,'index.html'),'utf8');assert.doesNotMatch(h,/localStorage|sessionStorage|searchParams\.get\(['"]success/);assert.match(h,/name="robots" content="noindex,nofollow"/);}});
test('Loopback HTTP server: 150 routes, genuine 404s, no private files or sender',async()=>{
 const server=await createPreviewServer(0);const port=server.address().port;const base='http://127.0.0.1:'+port;
 try{
  assert.equal(server.address().address,'127.0.0.1');
  for(const p of pages){const r=await fetch(base+p.route);assert.equal(r.status,p.kind==='error'?404:200,p.route);assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.ok((await r.text()).includes('<html lang="'+p.lang+'"'));}
  for(const [r,lang] of [['/de/not-built/example/','de'],['/en/not-built/example/','en'],['/editorial/sources/01_Unternehmen_und_Businessplan.md','de']]){const x=await fetch(base+r);assert.equal(x.status,404);const h=await x.text();assert.ok(h.includes('<html lang="'+lang+'"'));assert.ok(h.includes('<base href="/'+lang+'/404/">'));assert.ok(!h.includes('Businessplan 8.0'));}
  const post=await fetch(base+'/de/anfrage/',{method:'POST',body:'synthetic-test=not-a-customer'});assert.equal(post.status,503);assert.match(await post.text(),/Nothing was accepted or stored/);
  const fake=await fetch(base+'/de/anfrage/bestaetigung/?success=true');assert.equal(fake.status,200);assert.doesNotMatch(await fake.text(),/data-success="true"/);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
