import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../src/lib/site.mjs';
import {readContent} from '../scripts/build.mjs';
import {renderMain} from '../src/templates/page.mjs';

const pages=await readContent();
test('Local contents is a native compact disclosure above the article, never a separate sidebar',()=>{
 let checked=0;
 for(const page of pages){
  const html=renderMain(page,{mode:'preview'},pages);
  const toc=html.match(/<nav class="exb-page-toc"[^>]*>([\s\S]*?)<\/nav>/);
  if(!toc)continue;
  checked++;
  assert.match(toc[1],/^<details class="exb-toc-disclosure"><summary>/,page.route);
  assert.ok(toc[1].includes(page.lang==='de'?'Auf dieser Seite':'On this page'),page.route);
  assert.ok(html.indexOf(toc[0])<html.indexOf('class="exb-editorial-main"'),page.route);
  for(const [,id] of toc[1].matchAll(/href="#([^"]+)"/g))assert.ok(html.includes(`id="${id}"`),`${page.route} #${id}`);
 }
 assert.ok(checked>100);
});
test('Editorial wrapper no longer constrains whole table regions to prose measure',async()=>{
 const css=await readFile(path.join(ROOT,'public/css/exobasis-b-integration.css'),'utf8');
 assert.match(css,/\.exb-editorial-layout\s*\{[^}]*display:\s*block/);
 assert.match(css,/\.exb-editorial-main\s+\.exb-prose-content\s*\{[^}]*max-inline-size:\s*none/);
 assert.match(css,/\.exb-page-toc\s+summary\s*\{[^}]*min-height:\s*48px/);
});
