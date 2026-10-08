import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { readContent } from '../scripts/build.mjs';
import { renderPage } from '../src/templates/page.mjs';
import { ROOT } from '../src/lib/site.mjs';

const pages=await readContent();
const contextual=pages.filter(p=>['knowledge','article','country'].includes(p.kind));
const scripts=readFileSync(path.join(ROOT,'public/js/departure-context.js'),'utf8');
function contextMap(lang){
 const html=renderPage(pages.find(p=>p.lang===lang&&p.kind==='enquiry'));
 const raw=html.match(/id="exb-public-contexts">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(raw,'Public context map missing');
 return JSON.parse(raw);
}

test('Every knowledge, origin, emergency-record and country route has a same-language public context',()=>{
 for(const lang of ['de','en']){
  const map=contextMap(lang),expected=contextual.filter(p=>p.lang===lang);
  assert.deepEqual(new Set(Object.keys(map)),new Set(expected.map(p=>p.route)));
  for(const p of expected){assert.equal(typeof map[p.route],'string');assert.ok(map[p.route].length>0&&map[p.route].length<=300);}
 }
});
test('Every contextual main-content enquiry link retains its source route, including secondary inline links',()=>{
 for(const p of contextual){
  const html=renderPage(p).match(/<main\b[\s\S]*?<\/main>/)[0];
  const enquiry=p.lang==='de'?'/de/anfrage/':'/en/enquiry/';
  const links=[...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(m=>new URL(m[1].replaceAll('&amp;','&'),'https://test.invalid'));
  const matches=links.filter(u=>u.pathname===enquiry);
  assert.ok(matches.length,p.route+' has no enquiry link');
  for(const url of matches){assert.equal(url.searchParams.get('kontext'),p.route,p.route+' -> '+url);assert.ok(url.hash);}
 }
});

// These DOM doubles execute the shipped script. Real focus and navigation are checked separately in Chrome.
function formFixture({lang='de',query='/de/wissen/aufenthalt-dokumente/',message='',intent='',maxLength=1500}={}){
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.events={};this.textContent='';this.value='';}
  replaceChildren(){this.children=[];this.textContent='';}
  append(...children){this.children.push(...children);}
  addEventListener(name,fn){this.events[name]=fn;}
  dispatchEvent(){}
  setAttribute(name,value){this[name]=value;}
  insertAdjacentElement(_,element){this.notice=element;}
  focus(){this.focused=true;}
 }
 class Textarea extends Element{}
 class Select extends Element{}
 const input=new Textarea('textarea');input.value=message;input.maxLength=maxLength;
 const select=new Select('select');select.value=intent;
 const map=contextMap(lang),nodes={'exb-enquiry-form':{elements:{namedItem:n=>n==='short-message'?input:select}},'exb-public-contexts':{textContent:JSON.stringify(map)}};
 const window={events:{},addEventListener(name,fn){this.events[name]=fn;}};
 const document={documentElement:{lang},getElementById:id=>nodes[id],createElement:tag=>new Element(tag)};
 vm.runInNewContext(scripts,{document,window,location:{href:'http://127.0.0.1/?kontext='+encodeURIComponent(query)},URL,HTMLTextAreaElement:Textarea,HTMLSelectElement:Select,Event:class{}});
 return {input,select,window,suggestion:map[query]};
}
test('Unknown, overlong, prototype and other-language context values do not change fields',()=>{
 for(const query of ['/de/unknown/','__proto__','/en/knowledge/residence-and-documents/','x'.repeat(301)]){
  const {input,select}=formFixture({query});assert.equal(input.value,'');assert.equal(select.value,'');assert.equal(input.notice,undefined);
 }
});
test('Allowed public context is editable; existing input and selected intent remain untouched',()=>{
 for(const lang of ['de','en']){
  const query=lang==='de'?'/de/wissen/aufenthalt-dokumente/':'/en/knowledge/residence-and-documents/';
  const first=formFixture({lang,query});assert.equal(first.input.value,first.suggestion);assert.equal(first.select.value,lang==='de'?'Allgemeine Anfrage':'General enquiry');
  const existing=formFixture({lang,query,message:'My existing text',intent:'A chosen option'});
  assert.equal(existing.input.value,'My existing text');assert.equal(existing.select.value,'A chosen option');
  existing.input.notice.children.find(e=>e.tagName==='button').events.click();
  assert.equal(existing.input.value,'My existing text\n\n'+existing.suggestion);
 }
});
test('Context addition respects maxlength and never truncates a user message',()=>{
 const {input}=formFixture({message:'Existing text',maxLength:20});
 input.notice.children.find(e=>e.tagName==='button').events.click();
 assert.equal(input.value,'Existing text');
});
test('Returning from browser history does not restore a context the visitor deliberately removed',()=>{
 const {input,window}=formFixture();input.value='';
 input.events.input?.({isTrusted:true});
 window.events.pageshow?.({persisted:true});
 assert.equal(input.value,'');
});
