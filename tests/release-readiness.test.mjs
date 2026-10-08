import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {readContent} from '../scripts/build.mjs';
import {registry} from '../src/lib/site.mjs';
import {CORE_ROUTES} from '../src/lib/release-scope.mjs';
import {prepareRelease} from '../src/lib/release-readiness.mjs';
const scratch=mkdtempSync(path.join(process.env.EXOBASIS_TEST_SCRATCH||os.tmpdir(),'release-ready-'));
test.after(()=>rmSync(scratch,{recursive:true,force:true}));
mkdirSync(path.join(scratch,'src/data'),{recursive:true});
const source='src/data/release-unit.json';
const manifest={version:1,id:'erstrelease-unit',source,assetPolicy:'src/data/release-assets-unit.json',routes:CORE_ROUTES,optionalReferences:[]};
writeFileSync(path.join(scratch,source),JSON.stringify(manifest));
const actual=await readContent(),original=JSON.stringify(actual);
// APPROVALS ARE IN-MEMORY TEST FIXTURES ONLY, NEVER WRITTEN TO ACTIVE SOURCES.
const fixture=actual.map(p=>CORE_ROUTES.includes(p.route)?{...p,reviewStatus:'approved',releaseBlockers:[],sections:p.sections?.map(s=>({...s,reviewRequirements:[]}))}:{...p,reviewStatus:'draft_for_review'});
const config={mode:'production',domain:'https://synthetic-gate-fixture.org',operatorFacts:{legalName:'Synthetic test entity',legalForm:'Test form',representative:'Test person',postalAddress:'Test address',publicEmail:'legal@exobasis.com',privacyContact:'legal@exobasis.com'},approvals:{publication:true,legal:true,content:true},contact:{enabled:true,email:'info@exobasis.com',formEndpoint:'/api/enquiry'},releaseScope:{version:1,id:manifest.id,source}};
const ready=(cfg=config,pages=fixture)=>prepareRelease(cfg,pages,registry,{root:scratch});
test('shared gate selects original objects; excluded draft countries do not block readiness',()=>{
 const selected=ready();assert.equal(selected.pages.length,CORE_ROUTES.length);
 for(const p of selected.pages)assert.equal(p,fixture.find(x=>x.route===p.route));
 assert.ok(fixture.some(p=>p.kind==='country'&&p.reviewStatus!=='approved'));
 assert.equal(JSON.stringify(actual),original);
});
test('shared gate blocks missing selection, selected draft, real legal requirements and all three approvals',()=>{
 assert.throws(()=>ready({...config,releaseScope:undefined}),/RELEASE_CONFIG/);
 assert.throws(()=>ready(config,fixture.map(p=>p.route==='/de/'?{...p,reviewStatus:'draft_for_review'}:p)),/nicht tatsächlich freigegeben/);
 for(const key of ['content','legal','publication'])assert.throws(()=>ready({...config,approvals:{...config.approvals,[key]:false}}),/freigabe/);
 for(const change of [{releaseBlockers:['Required fixture fact']},{sections:[{reviewRequirements:['Required section fact']}]}])assert.throws(()=>ready(config,fixture.map(p=>p.route==='/de/datenschutz/'?{...p,...change}:p)),/Rechts|Abschnitten/);
 assert.throws(()=>ready({...config,operatorFacts:{...config.operatorFacts,postalAddress:null}}),/postalAddress/);
 for(const domain of [null,'http://exobasis.com','https://launch.example'])assert.throws(()=>ready({...config,domain}),/domain|Domain|HTTPS/);
});
test('shared gate requires active same-origin enquiry and confirmed public role, no forminbox leak',()=>{
 for(const contact of [{...config.contact,enabled:false},{...config.contact,email:'forminbox@exobasis.com'},{...config.contact,formEndpoint:'https://other.org/api/enquiry'}])assert.throws(()=>ready({...config,contact}),/Kontakt|Anfrage|info/);
 assert.equal(ready({mode:'preview',releaseScope:{id:'bad'}}).pages.length,150);
});
