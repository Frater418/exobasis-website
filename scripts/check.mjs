import { createHash } from 'node:crypto';
import { prepareRelease } from '../src/lib/release-readiness.mjs';
import { readFile,readdir,writeFile,stat } from 'node:fs/promises';
import path from 'node:path';
import { ROOT,registry,routeIndex,loadJSON,parseSrcset } from '../src/lib/site.mjs';
import { readContent,countWords } from './build.mjs';
import { approvedFontIssue, brandAssets, usesBrandSystem } from '../src/lib/brand.mjs';
import { renderedPageIssues } from './render-contract.mjs';
import { canonicalURL, isIndexable, sitemapXML, productionOrigin } from '../src/lib/seo.mjs';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { assertScopedDocuments,readAssetPolicy,assertPublicOutput } from '../src/lib/release-scope.mjs';
export async function check(options={mode:'preview'},contentReader=readContent){
 const mode=options.mode;
 if(!['preview','production'].includes(mode))throw new Error('Unbekannter Check-Modus: '+mode);
 const allPages=await contentReader();
 const config=mode==='production'?{...loadJSON('src/data/publication.json'),mode}:null;
 const release=prepareRelease(config||{mode},allPages,registry,{root:ROOT}),pages=release.pages,byRoute=new Map(pages.map(p=>[p.route,p]));
 const output=path.join(ROOT,mode==='preview'?'dist':'dist-release');
 const errors=[],warnings=[];
 const manifests=mode==='preview'?loadJSON('editorial/checks/render-manifest.json'):pages.map(p=>({route:p.route,lang:p.lang,file:p.route.slice(1)+'index.html'}));
 if(manifests.length!==pages.length||new Set(manifests.map(m=>m.route)).size!==pages.length)errors.push('Manifest/source coverage mismatch');
 const counts={routes:registry.length,languages:{de:registry.filter(x=>x.lang==='de').length,en:registry.filter(x=>x.lang==='en').length},paired:registry.filter(x=>x.translation).length/2,unpaired:registry.filter(x=>!x.translation).length,sourceLinks:loadJSON('src/data/link-plan.json').length,built:manifests.length,assets:0,localLinks:0,fragments:0,plannedLinkOccurrences:0,pendingInternalTargets:0};
 if(counts.routes!==150||counts.languages.de!==76||counts.languages.en!==74||counts.paired!==72||counts.unpaired!==6||counts.sourceLinks!==1534)errors.push('Source architecture counts changed');
 for(const p of registry){if(p.translation&&routeIndex.get(p.translation)?.translation!==p.route)errors.push('Non-reciprocal translation '+p.route);if(p.parent&&!routeIndex.has(p.parent))errors.push('Unknown parent '+p.route);}
 const cache=new Map();
 const get=async f=>{if(!cache.has(f))cache.set(f,await readFile(f,'utf8'));return cache.get(f);};
 for(const m of manifests){
  const source=byRoute.get(m.route);
  if(!source){errors.push('Unknown built route '+m.route);continue;}
  const file=path.join(output,m.file),html=await get(file);
  errors.push(...renderedPageIssues(html,source,mode==='preview'?m:undefined));
  if(!html.includes(`lang="${m.lang}"`))errors.push('Wrong language '+m.route);
  const robot=mode==='production'&&isIndexable(source)?'index,follow':'noindex,nofollow';
  if(mode==='preview'?!html.includes('content="noindex,nofollow"'):!html.includes(`content="${robot}"`))errors.push('Robots directive mismatch '+m.route);
  if(mode==='preview' && /<link\b[^>]*\brel="(?:canonical|alternate)"/.test(html))errors.push('Vorschau enthält Produktions-SEO '+m.route);
  if(mode==='production'){
   const canonical=[...html.matchAll(/<link rel="canonical" href="([^"]+)"\s*\/?\s*>/g)];
   if(isIndexable(source)?canonical.length!==1||canonical[0][1]!==canonicalURL(source,config):canonical.length!==0)errors.push('Canonical mismatch '+m.route);
   const other=pages.find(p=>p.route===source.translation);
   const expected= isIndexable(source) && other?.translation===source.route && other.lang!==source.lang && isIndexable(other)
     ? [source,other].map(p=>`${p.lang}|${canonicalURL(p,config)}`).sort():[];
   const actual=[...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\s*\/?\s*>/g)].map(x=>`${x[1]}|${x[2]}`).sort();
   if(JSON.stringify(actual)!==JSON.stringify(expected))errors.push('Hreflang mismatch '+m.route);
   if(/exb-legal-warning|exb-review-requirements|exb-local-notice|data-send-enabled="false"/.test(html))errors.push('Entwurfs- oder deaktivierte Formularausgabe '+m.route);
  }
  if(/<form[^>]*action="https?:|<iframe\b|data:font|font\/woff|@font-face|contact-form-7|wp:flatsome|localhost:8443/i.test(html))errors.push('Forbidden legacy payload '+m.route);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  if(ids.length!==new Set(ids).size)errors.push('Duplicate IDs '+m.route);
  for(const match of html.matchAll(/\b(?:aria-labelledby|aria-describedby|aria-controls)="([^"]+)"/g))for(const id of match[1].split(/\s+/)){if(!ids.includes(id))errors.push(`Missing ARIA target ${id} on ${m.route}`);}
  if((html.match(/<h1\b/g)||[]).length!==1)errors.push('H1 count '+m.route);
  if((html.match(/<title>/g)||[]).length!==1)errors.push('Title count '+m.route);
  for(const match of html.matchAll(/\b(src|href|srcset)="([^"]+)"/g)){
   for(let value of match[1]==='srcset'?parseSrcset(match[2]).map(x=>x.url):[match[2]]){
   value=value.replaceAll('&amp;','&');
   if(/^(?:https?:|mailto:|data:)/.test(value))continue;
   if(mode==='production' && /(?:^|\/)index\.html(?:[?#]|$)/.test(value))errors.push('Nicht konsolidierter index.html-Link '+value+' auf '+m.route);
   const u=new URL(value,mode==='production'?new URL(m.route,productionOrigin(config)):pathToFileURL(file));
   if(mode==='production' && u.pathname.startsWith('/api/')){if(!['/api/enquiry','/api/enquiry/confirmation'].includes(u.pathname))errors.push('Unknown public API '+value);continue;}
   const target=mode==='production'?path.join(output,u.pathname.slice(1),u.pathname.endsWith('/')?'index.html':''):fileURLToPath(u);
   if(!target.startsWith(output+path.sep)){errors.push('Escaping relative path '+value+' on '+m.route);continue;}
   try{if(!(await stat(target)).isFile())errors.push('Not a file '+value+' on '+m.route);}catch{errors.push('Missing '+value+' on '+m.route);continue;}
   if(u.hash){counts.fragments++;if(path.extname(target)==='.html'){const targetHTML=await get(target);if(!targetHTML.includes(`id="${decodeURIComponent(u.hash.slice(1))}"`))errors.push('Missing fragment '+value+' on '+m.route);}}
   else if(path.extname(target)==='.html')counts.localLinks++;else counts.assets++;
   }
  }
  counts.plannedLinkOccurrences+=(html.match(/aria-disabled="true"/g)||[]).length;
  counts.pendingInternalTargets+=[...html.matchAll(/<(?:a|span)\b[^>]*>/g)].filter(m=>m[0].includes('data-route=')&&m[0].includes('aria-disabled="true"')).length;
  if(countWords(html.match(/<main\b[\s\S]*?<\/main>/)?.[0]||'')<80)warnings.push('Very short page '+m.route);
 }
 async function walk(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const f=path.join(dir,ent.name);if(ent.isDirectory())await walk(f);else if(/\.(?:woff2?|ttf|otf|eot)$/i.test(ent.name)){const issue=approvedFontIssue(path.relative(output,f).split(path.sep).join('/'),await readFile(f));if(issue)errors.push(issue);}}}
 if(mode==='preview')await walk(output);
 if(mode==='production'){
  const documents=new Map([['index.html',await get(path.join(output,'index.html'))]]);
  for(const m of manifests)documents.set(m.file,await get(path.join(output,m.file)));
  assertScopedDocuments(documents,release,{origin:productionOrigin(config)});
  assertPublicOutput(output,documents,path.join(ROOT,'public'),readAssetPolicy(ROOT,release));
 }
 if(pages.some(usesBrandSystem))for(const item of [...brandAssets.fonts,...brandAssets.licenses]){try{const raw=await readFile(path.join(output,item.path));if(createHash('sha256').update(raw).digest('hex')!==item.sha256)errors.push('Approved B asset checksum mismatch: '+item.path);}catch{errors.push('Approved B asset missing: '+item.path);}}
 const robots=await get(path.join(output,'robots.txt'));
 if(mode==='preview'?!/Disallow: \/\s*$/.test(robots):robots!==`User-agent: *\nAllow: /\nSitemap: ${productionOrigin(config)}/sitemap.xml\n`)errors.push('Robots.txt mismatch');
 if(mode==='production' && await get(path.join(output,'sitemap.xml'))!==sitemapXML(pages,config))errors.push('Sitemap mismatch');
 const report={checkedAt:new Date().toISOString(),mode,status:errors.length?'failed':'passed',counts,errors,warnings};if(mode==='preview')await writeFile(path.join(ROOT,'editorial/checks/static-check.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));if(errors.length)throw new Error(`${errors.length} static checks failed.`);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.join(ROOT,'scripts/check.mjs')){
 const args=process.argv.slice(2);
 if(args.length && !(args.length===2 && args[0]==='--mode' && args[1]==='production'))throw new Error('Nur --mode production ist als Check-Option erlaubt.');
 await check({mode:args.length?'production':'preview'});
}
