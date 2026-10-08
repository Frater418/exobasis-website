import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {readContent} from '../scripts/build.mjs';
import {renderMain} from '../src/templates/page.mjs';
import {ROOT,resolveHTML} from '../src/lib/site.mjs';

const pages=await readContent();
const catalogues=pages.filter(p=>p.kind==='catalogue');
const built=new Set(pages.map(p=>p.route));
const section=(html,id)=>html.match(new RegExp('<section\\b[^>]*\\bid="'+id+'"[^>]*>([\\s\\S]*?)</section>'))?.[1]||'';
const wrapper=html=>'<div class="exb-catalogue-context exb-prose-content">'+html+'</div>';

for(const original of catalogues){
 test('Catalogue group context precedes its unchanged cards: '+original.lang,()=>{
  const page=structuredClone(original),group=page.groups[1];
  const context='<p>Eine bestehende Aufgabe <a href="'+group.items[0].route+'">gezielt vorbereiten</a>.</p>';
  group.context=context;
  const before=JSON.stringify(page),html=renderMain(page),block=section(html,group.id);
  assert.ok(block.includes(wrapper(context)));
  assert.ok(block.indexOf('exb-group-intro')<block.indexOf('exb-catalogue-context'));
  assert.ok(block.indexOf('exb-catalogue-context')<block.indexOf('exb-service-cards'));
  assert.equal((html.match(/<article class="exb-service-card">/g)||[]).length,18);
  assert.equal(JSON.stringify(page),before);
 });
 test('Catalogue closing context is separate from the original body: '+original.lang,()=>{
  const page=structuredClone(original);
  const context='<p>Die passende <a href="'+page.groups[0].items[0].route+'">Klärung</a> wählen.</p>';
  page.closing.context=context;
  const block=section(renderMain(page),page.closing.id);
  assert.ok(block.includes(wrapper(context)));
  assert.ok(block.indexOf('exb-closing-lead')<block.indexOf('exb-catalogue-context'));
  assert.ok(block.indexOf('exb-catalogue-context')<block.indexOf('exb-closing-actions'));
 });
}

test('Absent and empty catalogue context fields leave the existing output identical',()=>{
 for(const original of catalogues){
  const withoutContext=structuredClone(original);
  for(const group of withoutContext.groups)delete group.context;
  delete withoutContext.closing.context;
  const baseline=renderMain(withoutContext);
  assert.ok(!baseline.includes('exb-catalogue-context'));
  for(const value of [undefined,null,'','   ']){
   const page=structuredClone(withoutContext);
   for(const group of page.groups)group.context=value;
   page.closing.context=value;
   assert.equal(renderMain(page),baseline);
  }
 }
});

test('Existing catalogue introductions and closing copy stay escaped plaintext',()=>{
 const page=structuredClone(catalogues[0]);
 page.groups[1].intro='<em>Text & Titel</em>';
 page.closing.body='<a href="/de/">Klar & direkt</a>';
 page.groups[1].context='<p>Ein eigener <a href="/de/arbeitsweise/">Kontext</a>.</p>';
 const html=renderMain(page);
 assert.ok(html.includes('<p class="exb-group-intro">&lt;em&gt;Text &amp; Titel&lt;/em&gt;</p>'));
 assert.ok(html.includes('<p class="exb-closing-lead">&lt;a href=&quot;/de/&quot;&gt;Klar &amp; direkt&lt;/a&gt;</p>'));
});

test('Existing closing sections ignore context on non-catalogue pages',()=>{
 for(const original of pages.filter(p=>p.kind!=='catalogue'&&p.closing)){
  const page=structuredClone(original);
  page.closing={...page.closing,context:'<p>Nur für Kataloge.</p>'};
  assert.equal(renderMain(page),renderMain(original),original.route);
 }
});

test('Invalid catalogue context values fail explicitly instead of disappearing',()=>{
 for(const value of [false,1,{},[]]){
  const group=structuredClone(catalogues[0]);
  group.groups[1].context=value;
  assert.throws(()=>renderMain(group),/Catalogue context must be HTML text/);
  const closing=structuredClone(catalogues[0]);
  closing.closing.context=value;
  assert.throws(()=>renderMain(closing),/Catalogue context must be HTML text/);
 }
});

test('New context links use the existing compiler and unsafe-link rejection',()=>{
 const page=structuredClone(catalogues[0]);
 const target=page.groups[1].items[0].route;
 page.groups[1].context='<p>Mehr zur <a href="'+target+'">konkreten Aufgabe</a>.</p>';
 const compiled=resolveHTML(renderMain(page),page.route,built);
 assert.ok(compiled.includes('data-route="'+target+'"'));
 assert.ok(compiled.includes('>konkreten Aufgabe</a>'));
 assert.ok(!compiled.includes('&lt;a href='));
 page.groups[1].context='<p><a href="javascript:alert(1)">Ungültig</a></p>';
 assert.throws(()=>resolveHTML(renderMain(page),page.route,built),/Unsafe link/);
});

test('Catalogue closing links retain the light token above the broad prose-link rule',()=>{
 const css=readFileSync(path.join(ROOT,'public/css/site.css'),'utf8');
 const broad='.exb-content-page a:not(.exb-btn):not(.exb-text-link):not(.exb-card-title)';
 const scoped='.exb-content-page .exb-page-closing.exb-dark .exb-catalogue-context a';
 assert.ok(css.includes(scoped+' { color:var(--exb-light-copper); }'));
 assert.ok(css.indexOf(scoped)>css.indexOf(broad));
});
