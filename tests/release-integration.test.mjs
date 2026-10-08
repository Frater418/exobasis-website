import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,writeFileSync,readFileSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {ROOT} from '../src/lib/site.mjs';
import {sha256} from '../src/lib/release-scope.mjs';
const scratch=mkdtempSync(path.join(process.env.EXOBASIS_TEST_SCRATCH||process.env.TMPDIR||os.tmpdir(),'release-integration-'));
test.after(()=>rmSync(scratch,{recursive:true,force:true}));
const root=path.join(scratch,'snapshot');mkdirSync(root);
for(const name of ['src','scripts','public','node_modules'])cpSync(path.join(ROOT,name),path.join(root,name),{recursive:true});
mkdirSync(path.join(root,'editorial'));cpSync(path.join(ROOT,'editorial/package-scope.json'),path.join(root,'editorial/package-scope.json'));cpSync(path.join(ROOT,'package.json'),path.join(root,'package.json'));
const put=(name,data)=>writeFileSync(path.join(root,name),JSON.stringify(data,null,2)+'\n');
const imports=name=>import(pathToFileURL(path.join(root,name)));
const {build,readContent}=await imports('scripts/build.mjs');
const {check}=await imports('scripts/check.mjs');
const {startEnquiry}=await imports('scripts/serve-enquiry.mjs');
const {publicContexts}=await imports('src/lib/enquiry-context.mjs');
const {registry}=await imports('src/lib/site.mjs');
const {selectReleaseScope,B_ASSET_CONTRACT,assertPublicOutput}=await imports('src/lib/release-scope.mjs');
const actual=await readContent(),original=JSON.stringify(actual);
const homeFiles=['src/content/de/home.json','src/content/de/home.html','src/content/en/home.json','src/content/en/home.html'];
const homeHashes=Object.fromEntries(homeFiles.map(f=>[f,sha256(readFileSync(path.join(root,f)))]));
// Old recommendation reused only as an explicit non-authorizing test vector.
const manifest={...JSON.parse(readFileSync(path.join(ROOT,'tests/fixtures/historical138.json'),'utf8')),id:'erstrelease-testfixture-20261008',source:'src/data/release-testfixture-20261008.json',assetPolicy:'src/data/release-assets-testfixture-20261008.json'};
put(manifest.source,manifest);
const fixturePages=actual.map(p=>manifest.routes.includes(p.route)?{...p,reviewStatus:'approved',releaseBlockers:[],sections:p.sections?.map(s=>({...s,reviewRequirements:[]}))}:p);
const reader=async()=>fixturePages;
const publication={...JSON.parse(readFileSync(path.join(root,'src/data/publication.json'),'utf8')),domain:'https://synthetic-gate-fixture.org',approvals:{content:true,legal:true,publication:true},contact:{enabled:true,email:'info@exobasis.com',formEndpoint:'/api/enquiry',calendar:null,cryptpad:null,simplex:null,booking:null},releaseScope:{version:1,id:manifest.id,source:manifest.source}};
// Existing operator facts are retained as parser inputs, not claimed as operating approval.
put('src/data/publication.json',publication);
const brand=JSON.parse(readFileSync(path.join(root,'src/data/brand-assets.json'),'utf8'));
const assetRecords={};
function catalog(dir){for(const ent of readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,ent.name);if(ent.isDirectory())catalog(f);else{const name=path.relative(path.join(root,'public'),f).replaceAll('\\','/');assetRecords[name]={sha256:sha256(readFileSync(f)),rightsEvidence:'SYNTHETIC ISOLATED TEST FIXTURE ONLY; not a real publication-rights assertion',licenseFiles:brand.fonts.some(x=>x.path===name)?[brand.fonts.find(x=>x.path===name).license,'assets/fonts/SCHRIFTLIZENZEN.txt']:[]};}}}
catalog(path.join(root,'public'));put(manifest.assetPolicy,{version:1,assets:assetRecords});
const env={EXOBASIS_ORIGIN:publication.domain,EXOBASIS_SMTP_HOST:'127.0.0.1',EXOBASIS_SMTP_PORT:'587',EXOBASIS_SMTP_USER:'isolated-fixture',EXOBASIS_SMTP_PASSWORD:'not-a-credential-isolated-fixture',EXOBASIS_MAIL_FROM:'noreply@exobasis.com',EXOBASIS_MAIL_TO:'forminbox@exobasis.com',EXOBASIS_ENQUIRY_PORT:'4180'};
const summary={kind:'ISOLATED_POSITIVE_FIXTURE_NOT_REAL_RELEASE',approvalMethod:'in-memory cloned page metadata; no source/home JSON or HTML is changed',historicalScopeIsNotCurrentReleaseDecision:true};
test('all three real entry functions reject unbound scope and selected draft before transport/output',async()=>{
 let transports=0;
 for(const change of [{releaseScope:null},{releaseScope:{...publication.releaseScope,id:'erstrelease-wrong'}},{approvals:{...publication.approvals,legal:false}},{contact:{...publication.contact,enabled:false}}]){
  put('src/data/publication.json',{...publication,...change});
  for(const run of [()=>build({mode:'production'},reader),()=>check({mode:'production'},reader),()=>startEnquiry(env,()=>{transports++;throw new Error('transport must not be created');},reader)])await assert.rejects(run,/RELEASE_|freigabe/);
 }
 put('src/data/publication.json',publication);
 const draft=async()=>fixturePages.map(p=>p.route==='/de/'?{...p,reviewStatus:'draft_for_review'}:p);
 for(const run of [()=>build({mode:'production'},draft),()=>check({mode:'production'},draft),()=>startEnquiry(env,()=>{transports++;throw new Error('transport must not be created');},draft)])await assert.rejects(run,/nicht tatsächlich freigegeben/);
 assert.equal(transports,0);assert.equal(existsSync(path.join(root,'.release-stage')),false);assert.equal(existsSync(path.join(root,'dist-release')),false);
});
test('real builder/checker complete a rights-bound subset fixture, unchanged inputs and exact public graph',async()=>{
 const built=await build({mode:'production'},reader);assert.equal(built.builtVariants,manifest.routes.length);
 const checked=await check({mode:'production'},reader);assert.equal(checked.status,'passed');assert.equal(checked.counts.built,manifest.routes.length);assert.deepEqual(checked.errors,[]);
 const docs=new Map([['index.html',readFileSync(path.join(root,'dist-release/index.html'),'utf8')],...manifest.routes.map(r=>[r.slice(1)+'index.html',readFileSync(path.join(root,'dist-release',r.slice(1),'index.html'),'utf8')])]);
 const exact=assertPublicOutput(path.join(root,'dist-release'),docs,path.join(root,'public'),{version:1,assets:assetRecords});
 for(const name of Object.keys(B_ASSET_CONTRACT))assert.equal(sha256(readFileSync(path.join(root,'dist-release',name))),B_ASSET_CONTRACT[name]);
 for(const p of actual.filter(p=>!manifest.routes.includes(p.route)))assert.equal(existsSync(path.join(root,'dist-release',p.route.slice(1),'index.html')),false);
 for(const html of docs.values())assert.doesNotMatch(html,/forminbox@|noreply@/);
 for(const [name,hash] of Object.entries(homeHashes))assert.equal(sha256(readFileSync(path.join(root,name))),hash);
 assert.equal(JSON.stringify(await readContent()),original);
 summary.build={variants:built.builtVariants,scope:built.releaseScope};summary.check=checked;summary.output=exact;summary.homeInputBytesUnchanged=true;summary.sourcePageMetadataUnchanged=true;
});
test('production check rejects leaked output, changed emitted asset bytes and missing real rights',async()=>{
 const output=path.join(root,'dist-release');writeFileSync(path.join(output,'private.env'),'fixture leak');await assert.rejects(check({mode:'production'},reader),/OUTPUT_COVERAGE/);rmSync(path.join(output,'private.env'));
 const name='assets/fonts/manrope-latin.woff2',bytes=readFileSync(path.join(output,name));writeFileSync(path.join(output,name),'tampered');await assert.rejects(check({mode:'production'},reader),/OUTPUT_ASSET_BYTES/);writeFileSync(path.join(output,name),bytes);
 const rights=structuredClone(assetRecords);rights['css/exobasis-b-fonts.css'].rightsEvidence=null;put(manifest.assetPolicy,{version:1,assets:rights});await assert.rejects(check({mode:'production'},reader),/ASSET_RIGHTS/);put(manifest.assetPolicy,{version:1,assets:assetRecords});
});
test('existing starter serves only selected contexts, keeps fixed mail roles and closes all loopback resources',async()=>{
 const contexts=JSON.parse(readFileSync(path.join(root,'src/data/country-contexts.json'),'utf8'));delete contexts['/de/laender/malaysia/'];delete contexts['/en/countries/malaysia/'];put('src/data/country-contexts.json',contexts);
 assert.throws(()=>publicContexts('de'),/Missing country context/);
 const selection=selectReleaseScope({...publication,mode:'production'},fixturePages,registry,{root});assert.doesNotThrow(()=>publicContexts('de',{routes:selection.routes}));
 const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 const runtime={...env,EXOBASIS_ENQUIRY_PORT:String(port)};let verified=0,closed=0;const messages=[];
 const transport={verify:async()=>{verified++;},sendMail:async mail=>{messages.push(mail);return {accepted:['forminbox@exobasis.com'],rejected:[]};},close:()=>{closed++;}};
 let server;
 try{
  ({server}=await startEnquiry(runtime,()=>transport,reader));assert.equal(verified,1);assert.equal(server.address().address,'127.0.0.1');
  const post=context=>fetch(`http://127.0.0.1:${port}/api/enquiry`,{method:'POST',headers:{Origin:publication.domain,'Content-Type':'application/json'},body:JSON.stringify({lang:'de',replyLanguage:'en',email:'visitor@exobasis.invalid',intent:'Allgemeine Anfrage',context,message:'Isolated fixture, captured locally'})});
  const excluded=await post('/de/laender/malaysia/');assert.equal(excluded.status,422);assert.deepEqual((await excluded.json()).fields,['context']);assert.equal(messages.length,0);
  const retained=await post('/de/laender/uruguay/');assert.equal(retained.status,202);assert.doesNotMatch(JSON.stringify(await retained.json()),/forminbox|noreply/);assert.equal(messages.length,1);
  assert.equal(messages[0].from,'noreply@exobasis.com');assert.equal(messages[0].to,'forminbox@exobasis.com');assert.equal(messages[0].replyTo,'visitor@exobasis.invalid');assert.deepEqual(messages[0].envelope,{from:'noreply@exobasis.com',to:['forminbox@exobasis.com']});
 }finally{if(server)await new Promise(resolve=>server.close(resolve));transport.close();}
 assert.equal(server.listening,false);assert.equal(closed,1);summary.service={loopbackClosed:true,transportVerification:'mocked; no provider connection',capturedInternalMessages:messages.length,excludedContextHTTP:422,selectedContextHTTP:202,noAcknowledgementEmail:true};
 if(process.env.EXOBASIS_TEST_REPORT_DIR)writeFileSync(path.join(process.env.EXOBASIS_TEST_REPORT_DIR,'positive-fixture.json'),JSON.stringify(summary,null,2)+'\n');
});
test('SMTP verification failure never listens and releases the transport',async()=>{
 let closed=0;await assert.rejects(startEnquiry(env,()=>({verify:async()=>{throw new Error('isolated failure');},close:()=>closed++}),reader),/SMTP_VERIFICATION_FAILED/);assert.equal(closed,1);
});
