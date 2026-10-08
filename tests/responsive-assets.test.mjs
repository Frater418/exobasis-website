import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHTML } from '../src/lib/site.mjs';

const route='/de/wissen/ausweg-vorbereiten/';
const built=new Set([route]);

test('Responsive picture sources use real relative asset URLs in file preview',()=>{
 const html='<picture><source media="(max-width: 429.98px)" srcset="/logo/exobasis-b-wortmarke-hell.svg"/><img src="/logo/exobasis-b-horizontal-hell.svg"/></picture>';
 const result=resolveHTML(html,route,built);
 assert.ok(result.includes('srcset="../../../logo/exobasis-b-wortmarke-hell.svg"'));
 assert.ok(result.includes('src="../../../logo/exobasis-b-horizontal-hell.svg"'));
});

test('Static srcset descriptors and query encoding survive both output modes',()=>{
 const html='<img srcset="/assets/a.webp?v=1&amp;x=2 1x, /assets/b.webp 2x"/>';
 assert.equal(resolveHTML(html,route,built),'<img srcset="../../../assets/a.webp?v=1&amp;x=2 1x, ../../../assets/b.webp 2x"/>');
 assert.equal(resolveHTML(html,route,built,{mode:'production'}),html);
});

test('Unsafe or malformed responsive sources fail explicitly',()=>{
 for(const value of ['javascript:alert(1)','data:image/png;base64,abc','/assets/a.webp 0w','/assets/a.webp 2wrong'])assert.throws(()=>resolveHTML(`<img srcset="${value}"/>`,route,built));
});
