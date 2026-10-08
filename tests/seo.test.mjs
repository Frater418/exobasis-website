import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, resolveHTML } from '../src/lib/site.mjs';
import { renderPage } from '../src/templates/page.mjs';
import { readContent, build } from '../scripts/build.mjs';
import { renderSeoHead, sitemapXML, assertProductionReady } from '../src/lib/seo.mjs';

const pages = [
  {route:'/de/',lang:'de',title:'Startseite',kind:'home',translation:'/en/'},
  {route:'/en/',lang:'en',title:'Home',kind:'home',translation:'/de/'},
  {route:'/de/wissen/',lang:'de',title:'Wissen',kind:'knowledge',parent:'/de/'},
  {route:'/de/bestaetigung/',lang:'de',title:'Bestätigung',kind:'confirmation',translation:'/en/confirmation/'},
  {route:'/en/confirmation/',lang:'en',title:'Confirmation',kind:'confirmation',translation:'/de/bestaetigung/'},
  {route:'/en/404/',lang:'en',title:'Page not found',kind:'error'}
];
const config={mode:'production',domain:'https://launch.example'};

test('Vorschau bleibt noindex und ohne Domain/Canonical',()=>{
  assert.equal(renderSeoHead(pages[0],{mode:'preview'},pages),'<meta name="robots" content="noindex,nofollow"/>');
  assert.throws(()=>renderSeoHead(pages[0],{mode:'invalid'},pages),/Ausgabemodus/);
});

test('Produktionshead bindet Canonical, reziproke Paare und belegte Breadcrumbs',()=>{
  const home=renderSeoHead(pages[0],config,pages);
  assert.match(home,/rel="canonical" href="https:\/\/launch\.example\/de\/"/);
  assert.match(home,/hreflang="de" href="https:\/\/launch\.example\/de\/"/);
  assert.match(home,/hreflang="en" href="https:\/\/launch\.example\/en\/"/);
  const single=renderSeoHead(pages[2],config,pages);
  assert.doesNotMatch(single,/hreflang/);
  assert.deepEqual(JSON.parse(single.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]).itemListElement.map(x=>x.item),['https://launch.example/de/','https://launch.example/de/wissen/']);
  for(const state of pages.slice(3)){
    const head=renderSeoHead(state,config,pages);
    assert.match(head,/noindex,nofollow/);
    assert.doesNotMatch(head,/canonical|hreflang/);
  }
  const xml=sitemapXML(pages,config);
  assert.equal((xml.match(/<url>/g)||[]).length,3);
  assert.doesNotMatch(xml,/bestaetigung|confirmation|404/);
  assert.match(xml,/<loc>https:\/\/launch\.example\/de\/wissen\/<\/loc>/);
});

test('Unreziproke Sprachrelation liefert keine erfundene Alternative',()=>{
  const broken=[{...pages[0],translation:'/en/'},{...pages[1],translation:null}];
  assert.doesNotMatch(renderSeoHead(broken[0],config,broken),/hreflang/);
  assert.doesNotMatch(sitemapXML(broken,config),/xhtml:link/);
});

test('Release-Gate verlangt echte Domain, Fakten, Freigaben und gelöste Rechtsanforderungen',()=>{
  const approved={...pages[0],reviewStatus:'approved'};
  // Synthetic values validate only the gate. They are never written to publication.json or deployed.
  const good={mode:'production',domain:'https://synthetic-gate-fixture.org',operatorFacts:{legalName:'Synthetische Testgesellschaft',legalForm:'Testrechtsform',representative:'Synthetische Testperson',postalAddress:'Synthetische Testanschrift',publicEmail:'test@synthetic-gate-fixture.org',privacyContact:'Synthetischer Testkontakt'},approvals:{publication:true,legal:true,content:true}};
  assert.doesNotThrow(()=>assertProductionReady(good,[{...approved,translation:null}]));
  assert.throws(()=>assertProductionReady({...good,domain:'https://launch.example'},[{...approved,translation:null}]),/Testdomain/);
  assert.throws(()=>assertProductionReady({...good,domain:null},[{...approved,translation:null}]),/Produktionsdomain fehlt/);
  assert.throws(()=>assertProductionReady({...good,operatorFacts:{...good.operatorFacts,publicEmail:null}},[{...approved,translation:null}]),/publicEmail/);
  assert.throws(()=>assertProductionReady({...good,approvals:{...good.approvals,publication:false}},[{...approved,translation:null}]),/Veröffentlichungsfreigabe/);
  assert.throws(()=>assertProductionReady(good,[{...approved,translation:null,kind:'legal',releaseBlockers:['Rechtsträger offen']}]),/Rechtsträger offen/);
  assert.throws(()=>assertProductionReady(good,[{...approved,translation:null,reviewStatus:'draft_for_review'}]),/nicht tatsächlich freigegeben/);
});

test('Echte offene Rechtsanforderungen blockieren weiterhin und lassen die Vorschau bytegleich',async()=>{
  const actual=await readContent();
  const legal=actual.filter(p=>p.kind==='legal');
  assert.equal(legal.length,6);
  // Isolated negative input: the current user-approved sources are never downgraded.
  const blocked=actual.map(p=>p.kind==='legal'?{...p,releaseBlockers:['Unresolved fact in negative fixture']}:p);
  const target=path.join(ROOT,'dist','index.html');
  const before=await readFile(target);
  const previous=await stat(target);
  await assert.rejects(build({mode:'production'},async()=>blocked),/Unresolved fact in negative fixture/);
  assert.deepEqual(await readFile(target),before);
  assert.equal((await stat(target)).mtimeMs,previous.mtimeMs);
});

test('Der echte Seitenrenderer bindet SEO auf allen Varianten ohne lokale Vorschauwerte zu ändern',async()=>{
  const actual=await readContent();
  const built=new Set(actual.map(p=>p.route));
  for(const page of actual){
    const html=resolveHTML(renderPage(page,config,actual),page.route,built,{mode:'production'});
    const excluded=['error','confirmation'].includes(page.kind);
    assert.match(html,new RegExp('name="robots" content="'+(excluded?'noindex,nofollow':'index,follow')+'"'),page.route);
    const canonical=[...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(m=>m[1]);
    assert.deepEqual(canonical,excluded?[]:['https://launch.example'+page.route],page.route);
    assert.doesNotMatch(html,/\bhref="\/(?!\/)[^"]*index\.html(?:[?#]|\")/,page.route);
    assert.match(html,/href="\/css\/v6.css"/,page.route);
    if(page.kind==='legal')assert.doesNotMatch(html,/class="exb-legal-warning"|class="exb-review-requirements"/);
    for(const match of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)){
      const data=JSON.parse(match[1]);assert.equal(data['@context'],'https://schema.org');
      assert.equal(data['@type'],'BreadcrumbList');
    }
  }
});

test('Produktionslinks behalten Anliegen, Kontext und Fragment ohne doppelte HTML-Kodierung',()=>{
  const target='/de/anfrage/?anliegen=Allgemeine+Anfrage&kontext=%2Fde%2Fwissen%2F#kurzanfrage';
  const raw='<a href="'+target.replaceAll('&','&amp;')+'">Anfrage</a>';
  const built=new Set(['/de/anfrage/']);
  const html=resolveHTML(raw,'/de/wissen/',built,{mode:'production'});
  assert.doesNotMatch(html,/&amp;amp;/);
  const href=html.match(/\bhref="([^"]+)"/)[1].replaceAll('&amp;','&');
  assert.equal(href,target);
  const url=new URL(href,config.domain);
  assert.equal(url.searchParams.get('anliegen'),'Allgemeine Anfrage');
  assert.equal(url.searchParams.get('kontext'),'/de/wissen/');
  assert.equal(url.hash,'#kurzanfrage');
});
