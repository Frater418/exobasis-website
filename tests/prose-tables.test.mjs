import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readContent} from '../scripts/build.mjs';
import {renderMain} from '../src/templates/page.mjs';

const pages=await readContent();
const base=pages.find(p=>p.route==='/de/wissen/aufenthalt-dokumente/notfallunterlagen/');
const table='<table><caption>Identität &amp; Rechte</caption><thead><tr><th scope="col">Unterlagen</th><th scope="col">Zweck</th></tr></thead><tbody><tr><th scope="row">Pass</th><td>Identität nachweisen</td></tr></tbody></table>';
const label='Unterlagen & "Befugnisse"';
const wrapper='<div class="exb-criteria-table" role="region" tabindex="0" aria-label="Unterlagen &amp; &quot;Befugnisse&quot;">';
function section(body,after){
 const page=structuredClone(base);
 page.sections=[{id:'qa-table-scope',title:label,body,...(after?{after}:{})}];
 const html=renderMain(page);
 return html.match(/<section class="exb-editorial-section" id="qa-table-scope">([\s\S]*?)<\/section>/)[1];
}

test('An authored table uses the existing labelled keyboard-scrollable component',()=>{
 const html=section('<p>Vor der Tabelle.</p>'+table+'<p>Nach der Tabelle.</p>');
 assert.ok(html.includes(wrapper+table+'</div>'));
 assert.ok(html.includes('<p>Vor der Tabelle.</p>'));
 assert.ok(html.includes('<p>Nach der Tabelle.</p>'));
 assert.equal((html.match(/<table\b/g)||[]).length,1);
});

test('Existing criteria and country table wrappers remain byte-identical',()=>{
 for(const css of ['exb-criteria-table','preview exb-country-table frame']){
  const existing='<div class="'+css+'" role="region" tabindex="0" aria-label="Bestehender Vergleich">'+table+'</div>';
  const html=section(existing);
  assert.ok(html.includes('<div class="exb-prose-content">'+existing+'</div>'));
  assert.equal((html.match(/role="region"/g)||[]).length,1);
 }
});

test('Mixed wrapped and bare tables each retain one scroll region',()=>{
 const existing='<div class="exb-criteria-table" role="region" tabindex="0" aria-label="Bestehender Vergleich">'+table+'</div>';
 const html=section(existing+'<p>Weitere Unterlagen.</p>'+table);
 assert.ok(html.includes(existing));
 assert.ok(html.includes(wrapper+table+'</div>'));
 assert.equal((html.match(/role="region"/g)||[]).length,2);
 assert.equal((html.match(/<table\b/g)||[]).length,2);
});

test('A similarly named CSS class does not masquerade as a scroll container',()=>{
 const html=section('<div class="not-exb-criteria-table">'+table+'</div>');
 assert.ok(html.includes('<div class="not-exb-criteria-table">'+wrapper+table+'</div></div>'));
});

test('Section after-content receives the same table behavior without changing ordinary prose',()=>{
 const prose='<p>Unveränderte <strong>Unterlagen</strong> &amp; Zuständigkeit.</p>';
 const html=section(prose,table);
 assert.ok(html.includes('<div class="exb-prose-content">'+prose+'</div>'));
 assert.ok(html.includes(wrapper+table+'</div>'));
});

test('The actual emergency-records table keeps its caption, cells and source model',()=>{
 const before=JSON.stringify(base);
 const body=base.sections[0].body;
 const authored=body.match(/<table\b[\s\S]*?<\/table>/)[0];
 const html=renderMain(base);
 const expected='<div class="exb-criteria-table" role="region" tabindex="0" aria-label="'+base.sections[0].title+'">'+authored+'</div>';
 assert.ok(html.includes(expected));
 assert.equal(JSON.stringify(base),before);
});

test('Criteria table headers and cells wrap long words instead of overlapping adjacent cells',async()=>{
 const css=await readFile(new URL('../public/css/site.css',import.meta.url),'utf8');
 const rule=css.match(/\.exb-criteria-table th\s*,\s*\.exb-criteria-table td\s*\{([^}]+)\}/);
 assert.ok(rule,'Both header and data cells share the same wrapping rule');
 assert.match(rule[1],/overflow-wrap\s*:\s*anywhere\s*;/);
 assert.doesNotMatch(rule[1],/white-space\s*:\s*nowrap|text-overflow\s*:\s*ellipsis/);
});
