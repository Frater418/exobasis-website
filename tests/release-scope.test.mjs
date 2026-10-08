import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,cpSync,rmSync,mkdtempSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {CORE_ROUTES,sha256,selectReleaseScope,scopedNavigation,scopedContexts,scopeReferences,assertScopedDocuments,publicAssetClosure,licensedAssetClosure,assertPublicOutput} from '../src/lib/release-scope.mjs';

const root=process.env.EXOBASIS_TEST_SNAPSHOT||fileURLToPath(new URL('../',import.meta.url));
const scratch=mkdtempSync(path.join(process.env.EXOBASIS_TEST_SCRATCH||process.env.TMPDIR||os.tmpdir(),'release-scope-'));
// Default npm test needs no new environment contract; this session supplies its own permitted scratch.
test.after(()=>rmSync(scratch,{recursive:true,force:true}));
mkdirSync(scratch,{recursive:true});
const {readContent,build}=await import(pathToFileURL(path.join(root,'scripts/build.mjs')));
const {registry,resolveHTML}=await import(pathToFileURL(path.join(root,'src/lib/site.mjs')));
const {renderPage}=await import(pathToFileURL(path.join(root,'src/templates/page.mjs')));
const {assertProductionReady,renderSeoHead,sitemapXML}=await import(pathToFileURL(path.join(root,'src/lib/seo.mjs')));
const {htmlText,renderedPageIssues}=await import(pathToFileURL(path.join(root,'scripts/render-contract.mjs')));
const pages=await readContent(),originalJSON=JSON.stringify(pages);
const publication=JSON.parse(readFileSync(path.join(root,'src/data/publication.json'),'utf8'));
const manifest=JSON.parse(readFileSync(path.join(root,'tests/fixtures/historical138.json'),'utf8'));
const config={...publication,mode:'production',releaseScope:{version:1,id:manifest.id,source:manifest.source}};
const fixtureRoot=path.join(scratch,'config-unit-fixture');mkdirSync(path.join(fixtureRoot,'src/data'),{recursive:true});
const selectFixture=data=>{writeFileSync(path.join(fixtureRoot,manifest.source),JSON.stringify(data));return selectReleaseScope(config,pages,registry,{root:fixtureRoot});};

const selected=selectFixture(manifest);

test('Full preview stays 150 pages, 1534 source links; malformed production binding cannot reduce it',()=>{
 const preview=selectReleaseScope({mode:'preview',releaseScope:{id:'bad'}},pages,registry,{root});assert.equal(preview.pages.length,150);assert.equal(preview.manifest,null);
 assert.equal(JSON.parse(readFileSync(path.join(root,'src/data/link-plan.json'),'utf8')).length,1534);
 assert.equal(JSON.parse(readFileSync(path.join(root,'editorial/package-scope.json'),'utf8')).length,150);
});
test('Historical TESTFIXTURE (not current release recommendation): 138 = 70 DE + 68 EN, 42 country variants; not an approval',()=>{
 assert.equal(selected.pages.length,138);assert.equal(selected.pages.filter(p=>p.lang==='de').length,70);assert.equal(selected.pages.filter(p=>p.lang==='en').length,68);assert.equal(selected.pages.filter(p=>p.kind==='country').length,42);
 assert.equal(JSON.stringify(pages),originalJSON);
 if(selected.pages.some(p=>p.reviewStatus!=='approved'))assert.throws(()=>assertProductionReady({...config,domain:'https://exobasis.com'},selected.pages),/nicht tatsächlich freigegeben/);
 if(!config.domain)assert.throws(()=>assertProductionReady(config,selected.pages),/Produktionsdomain fehlt/);
});
test('Unbound, ambiguous or mismatched production config fails',()=>{
 for(const cfg of [{mode:'bad'},{mode:'production'},{...config,releaseScope:{...config.releaseScope,all:true}},{...config,releaseScope:{...config.releaseScope,version:2}},{...config,releaseScope:{...config.releaseScope,source:'../private.json'}}])assert.throws(()=>selectReleaseScope(cfg,pages,registry,{root}),/RELEASE_/);
 for(const data of [{...manifest,id:'erstrelease-wrong'},{...manifest,source:'wrong'},{...manifest,version:2},{...manifest,other:1}])assert.throws(()=>selectFixture(data),/RELEASE_BINDING/);
});
test('Empty, unknown, duplicate, malformed and necessary-core omissions fail',()=>{
 for(const data of [{...manifest,routes:[]},{...manifest,routes:[...manifest.routes,'/de/not-real/']},{...manifest,routes:[...manifest.routes,manifest.routes[0]]},{...manifest,routes:[...manifest.routes,'/de/anfrage']},{...manifest,routes:manifest.routes.filter(r=>r!=='/en/privacy/')}])assert.throws(()=>selectFixture(data),/RELEASE_/);
});
test('Language pair and authoritative registry parent are admission dependencies',()=>{
 assert.throws(()=>selectFixture({...manifest,routes:manifest.routes.filter(r=>r!=='/en/countries/ireland/')}),/RELEASE_LANGUAGE_PAIR/);
 assert.throws(()=>selectFixture({...manifest,routes:manifest.routes.filter(r=>!['/de/wissen/aufenthalt-dokumente/','/en/knowledge/residence-and-documents/'].includes(r))}),/RELEASE_PARENT/);
});
test('Source identities and optional policy cannot drift silently',()=>{
 assert.throws(()=>selectReleaseScope(config,[...pages,pages[0]],registry,{root:fixtureRoot}),/DUPLICATE_SOURCE/);
 assert.throws(()=>selectReleaseScope(config,pages.slice(1),registry,{root:fixtureRoot}),/SOURCE_COVERAGE/);
 assert.throws(()=>selectReleaseScope(config,pages.map(p=>p.route==='/de/laender/vae/'?{...p,translation:'/en/'}:p),registry,{root:fixtureRoot}),/SOURCE_IDENTITY/);
 assert.throws(()=>selectReleaseScope(config,pages.map(p=>p.route==='/de/laender/vae/'?{...p,parent:'/de/anfrage/'}:p),registry,{root:fixtureRoot}),/PARENT_CONFLICT/);
 assert.throws(()=>selectFixture({...manifest,optionalReferences:[...manifest.optionalReferences,manifest.optionalReferences[0]]}),/REFERENCE_DUPLICATE/);
 assert.throws(()=>selectFixture({...manifest,optionalReferences:[{...manifest.optionalReferences[0],bodySHA256:'bad'}]}),/REFERENCE_CONFIG/);
});
test('Structural navigation/context projections preserve preview object and labels, prune empty groups',()=>{
 const nav=[{route:'/de/',groups:[{label:'preserved',links:[{route:'/de/anfrage/',label:'original'},{route:'/de/laender/malaysia/',label:'other'}]}]},{route:'/de/laender/malaysia/',groups:[]}];
 assert.equal(scopedNavigation(nav),nav);const projected=scopedNavigation(nav,selected.routes);assert.equal(projected.length,1);assert.equal(projected[0].groups[0].links.length,1);assert.equal(nav[0].groups[0].links.length,2);
 assert.equal(projected[0].groups[0].links[0].label,'original');assert.deepEqual(scopedContexts({'/de/':'same','/de/laender/malaysia/':'excluded'},selected.routes),{'/de/':'same'});
});
test('Bounded real neutral references preserve every word and ID, never look disabled/clickable',()=>{
 const p=pages.find(p=>p.route==='/de/laender/vae/');const before=renderPage(p,{mode:'production',domain:'https://exobasis.com',releaseView:selected},selected.pages);
 const after=scopeReferences(before,p.route,selected);assert.equal(htmlText(before),htmlText(after));assert.deepEqual([...after.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),[...before.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 assert.doesNotMatch(after,/<a\b[^>]*href="\/de\/laender\/(?:panama|malaysia)\//);assert.match(after,/<span>Panama<\/span>/);assert.doesNotMatch(after,/exb-pending/);
});
test('Concrete missing reader action is an admission prerequisite, not disabled text',()=>{
 assert.throws(()=>scopeReferences('<a href="/de/laender/malaysia/">Read the profile</a>','/de/',selected),/RELEASE_REQUIRED_TARGET/);
 const body='Read the profile',rule={source:'/de/',href:'/de/laender/malaysia/',bodySHA256:sha256(body),occurrences:1,reason:'synthetic invalid action'};
 const actionScope={...selected,manifest:{...manifest,optionalReferences:[rule]}};
 assert.throws(()=>scopeReferences(`<a class="exb-btn" href="${rule.href}">${body}</a>`,'/de/',actionScope),/ACTION_REQUIRES_TARGET/);
 assert.throws(()=>scopeReferences('<a href="/de/">Home</a>','/de/laender/vae/',selected),/REFERENCE_DRIFT/);
 assert.throws(()=>resolveHTML('<a href="/de/laender/malaysia/">x</a>','/de/',selected.routes,{mode:'production'}),/RELEASE_REQUIRED_TARGET/);
});
// Actual source render probe, not build: existing approval/contact gates are deliberately not passed.
const probeConfig={mode:'production',domain:'https://exobasis.com',releaseView:selected};
const documents=new Map();let neutralized=0;
for(const p of selected.pages){
 const before=renderPage(p,probeConfig,selected.pages),scoped=scopeReferences(before,p.route,selected),html=resolveHTML(scoped,p.route,selected.routes,{mode:'production'});
 assert.equal(htmlText(before),htmlText(scoped),p.route+' copy');assert.deepEqual([...before.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),[...scoped.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),p.route+' IDs');
 neutralized+=(before.match(/<a\b/g)||[]).length-(scoped.match(/<a\b/g)||[]).length;
 documents.set(p.route.slice(1)+'index.html',html);
}
documents.set('index.html','<!doctype html><html lang="de"><head><link rel="stylesheet" href="/css/v6.css"/><link rel="stylesheet" href="/css/site.css"/></head><body><a href="/de/">Deutsch</a><a href="/en/">English</a></body></html>');
test('Real 138-route renderer: every anchor, same-page fragment, SVG use, context, label and ID resolves',()=>{
 assert.equal(neutralized,26);assertScopedDocuments(documents,selected,{origin:probeConfig.domain});
 for(const p of selected.pages)assert.deepEqual(renderedPageIssues(documents.get(p.route.slice(1)+'index.html'),p),[]);
});
test('Retained enquiry query/fragment and public context only refer to emitted routes',()=>{
 const h=documents.get('de/laender/vae/index.html');assert.match(h,/kontext=%2Fde%2Flaender%2Fvae%2F#kurzanfrage/);
 const enquiry=documents.get('de/anfrage/index.html');const ctx=JSON.parse(enquiry.match(/id="exb-public-contexts">([\s\S]*?)<\/script>/)[1]);assert.ok(ctx['/de/laender/vae/']);assert.equal(ctx['/de/laender/malaysia/'],undefined);
 assert.ok(Object.keys(ctx).every(r=>selected.routes.has(r)));
});
test('Actual canonical/hreflang/sitemap bind the subset, exclude only states from indexing',()=>{
 const xml=sitemapXML(selected.pages,probeConfig);assert.equal((xml.match(/<url>/g)||[]).length,134);assert.doesNotMatch(xml,/countries\/malaysia|laender\/malaysia|404|bestaetigung|confirmation/);
 for(const p of selected.pages){const head=renderSeoHead(p,probeConfig,selected.pages);for(const m of head.matchAll(/href="https:\/\/exobasis.com([^\"]+)"/g))assert.ok(selected.routes.has(m[1]));if(p.kind==='country')assert.match(head,/hreflang="de"[\s\S]*hreflang="en"|hreflang="en"[\s\S]*hreflang="de"/);}
 const unpaired=selected.pages.find(p=>p.route==='/en/knowledge/prepare-your-way-out/leaving-uae/');assert.doesNotMatch(renderSeoHead(unpaired,probeConfig,selected.pages),/hreflang/);
 assert.match(documents.get('en/knowledge/prepare-your-way-out/leaving-uae/index.html'),/href="\/de\/"[^>]*class="exb6-flag"/);
});
test('Fragment, excluded route, context leakage and extra HTML fail on the real document set',()=>{
 for(const payload of ['<a href="/de/#missing-test-id">x</a>','<a href="/de/laender/malaysia/">x</a>','<a href="/de/anfrage/?kontext=%2Fde%2Flaender%2Fmalaysia%2F">x</a>']){const changed=new Map(documents);changed.set('index.html',documents.get('index.html')+payload);assert.throws(()=>assertScopedDocuments(changed,selected,{origin:probeConfig.domain}),/RELEASE_/);}
 assert.throws(()=>assertScopedDocuments(new Map([...documents,['de/laender/malaysia/index.html','private']]),selected,{origin:probeConfig.domain}),/COVERAGE/);
});
const actualAssets=publicAssetClosure(documents,path.join(root,'public'));
test('Real static asset closure excludes all six deferred country photos/maps and unused source assets',()=>{
 const files=new Set(actualAssets.map(a=>a.path));for(const slug of ['malaysia','mexiko','panama','schweiz','thailand','zypern']){assert.equal(files.has('assets/countries/'+slug+'.webp'),false);assert.equal(files.has('assets/countries/'+slug+'-locator.svg'),false);}
 assert.ok(files.has('assets/countries/vae.webp'));assert.ok(files.has('js/enquiry.js'));
 const actualContact=JSON.parse(readFileSync(path.join(root,'src/data/contact.json'),'utf8'));
 assert.equal(files.has('js/confirmation.js'),actualContact.enabled===true);
 // Separate bounded contact fixture: no write, no real transport, no confirmation of a channel.
 const fixtureContact={enabled:true,email:'test@synthetic-gate-fixture.org',formEndpoint:'/api/enquiry',calendar:null,cryptpad:null,simplex:null,booking:null};
 const confirmation=selected.pages.find(p=>p.route==='/de/anfrage/bestaetigung/');
 const activeDocs=new Map([['de/anfrage/bestaetigung/index.html',renderPage(confirmation,{...probeConfig,contact:fixtureContact},selected.pages)]]);
 assert.ok(publicAssetClosure(activeDocs,path.join(root,'public')).some(a=>a.path==='js/confirmation.js'));
 assert.equal(files.has('logo/exobasis-thumbnail.svg'),false);
 assert.throws(()=>licensedAssetClosure(documents,path.join(root,'public'),{version:1,assets:{}}),/RELEASE_ASSET_RIGHTS/);
});
const assetRoot=path.join(scratch,'asset-unit-fixture');mkdirSync(assetRoot,{recursive:true});
function put(name,bytes){const f=path.join(assetRoot,name);mkdirSync(path.dirname(f),{recursive:true});writeFileSync(f,bytes);}
put('css/root.css','@import "nested.css"; .hero{background:url(../assets/test.svg#shape)}');
put('css/nested.css','@font-face{font-family:Manrope;src:url("../assets/fonts/manrope-latin.woff2")}');
put('assets/test.svg','<svg xmlns="http://www.w3.org/2000/svg"><g id="shape"/><image href="test.png"/><style>.x{fill:url(#shape)}</style></svg>');
put('assets/test.png',Buffer.from('unit fixture, not an image'));for(const item of [...JSON.parse(readFileSync(path.join(root,'src/data/brand-assets.json'),'utf8')).fonts,...JSON.parse(readFileSync(path.join(root,'src/data/brand-assets.json'),'utf8')).licenses])put(item.path,readFileSync(path.join(root,'public',item.path)));put('assets/private.png','must not copy');put('licenses/test-OFL.txt','Synthetic licence fixture, not a real font licence');
const assetDocs=new Map([['index.html','<link rel="stylesheet" href="/css/root.css"/>']]);
const fixtureAssets=publicAssetClosure(assetDocs,assetRoot);
const assetPolicy={version:1,assets:Object.fromEntries([...fixtureAssets,...JSON.parse(readFileSync(path.join(root,'src/data/brand-assets.json'),'utf8')).licenses].map(a=>[a.path,{sha256:a.sha256,rightsEvidence:'synthetic unit fixture only',licenseFiles:a.path.endsWith('.woff2')?['assets/fonts/LICENSE-Manrope.txt','assets/fonts/SCHRIFTLIZENZEN.txt']:[]}]))};
test('Bounded asset fixture traverses CSS import/url, SVG fragment/image and font licence, excludes private media',()=>{
 assert.deepEqual(fixtureAssets.map(a=>a.path).sort(),['assets/fonts/manrope-latin.woff2','assets/test.png','assets/test.svg','css/nested.css','css/root.css']);
 assert.equal(licensedAssetClosure(assetDocs,assetRoot,assetPolicy).length,7);
 const missing=structuredClone(assetPolicy);missing.assets['assets/fonts/manrope-latin.woff2'].licenseFiles=[];assert.throws(()=>licensedAssetClosure(assetDocs,assetRoot,missing),/FONT_LICENSE/);
 const tampered=structuredClone(assetPolicy);tampered.assets['assets/test.png'].sha256='0'.repeat(64);assert.throws(()=>licensedAssetClosure(assetDocs,assetRoot,tampered),/ASSET_RIGHTS/);
});
test('External CSS/font/media, traversal, unknown SVG fragment and private source URLs fail',()=>{
 for(const url of ['https://remote.invalid/x.png','/../src/content/private.json','/assets/no.svg','data:image/png;base64,AAAA'])assert.throws(()=>publicAssetClosure(new Map([['index.html',`<img src="${url}"/>`]]),assetRoot),/RELEASE_|ENOENT/);
 assert.throws(()=>publicAssetClosure(new Map([['index.html','<svg><use href="/assets/test.svg#not-real"/></svg>']]),assetRoot),/ASSET_FRAGMENT/);
});
test('Exact public file set rejects excluded HTML, private reports and changed assets',()=>{
 const output=path.join(scratch,'output-unit-fixture');rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true});
 for(const [name,html] of assetDocs)writeFileSync(path.join(output,name),html);
 for(const name of ['robots.txt','sitemap.xml'])writeFileSync(path.join(output,name),'synthetic unit fixture only');
 for(const asset of licensedAssetClosure(assetDocs,assetRoot,assetPolicy)){const target=path.join(output,asset.path);mkdirSync(path.dirname(target),{recursive:true});cpSync(path.join(assetRoot,asset.path),target);}
 assert.equal(assertPublicOutput(output,assetDocs,assetRoot,assetPolicy).files,10);
 writeFileSync(path.join(output,'REPORT.md'),'private');assert.throws(()=>assertPublicOutput(output,assetDocs,assetRoot,assetPolicy),/OUTPUT_COVERAGE/);rmSync(path.join(output,'REPORT.md'));
 mkdirSync(path.join(output,'de/laender/malaysia'),{recursive:true});writeFileSync(path.join(output,'de/laender/malaysia/index.html'),'excluded');assert.throws(()=>assertPublicOutput(output,assetDocs,assetRoot,assetPolicy),/OUTPUT_COVERAGE/);rmSync(path.join(output,'de'),{recursive:true});
 writeFileSync(path.join(output,'assets/test.png'),'changed');assert.throws(()=>assertPublicOutput(output,assetDocs,assetRoot,assetPolicy),/OUTPUT_ASSET_BYTES/);
});
test('Readiness retains full legal and operator semantics, scoped-out draft does not block synthetic selected fixture',()=>{
 const good={mode:'production',domain:'https://synthetic-gate-fixture.org',operatorFacts:{legalName:'Synthetic test entity',legalForm:'Test form',representative:'Test person',postalAddress:'Test address',publicEmail:'test@synthetic-gate-fixture.org',privacyContact:'Test contact'},approvals:{publication:true,legal:true,content:true}};
 const fixture=[{route:'/de/',lang:'de',translation:'/en/',reviewStatus:'approved'},{route:'/en/',lang:'en',translation:'/de/',reviewStatus:'approved'}];assert.doesNotThrow(()=>assertProductionReady(good,fixture));
 assert.throws(()=>assertProductionReady(good,[...fixture,{route:'/de/omitted-draft/',reviewStatus:'draft_for_review'}]),/nicht tatsächlich/);
 for(const changed of [{...good,approvals:{...good.approvals,legal:false}},{...good,approvals:{...good.approvals,publication:false}},{...good,operatorFacts:{...good.operatorFacts,legalName:null}}])assert.throws(()=>assertProductionReady(changed,fixture));
 assert.throws(()=>assertProductionReady(good,[{...fixture[0],translation:null,kind:'legal',releaseBlockers:['Actual operator fact unresolved']}]),/Actual operator fact/);
 assert.throws(()=>assertProductionReady(good,[{...fixture[0],translation:null,kind:'legal',sections:[{reviewRequirements:['Actual section check unresolved']}]}]),/Abschnitten/);
 assert.equal(JSON.stringify(pages),originalJSON);assert.deepEqual(publication,JSON.parse(readFileSync(path.join(root,'src/data/publication.json'),'utf8')));
});
test('Real patched production entry can be negatively exercised only in an explicit isolated snapshot',async()=>{
 if(!process.env.EXOBASIS_TEST_SNAPSHOT)return; // Never call build() from a normal npm unit test in the actual website.
 const before=sha256(readFileSync(path.join(root,'src/data/publication.json')));
 const negative=pages.map(p=>p.route==='/de/'?{...p,reviewStatus:'draft_for_review'}:p);
 await assert.rejects(build({mode:'production'},async()=>negative),/nicht tatsächlich freigegeben/);
 assert.equal(sha256(readFileSync(path.join(root,'src/data/publication.json'))),before);
});
writeFileSync(path.join(scratch,'render-probe-summary.json'),JSON.stringify({kind:'ACTUAL_SOURCE_RENDER_PROBE_NOT_RELEASE',routes:138,neutralReferences:neutralized,assets:actualAssets,sourceApprovalsUnchanged:true,sitemapIndexableURLs:134,sourceLinks:1534,personalAcceptance:false,productionBuildSucceeded:false},null,2));
