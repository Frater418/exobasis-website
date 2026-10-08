import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {ROOT} from '../src/lib/site.mjs';
import {B_ASSET_CONTRACT,sha256,publicAssetClosure,licensedAssetClosure,assertPublicOutput} from '../src/lib/release-scope.mjs';
const scratch=mkdtempSync(path.join(process.env.EXOBASIS_TEST_SCRATCH||process.env.TMPDIR||os.tmpdir(),'release-assets-'));
test.after(()=>rmSync(scratch,{recursive:true,force:true}));
const pub=path.join(scratch,'public');mkdirSync(pub,{recursive:true});
const put=(name,bytes)=>{const f=path.join(pub,name);mkdirSync(path.dirname(f),{recursive:true});writeFileSync(f,bytes);};
for(const name of Object.keys(B_ASSET_CONTRACT))put(name,readFileSync(path.join(ROOT,'public',name)));
const brand=JSON.parse(readFileSync(path.join(ROOT,'src/data/brand-assets.json'),'utf8'));
const policy={version:1,assets:Object.fromEntries(Object.entries(B_ASSET_CONTRACT).map(([name,hash])=>[name,{sha256:hash,rightsEvidence:'ISOLATED FIXTURE ONLY; exact supplied B licence bytes',licenseFiles:brand.fonts.some(x=>x.path===name)?[brand.fonts.find(x=>x.path===name).license,'assets/fonts/SCHRIFTLIZENZEN.txt']:[]}]))};
const docs=new Map([['index.html','<style>@font-face{src:url(/assets/fonts/manrope-latin.woff2)}@font-face{src:url(/assets/fonts/manrope-latin-ext.woff2)}@font-face{src:url(/assets/fonts/source-sans-3-latin.woff2)}@font-face{src:url(/assets/fonts/source-sans-3-latin-ext.woff2)}</style>']]);
test('actual B contract yields exactly four WOFF2 plus three unchanged licence files',()=>{
 assert.deepEqual(licensedAssetClosure(docs,pub,policy).map(x=>x.path).sort(),Object.keys(B_ASSET_CONTRACT).sort());
 const source=Object.fromEntries([...brand.fonts,...brand.licenses].map(x=>[x.path,x.sha256]));assert.deepEqual({...B_ASSET_CONTRACT},source);
});
test('B fonts require hash/signature, exact family licence and notice, and explicit rights for every artefact',()=>{
 for(const change of [p=>p.assets['assets/fonts/manrope-latin.woff2'].sha256='0'.repeat(64),p=>p.assets['assets/fonts/manrope-latin.woff2'].licenseFiles=[],p=>p.assets['assets/fonts/manrope-latin.woff2'].licenseFiles=['assets/fonts/LICENSE-SourceSans3.txt','assets/fonts/SCHRIFTLIZENZEN.txt'],p=>p.assets['assets/fonts/SCHRIFTLIZENZEN.txt'].rightsEvidence=null]){const p=structuredClone(policy);change(p);assert.throws(()=>licensedAssetClosure(docs,pub,p),/RELEASE_/);}
 const name='assets/fonts/manrope-latin.woff2',bytes=readFileSync(path.join(pub,name));put(name,Buffer.from('wOF2-tampered-real-contract'));const p=structuredClone(policy);p.assets[name].sha256=sha256(readFileSync(path.join(pub,name)));assert.throws(()=>licensedAssetClosure(docs,pub,p),/FONT_BYTES/);put(name,bytes);
 const license='assets/fonts/LICENSE-Manrope.txt',lic=readFileSync(path.join(pub,license));put(license,'Modified licence');const q=structuredClone(policy);q.assets[license].sha256=sha256(readFileSync(path.join(pub,license)));assert.throws(()=>licensedAssetClosure(docs,pub,q),/B_ASSET_BYTES/);put(license,lic);
});
test('unknown fonts, arbitrary txt/json, secrets and normalized traversal fail closed',()=>{
 put('assets/fonts/other.woff2','wOF2-not-approved');const p={version:1,assets:{'assets/fonts/other.woff2':{sha256:sha256('wOF2-not-approved'),rightsEvidence:'fixture',licenseFiles:[]}}};
 assert.throws(()=>licensedAssetClosure(new Map([['index.html','<style>x{src:url(/assets/fonts/other.woff2)}</style>']]),pub,p),/FONT_PATH/);
 for(const url of ['/assets/fonts/other.txt','/assets/private.json','/src/content/de/home.json','/assets/.env','/assets/%2e%2e/css/site.css','/../../../assets/a.png','/assets/x%2fy.png','/assets/x%00.png','file:///secret'])assert.throws(()=>publicAssetClosure(new Map([['index.html',`<img src="${url}"/>`]]),pub),/RELEASE_/);
});
test('real srcset, nested CSS, SVG and static JS literals form a transitive resource closure',()=>{
 put('css/root.css','@import "nested.css"; x{background:url(../assets/p.png)}');put('css/nested.css','x{background:url(../assets/p2.png)}');put('assets/p.png','p');put('assets/p2.png','p2');
 put('assets/s.svg','<svg><g id="shape"/><image href="p2.png"/><style>x{fill:url(#shape)}</style></svg>');put('js/deps.js','const literal="/assets/s.svg#shape"; const relative="../assets/p2.png";');
 const d=new Map([['index.html','<link rel="stylesheet" href="/css/root.css"/><script src="/js/deps.js"></script><img srcset="/assets/p.png 1x, /assets/p2.png 2x"/>']]);
 assert.deepEqual(publicAssetClosure(d,pub).map(x=>x.path).sort(),['assets/p.png','assets/p2.png','assets/s.svg','css/nested.css','css/root.css','js/deps.js']);
 for(const srcset of ['/assets/p.png 0w','/assets/p.png nope','/assets/p.png 1x,'])assert.throws(()=>publicAssetClosure(new Map([['index.html',`<img srcset="${srcset}"/>`]]),pub),/RELEASE_SRCSET/);
 put('js/deps.js','const computed=`/assets/${name}.png`;');assert.throws(()=>publicAssetClosure(d,pub),/DYNAMIC_ASSET/);
});
test('native symlink/junction cannot escape public or enter release output',()=>{
 const outside=path.join(scratch,'outside');mkdirSync(outside);writeFileSync(path.join(outside,'secret.png'),'private fixture');
 const junction=path.join(pub,'assets','alias');
 if(process.platform==='win32'){const r=spawnSync('cmd.exe',['/d','/c','mklink','/J',junction,outside],{encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);}else{const r=spawnSync('ln',['-s',outside,junction]);assert.equal(r.status,0);}
 assert.throws(()=>publicAssetClosure(new Map([['index.html','<img src="/assets/alias/secret.png"/>']]),pub),/RELEASE_PATH|RELEASE_SYMLINK/);
 const output=path.join(scratch,'output');mkdirSync(output);const outAlias=path.join(output,'alias');
 if(process.platform==='win32'){const r=spawnSync('cmd.exe',['/d','/c','mklink','/J',outAlias,outside],{encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);}else{const r=spawnSync('ln',['-s',outside,outAlias]);assert.equal(r.status,0);}
 assert.throws(()=>assertPublicOutput(output,new Map(),pub,{version:1,assets:{}}),/OUTPUT_SYMLINK/);
});
