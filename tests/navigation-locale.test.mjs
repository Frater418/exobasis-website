import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = relative => readFileSync(new URL('../'+relative,import.meta.url),'utf8');
const redirects = (html,navigator,search='',hash='',folder='dist') => {
  const calls=[];
  const forbidden=()=>{throw Error('No persistence or tracking is permitted');};
  const window={location:{search,hash,replace:value=>calls.push(value)}};
  Object.defineProperties(window,{localStorage:{get:forbidden},sessionStorage:{get:forbidden}});
  const document={};Object.defineProperty(document,'cookie',{get:forbidden,set:forbidden});
  const context=vm.createContext({navigator,window,document,fetch:forbidden});
  for(const [,attrs,script] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
    document.currentScript={dataset:Object.fromEntries([...attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)].map(([,key,value])=>[key.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value]))};
    const src=attrs.match(/\bsrc="([^"]+)"/)?.[1];
    vm.runInContext(src?read(folder+'/'+src):script,context);
  }
  return calls;
};
const localeCases=[
  ['German region',{languages:['de-AT','en-US'],language:'de-AT'},'de'],
  ['English region first',{languages:['en-US','de-AT'],language:'de-AT'},'en'],
  ['Skip unsupported first',{languages:['fr-FR','de-CH','en'],language:'fr-FR'},'de'],
  ['Skip unsupported before English',{languages:['fr','en-GB','de'],language:'fr'},'en'],
  ['Mixed case',{languages:['DE-at'],language:'en'},'de'],
  ['Script and region',{languages:['de-Latn-AT'],language:'en'},'de'],
  ['language fallback',{language:'de-DE'},'de'],
  ['Empty languages uses language',{languages:[],language:'en-US'},'en'],
  ['Unsupported languages uses language',{languages:['fr'],language:'de-AT'},'de'],
  ['International default',{languages:['fr-FR','ja-JP'],language:'fr-FR'},'en'],
  ['No preferences',{languages:[]},'en'],
  ['Malformed values cannot become URLs',{languages:[null,42,'deevil','en/javascript:alert(1)'],language:''},'en'],
];
for(const [mode,folder,suffix] of [['preview','dist','index.html'],['production','dist-release','']]){
  const html=read(folder+'/index.html');
  for(const [label,navigator,lang] of localeCases)test(mode+': '+label,()=>{
    assert.deepEqual(redirects(html,navigator,'?anliegen=country%26x','#start',folder),[lang+'/'+suffix+'?anliegen=country%26x#start']);
  });
  test(mode+': locale execution is self-hosted and compatible with the real strict preview CSP',()=>{
    assert.match(html,/<script src="js\/root-locale\.js" defer data-locale-de="de\//);
    assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/);
    const server=read('scripts/serve.mjs');
    assert.match(server,/script-src 'self';/);
    assert.doesNotMatch(server,/script-src[^;]*unsafe-inline/);
  });
  test(mode+': root metadata and a single working international noscript fallback',()=>{
    for(const marker of ['<meta charset="utf-8">','name="viewport" content="width=device-width,initial-scale=1"','name="robots" content="noindex,nofollow"','<title>EXOBASIS | Sprache wählen</title>','href="css/v6.css"','href="css/site.css"'])assert.ok(html.includes(marker),marker);
    assert.doesNotMatch(html,/<meta[^>]+http-equiv="refresh"|rel="canonical"|rel="alternate"/i);
    const fallback=html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1];assert.ok(fallback,'JavaScript-free root must have a usable fallback');
    assert.match(fallback,/lang="en"/);assert.match(fallback,/href="en\//);assert.match(fallback,/Continue in English/);
    assert.equal((fallback.match(/<a\b/g)||[]).length,1,'No language-choice wall');
    assert.doesNotMatch(html.replace(/<noscript>[\s\S]*?<\/noscript>/g,''),/<a\b/);
  });
  test(mode+': direct language pages and manual header selection remain independent of browser locale',()=>{
    for(const lang of ['de','en']){
      const page=read(folder+'/'+lang+'/index.html'),other=lang==='de'?'en':'de';
      assert.doesNotMatch(page,/navigator\.languages|window\.location\.replace\(/);
      const header=page.match(/<header\b[\s\S]*?<\/header>/)?.[0];assert.ok(header);
      assert.match(header,new RegExp('<a[^>]+href="(?:\\.\\./|/)?'+other+'/'+suffix+'"[^>]+class="exb6-flag"'));
    }
  });
}

// Execute the shipped navigation source, not a duplicate selector/predicate.
function tooltipHarness({desktop=false,description=true,text='Visible approved subtext',rects=1,visibility='visible',connected=true}={}){
  const timers=new Map();let id=0,now=0;
  const events=()=>({handlers:{},addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);},fire(type,event={}){for(const fn of this.handlers[type]||[])fn(event);}});
  const tip={...events(),hidden:true,style:{},offsetWidth:200,offsetHeight:60};
  const desc={textContent:text,getClientRects:()=>Array(rects).fill({}),visibility};
  const link={...events(),isConnected:connected,dataset:{linkDescription:'Approved content <b>description</b>'},
    getClientRects:()=>[{}],getBoundingClientRect:()=>({left:20,top:50,bottom:70}),
    closest:selector=>selector==='.exb6-nav'&&desktop?{}:null,
    querySelector:selector=>description&&selector.includes('.exb6-menu-link-description')?desc:null};
  const document={...events(),activeElement:null,documentElement:{lang:'de'},body:{style:{},append(){}},
    getElementById:key=>key==='exb-tooltip'?tip:null,querySelector:()=>null,
    querySelectorAll:selector=>selector==='a[data-link-description]'?[link]:[]};
  const window={...events(),innerWidth:1440,innerHeight:900,
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
    getComputedStyle:element=>({visibility:element.visibility})};
  const context={document,window,matchMedia:()=>({matches:true,addEventListener(){}}),setTimeout:window.setTimeout,clearTimeout:window.clearTimeout};
  vm.runInNewContext(read('public/js/navigation.js'),context);
  const advance=ms=>{now+=ms;for(const [key,timer] of [...timers])if(timer.at<=now){timers.delete(key);timer.fn();}};
  return {tip,link,document,window,advance,desc};
}
test('Desktop menu hover does not repeat its visible subtext',()=>{
  const h=tooltipHarness({desktop:true});h.link.fire('pointerenter',{pointerType:'mouse'});h.advance(420);assert.equal(h.tip.hidden,true);
});
test('Desktop menu keyboard focus does not repeat its visible subtext',()=>{
  const h=tooltipHarness({desktop:true});h.document.fire('keydown',{key:'Tab'});h.link.fire('focus');h.advance(160);assert.equal(h.tip.hidden,true);
});
for(const [label,options] of [
  ['Content link',{desktop:false}],['Mobile menu link',{desktop:false}],['Desktop link without subtext',{desktop:true,description:false}],
  ['Hidden subtext',{desktop:true,rects:0}],['Invisible subtext',{desktop:true,visibility:'hidden'}],
  ['Collapsed subtext',{desktop:true,visibility:'collapse'}],['Empty subtext',{desktop:true,text:'  '}],
])test(label+': meaningful supplemental descriptions are retained',()=>{
  const h=tooltipHarness(options);h.link.fire('pointerenter',{pointerType:'mouse'});h.advance(420);assert.equal(h.tip.hidden,false);assert.equal(h.tip.textContent,h.link.dataset.linkDescription);
});
test('Visibility is checked at the actual delayed-show seam',()=>{
  const h=tooltipHarness({desktop:true,rects:0});h.link.fire('pointerenter',{pointerType:'mouse'});h.desc.getClientRects=()=>[{}];h.advance(420);assert.equal(h.tip.hidden,true);
});
test('Suppressed desktop descriptions also dismiss a previously visible supplemental tooltip',()=>{
  const h=tooltipHarness();h.link.fire('pointerenter',{pointerType:'mouse'});h.advance(420);assert.equal(h.tip.hidden,false);
  h.link.closest=selector=>selector==='.exb6-nav'?{}:null;
  h.link.fire('pointerenter',{pointerType:'mouse'});h.advance(420);assert.equal(h.tip.hidden,true);
});
test('Touch does not show supplemental hover/focus overlays',()=>{
  const h=tooltipHarness();h.document.fire('pointerdown',{pointerType:'touch'});h.link.fire('pointerenter',{pointerType:'touch'});h.link.fire('focus');h.advance(1000);assert.equal(h.tip.hidden,true);
});
test('Content keyboard descriptions, Escape, click and resize retain their behavior without intercepting navigation',()=>{
  const h=tooltipHarness();h.document.fire('keydown',{key:'Tab'});h.link.fire('focus');h.advance(160);assert.equal(h.tip.hidden,false);
  h.document.fire('keydown',{key:'Escape'});assert.equal(h.tip.hidden,true);
  h.link.fire('blur');h.link.fire('focus');h.advance(160);assert.equal(h.tip.hidden,false);
  h.link.fire('click',{preventDefault:()=>assert.fail('Navigation must not be intercepted')});assert.equal(h.tip.hidden,true);
  h.link.fire('focus');h.advance(160);h.window.fire('resize');assert.equal(h.tip.hidden,true);
});
test('Detached owners do not create tooltips',()=>{
  const h=tooltipHarness({connected:false});h.link.fire('pointerenter',{pointerType:'mouse'});h.advance(420);assert.equal(h.tip.hidden,true);
});
