import {readFileSync,realpathSync,lstatSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const fail=(code,detail)=>{throw new Error(`${code}: ${detail}`);};
export const sha256=value=>createHash('sha256').update(value).digest('hex');

// Bound to src/data/brand-assets.json and ANSCHLUSS_SERVERSTRANG.md, 2026-10-08.
export const B_ASSET_CONTRACT=Object.freeze({
 "assets/fonts/manrope-latin-ext.woff2": "3911b66d9f2e005a4b989223405d0e5032619c668597ba467cc76a23c8fffcfb",
 "assets/fonts/manrope-latin.woff2": "a30ddcd349703aff7464c34bef3fffdff405ee50c113440d7c8693c02d210972",
 "assets/fonts/source-sans-3-latin-ext.woff2": "a85a7459bdb3cdc1136751e151a506bae653fc29ada3ca86237477df6f1b59e6",
 "assets/fonts/source-sans-3-latin.woff2": "19143dca075972bc84e3fd9eab7416dd40cc565dccb2435a044bdfabe060c7d5",
 "assets/fonts/LICENSE-Manrope.txt": "58172e0c0fac2cda8a37b348164bb55e44b0e69051e557e92b1d3f6910141f7b",
 "assets/fonts/SCHRIFTLIZENZEN.txt": "17065cc3bc1815bf918e543d88ae9715e1f5c586a8f8d942c7421b5391392ad6",
 "assets/fonts/LICENSE-SourceSans3.txt": "56af9b9c6715597e458284a474dc118a50a4150e9d547c70f7b4a33c3e6a9328"
});
const bLicenses=Object.keys(B_ASSET_CONTRACT).filter(p=>p.endsWith('.txt'));
const bFontLicenses=Object.freeze({
 "assets/fonts/manrope-latin-ext.woff2": [
  "assets/fonts/LICENSE-Manrope.txt",
  "assets/fonts/SCHRIFTLIZENZEN.txt"
 ],
 "assets/fonts/manrope-latin.woff2": [
  "assets/fonts/LICENSE-Manrope.txt",
  "assets/fonts/SCHRIFTLIZENZEN.txt"
 ],
 "assets/fonts/source-sans-3-latin-ext.woff2": [
  "assets/fonts/LICENSE-SourceSans3.txt",
  "assets/fonts/SCHRIFTLIZENZEN.txt"
 ],
 "assets/fonts/source-sans-3-latin.woff2": [
  "assets/fonts/LICENSE-SourceSans3.txt",
  "assets/fonts/SCHRIFTLIZENZEN.txt"
 ]
});
const routePattern=/^\/(de|en)\/(?:[a-z0-9-]+\/)*$/;
const own=(object,key)=>Object.hasOwn(object,key);
const decode=value=>String(value).replace(/&amp;/g,'&').replace(/&#(?:x([\da-f]+)|(\d+));/gi,(_,hex,num)=>String.fromCodePoint(parseInt(hex||num,hex?16:10))).replace(/&quot;/g,'"').replace(/&apos;/g,"'");
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3])]));
export const CORE_ROUTES=Object.freeze([
 '/de/','/en/','/de/leistungen/','/en/services/','/de/wissen/','/en/knowledge/',
 '/de/laender/','/en/countries/','/de/anfrage/','/en/enquiry/',
 '/de/anfrage/bestaetigung/','/en/enquiry/confirmation/','/de/404/','/en/404/',
 '/de/arbeitsweise/','/en/how-we-work/','/de/diskretion/','/en/discretion/',
 '/de/zusammenarbeit/','/en/collaboration/','/de/anbieterinformationen/','/en/provider-information/',
 '/de/datenschutz/','/en/privacy/','/de/leistungsbedingungen/','/en/service-terms/'
]);
const jsonAt=(root,name)=>JSON.parse(readFileSync(safeFile(root,name),'utf8'));
function safeFile(root,name){
 if(typeof name!=='string'||name.includes('\\')||name.includes('%')||name.includes(':')||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..'))fail('RELEASE_PATH',String(name));
 const base=realpathSync(root),file=path.resolve(base,name),real=realpathSync(file);
 if(real!==file||!real.startsWith(base+path.sep)||!lstatSync(file).isFile())fail('RELEASE_PATH',name);
 // No symlink in any intermediate component, including directory aliases.
 let cursor=base;for(const part of name.split('/')){cursor=path.join(cursor,part);if(lstatSync(cursor).isSymbolicLink())fail('RELEASE_SYMLINK',name);}
 return file;
}
/** Select before readiness. Never filter by approved, change a page or set an approval. */
export function selectReleaseScope(config,allPages,registry,{root}={}){
 if(!['preview','production'].includes(config?.mode))fail('RELEASE_MODE',String(config?.mode));
 const index=new Map(registry.map(p=>[p.route,p])),content=new Map(allPages.map(p=>[p.route,p]));
 if(index.size!==registry.length||content.size!==allPages.length)fail('RELEASE_DUPLICATE_SOURCE','registry/content');
 if(index.size!==content.size||[...index.keys()].some(r=>!content.has(r)))fail('RELEASE_SOURCE_COVERAGE','Full authoring set must remain available');
 for(const p of allPages){
  const original=index.get(p.route);
  if(!routePattern.test(p.route)||p.lang!==original?.lang||p.translation!==original.translation)fail('RELEASE_SOURCE_IDENTITY',p.route);
  if(p.parent && original.parent && p.parent!==original.parent)fail('RELEASE_PARENT_CONFLICT',p.route);
 }
 if(config.mode==='preview')return {pages:allPages,routes:new Set(content.keys()),manifest:null};
 const binding=config.releaseScope;
 if(!binding||Object.keys(binding).sort().join('|')!=='id|source|version'||binding.version!==1||!/^erstrelease-[a-z0-9-]+$/.test(binding.id)||!/^src\/data\/release-[a-z0-9-]+\.json$/.test(binding.source))fail('RELEASE_CONFIG','Explicit version, id and src/data/release-*.json source required');
 const manifest=jsonAt(root,binding.source);
 const keys=Object.keys(manifest).sort().join('|');
 if(keys!=='assetPolicy|id|optionalReferences|routes|source|version'||manifest.version!==1||manifest.id!==binding.id||manifest.source!==binding.source||!/^src\/data\/release-assets-[a-z0-9-]+\.json$/.test(manifest.assetPolicy))fail('RELEASE_BINDING',binding.source);
 if(!Array.isArray(manifest.routes)||!manifest.routes.length)fail('RELEASE_EMPTY','routes');
 const routes=new Set();
 for(const r of manifest.routes){if(typeof r!=='string'||!routePattern.test(r)||!index.has(r))fail('RELEASE_UNKNOWN_ROUTE',String(r));if(routes.has(r))fail('RELEASE_DUPLICATE_ROUTE',r);routes.add(r);}
 for(const r of CORE_ROUTES)if(!routes.has(r))fail('RELEASE_REQUIRED_ROUTE',r);
 const pages=allPages.filter(p=>routes.has(p.route));
 for(const p of pages){
  const original=index.get(p.route);
  if(original.translation&&(!routes.has(original.translation)||index.get(original.translation)?.translation!==p.route||index.get(original.translation)?.lang===p.lang))fail('RELEASE_LANGUAGE_PAIR',p.route);
  // Registry hierarchy is authoritative even when a content object has parent:null.
  const parents=[original.parent,p.parent].filter(Boolean);
  for(const r of parents)if(!routes.has(r)||index.get(r)?.lang!==p.lang)fail('RELEASE_PARENT',`${p.route} -> ${r}`);
  const seen=new Set([p.route]);let ancestor=original.parent;
  while(ancestor){if(seen.has(ancestor))fail('RELEASE_PARENT_CYCLE',p.route);seen.add(ancestor);ancestor=index.get(ancestor)?.parent;}
 }
 if(!Array.isArray(manifest.optionalReferences))fail('RELEASE_REFERENCE_CONFIG','optionalReferences');
 const rules=new Set();
 for(const r of manifest.optionalReferences){
  if(!r||Object.keys(r).sort().join('|')!=='bodySHA256|href|occurrences|reason|source'||!routes.has(r.source)||typeof r.href!=='string'||!r.href.startsWith('/')||r.href.startsWith('//')||!index.has(r.href.split(/[?#]/)[0])||routes.has(r.href.split(/[?#]/)[0])||!/^([a-f0-9]{64})$/.test(r.bodySHA256)||!Number.isInteger(r.occurrences)||r.occurrences<1||typeof r.reason!=='string'||!r.reason.trim())fail('RELEASE_REFERENCE_CONFIG',JSON.stringify(r));
  const key=[r.source,r.href,r.bodySHA256].join('|');if(rules.has(key))fail('RELEASE_REFERENCE_DUPLICATE',key);rules.add(key);
 }
 return {pages,routes,manifest,sourceHash:sha256(readFileSync(safeFile(root,binding.source)))};
}
/** Structural navigation only. Labels, ordering and descriptions are not rewritten. */
export function scopedNavigation(nav,routes){
 if(!routes)return nav;
 return nav.filter(root=>routes.has(root.route)).map(root=>({...root,groups:root.groups.map(g=>({...g,links:g.links.filter(l=>routes.has(l.route))})).filter(g=>g.links.length)}));
}
export function scopedContexts(contexts,routes){return routes?Object.fromEntries(Object.entries(contexts).filter(([r])=>routes.has(r))):contexts;}
/** Exact, occurrence-bounded optional mentions. All other omitted links are prerequisites. */
export function scopeReferences(html,from,scope){
 if(!scope.manifest)return html;
 const expected=scope.manifest.optionalReferences.filter(r=>r.source===from),seen=new Map(expected.map(r=>[r,0]));
 html=html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi,(whole,attributeText,body)=>{
  const a=attrs(attributeText),href=a.href;
  if(!href)return whole;
  if(/^(?:javascript|vbscript|data):/i.test(href))fail('RELEASE_UNSAFE_LINK',from);
  if(!href.startsWith('/')||href.startsWith('//'))return whole;
  const base=href.split(/[?#]/)[0];
  if(base==='/'||scope.routes.has(base))return whole;
  const rule=expected.find(r=>r.href===href&&r.bodySHA256===sha256(body));
  if(!rule)fail('RELEASE_REQUIRED_TARGET',`${from} -> ${href}`);
  // A CTA, form action, visual card, control or icon cannot become a fake disabled button.
  if(/<(?:svg|img|button|input|a)\b/i.test(body)||/btn|button|card|choice|overview|menu|flag|brand/i.test(a.class||'')||a.role||a.onclick||a.tabindex||a.download||Object.keys(a).some(k=>k.startsWith('aria-')))fail('RELEASE_ACTION_REQUIRES_TARGET',`${from} -> ${href}`);
  seen.set(rule,seen.get(rule)+1);
  // Keep the same label and any authored ID, remove all interactive styling and metadata.
  const id=a.id?` id="${a.id.replaceAll('&','&amp;').replaceAll('"','&quot;')}"`:'';
  return `<span${id}>${body}</span>`;
 });
 for(const [rule,count] of seen)if(count!==rule.occurrences)fail('RELEASE_REFERENCE_DRIFT',`${from} -> ${rule.href}: ${count}/${rule.occurrences}`);
 return html;
}
/** Validate actual emitted HTML, including same-page/SVG IDs and retained query contexts. */
export function assertScopedDocuments(documents,scope,{origin}={}){
 const byFile=new Map(documents),expected=new Set(['index.html',...scope.pages.map(p=>p.route.slice(1)+'index.html')]);
 if(byFile.size!==expected.size||[...byFile.keys()].some(f=>!expected.has(f)))fail('RELEASE_HTML_COVERAGE','actual HTML documents');
 for(const [file,html] of byFile){
  if(/exb-pending|data-package-dependency/.test(html)||/<(?:a|span)\b[^>]*data-route=[^>]*aria-disabled="true"/.test(html))fail('RELEASE_PENDING_HTML',file);
  const ids=[...html.matchAll(/\bid="([^"]*)"/g)].map(m=>decode(m[1]));if(ids.length!==new Set(ids).size)fail('RELEASE_DUPLICATE_ID',file);
  const route=file==='index.html'?'/':'/'+file.slice(0,-10);
  for(const tag of html.matchAll(/<(?:a|link|form|use)\b[^>]*>/gi)){
   const a=attrs(tag[0]),href=a.href??a['xlink:href']??a.action;
   if(href==null||href==='')continue;
   if(/^(?:javascript|vbscript|data):/i.test(href))fail('RELEASE_UNSAFE_LINK',file);
   const u=new URL(href,new URL(route,origin));
   if(u.origin!==origin)continue;
   if(u.pathname.startsWith('/api/')){if(!['/api/enquiry','/api/enquiry/confirmation'].includes(u.pathname))fail('RELEASE_UNKNOWN_API',href);continue;}
   const target=u.pathname.endsWith('/')?u.pathname.slice(1)+'index.html':u.pathname.slice(1);
   if(target.endsWith('.html')||u.pathname.endsWith('/')){
    if(!byFile.has(target))fail('RELEASE_DEAD_LINK',`${file} -> ${href}`);
    if(u.hash&&!new RegExp('\\bid="'+decodeURIComponent(u.hash.slice(1)).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"').test(byFile.get(target)))fail('RELEASE_FRAGMENT',`${file} -> ${href}`);
   }else if(u.hash&&tag[0].startsWith('<use')&&target===file&&!ids.includes(decodeURIComponent(u.hash.slice(1))))fail('RELEASE_SVG_FRAGMENT',href);
   if(u.searchParams.has('kontext')&&!scope.routes.has(u.searchParams.get('kontext')))fail('RELEASE_CONTEXT_TARGET',href);
  }
  const blob=html.match(/id="exb-public-contexts">([\s\S]*?)<\/script>/)?.[1];
  if(blob)for(const r of Object.keys(JSON.parse(blob)))if(!scope.routes.has(r)||!r.startsWith('/'+(html.match(/<html lang="([^"]+)"/)?.[1])+'/'))fail('RELEASE_PUBLIC_CONTEXT',`${file} -> ${r}`);
 }
}
const cssUnescape=s=>s.replace(/\\([\da-f]{1,6})\s?|\\([^\r\n])/gi,(_,hex,c)=>hex?String.fromCodePoint(parseInt(hex,16)):c);
function cssURLs(text){
 text=text.replace(/\/\*[\s\S]*?\*\//g,'');
 return [...text.matchAll(/url\(\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^)]*))\s*\)/gi)].map(m=>cssUnescape(m[1]??m[2]??m[3]).trim()).concat([...text.matchAll(/@import\s+(?:"([^"]+)"|'([^']+)')/gi)].map(m=>cssUnescape(m[1]??m[2])));
}
/** Static dependency closure. No recursive copy, private paths or implicit font permission. */
export function publicAssetClosure(documents,publicRoot){
 const found=new Map(),queue=[];
 const add=(value,from,fragmentRequired=false)=>{
  if(!value)return;
  let raw;try{raw=decodeURIComponent(value);}catch{fail('RELEASE_ASSET_URL',value);}
  if(/%(?:2e|2f|5c|00)/i.test(value)||raw.includes('\\')||raw.includes('\0'))fail('RELEASE_ASSET_URL',value);
  // Legitimate CSS ../assets references stay inside public; URL normalization must not hide an escape.
  const parts=raw.startsWith('/')?[]:from.split('/').slice(0,-1);
  for(const part of raw.split(/[?#]/)[0].split('/')){if(!part||part==='.')continue;if(part==='..'){if(!parts.length)fail('RELEASE_ASSET_URL',value);parts.pop();}else parts.push(part);}
  if(value.startsWith('#')){if(fragmentRequired)checkFragment(from,value.slice(1));return;}
  if(/^(?:https?:|\/\/)/i.test(value))fail('RELEASE_EXTERNAL_ASSET',`${from} -> ${value}`);
  if(/^[a-z][a-z\d+.-]*:/i.test(value)||value.includes('\\')||value.includes('\0'))fail('RELEASE_ASSET_URL',value);
  let u;try{u=new URL(value,'https://asset.invalid/'+from);}catch{fail('RELEASE_ASSET_URL',value);}
  let name;try{name=decodeURIComponent(u.pathname.slice(1));}catch{fail('RELEASE_ASSET_URL',value);}
  if(!/^(?:assets|css|js|logo|licenses)\/[a-zA-Z0-9_.\/-]+$/.test(name)||name.split('/').some(p=>p==='.'||p==='..')||/\.(?:html?|md|csv|env|map)$/i.test(name))fail('RELEASE_PRIVATE_ASSET',name);
  if(!/\.(?:css|js|svg|png|webp|jpe?g|gif|ico|avif|woff2|txt|json)$/i.test(name))fail('RELEASE_ASSET_TYPE',name);
  if(/\.(?:txt|json)$/i.test(name)&&!bLicenses.includes(name)&&!/^licenses\/[a-zA-Z0-9_.-]+\.(txt|json)$/.test(name))fail('RELEASE_LICENSE_PATH',name);
  if(!found.has(name)){const file=safeFile(publicRoot,name);found.set(name,{path:name,sha256:sha256(readFileSync(file))});queue.push(name);}
  if(u.hash&&(fragmentRequired||name.endsWith('.svg')))checkFragment(name,decodeURIComponent(u.hash.slice(1)));
 };
 const checkFragment=(name,id)=>{const html=documents.get(name)??readFileSync(safeFile(publicRoot,name),'utf8');if(![...html.matchAll(/\bid=(?:"([^"]+)"|'([^']+)')/g)].some(m=>(m[1]??m[2])===id))fail('RELEASE_ASSET_FRAGMENT',`${name}#${id}`);};
 const scanHTML=(text,from)=>{
  for(const m of text.matchAll(/<[^!][^>]*>/g)){
   const a=attrs(m[0]),tag=m[0].match(/^<([\w:-]+)/)?.[1]?.toLowerCase();
   for(const key of ['src','poster'])if(a[key])add(a[key],from);
   if(a.srcset){if(/data:/i.test(a.srcset))fail('RELEASE_ASSET_URL',a.srcset);for(const item of a.srcset.split(',')){const match=item.trim().match(/^(\S+?)(?:\s+((?:\d+w)|(?:\d+(?:\.\d+)?x)))?$/);if(!match||match[2]&&Number.parseFloat(match[2])<=0)fail('RELEASE_SRCSET',a.srcset);add(match[1],from);}}
   if(['link','image','use'].includes(tag)){
    const href=a.href??a['xlink:href'];
    // SEO links point to documents, not assets. All resource links are checked.
    if(href&&(!['canonical','alternate'].includes(a.rel)))add(href,from,tag==='use');
   }
   if(a.style)for(const u of cssURLs(a.style))add(u,from);
  }
  for(const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))for(const u of cssURLs(m[1]))add(u,from);
  if(from.endsWith('.svg'))for(const u of cssURLs(text))add(u,from,true);
 };
 for(const [file,html] of documents)scanHTML(html,file);
 while(queue.length){const name=queue.shift();if(/\.(?:css|svg|js)$/.test(name)){
  const text=readFileSync(safeFile(publicRoot,name),'utf8');
  if(name.endsWith('.css'))for(const u of cssURLs(text))add(u,name);
  if(name.endsWith('.svg'))scanHTML(text,name);
  // Shipped JS has no computed asset loading. Exact local resource literals are collected.
  if(name.endsWith('.js'))for(const m of text.matchAll(/(['"`])([^'"`\r\n]*)\1/g)){
   const value=m[2];if(/^(?:\/?(?:assets|css|js|logo|licenses)\/|\.{1,2}\/).*\.(?:css|js|svg|png|webp|jpe?g|ico|avif|woff2)(?:[?#]|$)/i.test(value)){if(value.includes('${'))fail('RELEASE_DYNAMIC_ASSET',name);add(value,name);}
  }
 }}
 return [...found.values()].sort((a,b)=>a.path.localeCompare(b.path));
}
export function readAssetPolicy(root,scope){
 const policy=jsonAt(root,scope.manifest.assetPolicy);
 if(policy.version!==1||!policy.assets||Array.isArray(policy.assets)||Object.keys(policy).sort().join('|')!=='assets|version')fail('RELEASE_ASSET_POLICY',scope.manifest.assetPolicy);
 return policy;
}
/** A SHA records bytes; it does not prove ownership. Explicit rights evidence is separate. */
export function licensedAssetClosure(documents,publicRoot,policy){
 const base=publicAssetClosure(documents,publicRoot),files=new Map(base.map(a=>[a.path,a]));
 const validate=name=>{
  const bytes=readFileSync(safeFile(publicRoot,name)),record=policy?.assets?.[name];
  if(!record||record.sha256!==sha256(bytes)||typeof record.rightsEvidence!=='string'||!record.rightsEvidence.trim()||!Array.isArray(record.licenseFiles))fail('RELEASE_ASSET_RIGHTS',name);
  if(name.endsWith('.woff2')){
   if(!bFontLicenses[name])fail('RELEASE_FONT_PATH',name);
   if(bytes.subarray(0,4).toString()!=='wOF2'||sha256(bytes)!==B_ASSET_CONTRACT[name])fail('RELEASE_FONT_BYTES',name);
   if(!record.licenseFiles.length)fail('RELEASE_FONT_LICENSE',name);
   if(JSON.stringify([...record.licenseFiles].sort())!==JSON.stringify([...bFontLicenses[name]].sort()))fail('RELEASE_FONT_LICENSE',name);
  }
  if(name.endsWith('.txt')&&!own(B_ASSET_CONTRACT,name)&&!/^licenses\/[a-zA-Z0-9_.-]+\.txt$/.test(name))fail('RELEASE_LICENSE_PATH',name);
  if(own(B_ASSET_CONTRACT,name)&&sha256(bytes)!==B_ASSET_CONTRACT[name])fail('RELEASE_B_ASSET_BYTES',name);
  if(name.startsWith('assets/fonts/')&&!own(B_ASSET_CONTRACT,name))fail('RELEASE_FONT_PATH',name);
  for(const license of record.licenseFiles){
   if(!bLicenses.includes(license)&&!/^licenses\/[a-zA-Z0-9_.-]+\.(txt|json)$/.test(license))fail('RELEASE_LICENSE_PATH',String(license));
   if(!files.has(license)){files.set(license,{path:license,sha256:sha256(readFileSync(safeFile(publicRoot,license)))});validate(license);}
  }
 };
 for(const a of base)validate(a.path);
 return [...files.values()].sort((a,b)=>a.path.localeCompare(b.path));
}
export function assertPublicOutput(output,documents,publicRoot,policy){
 const assets=licensedAssetClosure(documents,publicRoot,policy),expected=new Set([...documents.keys(),'robots.txt','sitemap.xml',...assets.map(a=>a.path)]),actual=[];
 const walk=dir=>{for(const name of readdirSync(dir)){const f=path.join(dir,name),s=lstatSync(f);if(s.isSymbolicLink())fail('RELEASE_OUTPUT_SYMLINK',f);if(s.isDirectory())walk(f);else if(s.isFile())actual.push(path.relative(output,f).replaceAll('\\','/'));else fail('RELEASE_OUTPUT_TYPE',f);}};
 walk(output);
 if(actual.length!==expected.size||actual.some(f=>!expected.has(f))||[...expected].some(f=>!actual.includes(f)))fail('RELEASE_OUTPUT_COVERAGE',JSON.stringify({extra:actual.filter(f=>!expected.has(f)),missing:[...expected].filter(f=>!actual.includes(f))}));
 for(const a of assets)if(sha256(readFileSync(safeFile(output,a.path)))!==a.sha256)fail('RELEASE_OUTPUT_ASSET_BYTES',a.path);
 return {files:actual.length,assets:assets.length};
}
