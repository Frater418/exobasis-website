import { readdir,readFile,writeFile,mkdir,cp,rm,rename,stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT,registry,routeIndex,resolveHTML,assertRoute } from '../src/lib/site.mjs';
import { renderPage } from '../src/templates/page.mjs';
import { writeReviewIndex } from './review-index.mjs';
import { assertProductionReady, sitemapXML, productionOrigin, canonicalURL, isIndexable } from '../src/lib/seo.mjs';
import { headingTexts, sourceMetadataIssues, assertRenderedPage } from './render-contract.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
export async function readContent(){
 const pages=[];
 for(const lang of ['de','en'])for(const name of await readdir(path.join(ROOT,'src/content',lang))){
  if(!name.endsWith('.json'))continue;
  const relative=`src/content/${lang}/${name}`,text=await readFile(path.join(ROOT,relative),'utf8'),data=JSON.parse(text);
  assertRoute(data.route);
  const original=routeIndex.get(data.route);
  if(!original||data.lang!==original.lang||data.title!==original.title)throw new Error('Content identity mismatch: '+relative);
  if(data.lang!==lang||!data.description||!data.seoTitle||!data.sourceRefs?.length)throw new Error('Incomplete page metadata: '+relative);
  if(pages.some(p=>p.route===data.route))throw new Error('Duplicate content route: '+data.route);
  const homeHTML=data.kind==='home'?await readFile(path.join(ROOT,'src/content',lang,data.html),'utf8'):null;
  pages.push({...original,...data,sourceFile:relative,contentHash:sha(text),...(homeHTML===null?{}:{htmlSourceHash:sha(homeHTML),htmlH1:headingTexts(homeHTML)[0]})});
 }
 const metadataIssues=sourceMetadataIssues(pages);
 if(metadataIssues.length)throw new Error(metadataIssues.join('\n'));
 return pages.sort((a,b)=>a.route.localeCompare(b.route));
}
function linkDescriptions(html){
 let n=0;const definitions=[];
 html=html.replace(/<a\b([^>]*)>/g,(whole,attrs)=>{
  const m=attrs.match(/\bdata-link-description="([^"]+)"/);
  if(!m||/\baria-describedby=/.test(attrs))return whole;
  const id=`exb-static-desc-${++n}`;definitions.push(`<span id="${id}">${m[1]}</span>`);
  return `<a${attrs} aria-describedby="${id}">`;
 });
 return html.replace('</body>',`<div class="exb-sr-only exb-link-description-store">${definitions.join('')}</div></body>`);
}
export function countWords(html){return html.replace(/<svg\b[\s\S]*?<\/svg>/g,' ').replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)?.length||0;}
export async function build(options={mode:'preview'}){
 const mode=options.mode;
 if(!['preview','production'].includes(mode))throw new Error('Unbekannter Build-Modus: '+mode);
 const pages=await readContent(),built=new Set(pages.map(p=>p.route));
 const scope=JSON.parse(await readFile(path.join(ROOT,'editorial/package-scope.json'),'utf8'));
 const wanted=Array.isArray(scope)?scope:scope.routes;
 if(wanted && (wanted.length!==pages.length||wanted.some(r=>!built.has(typeof r==='string'?r:r.route))))throw new Error('Package scope/content mismatch');
 const config=mode==='production'?{...JSON.parse(await readFile(path.join(ROOT,'src/data/publication.json'),'utf8')),mode}:{mode:'preview'};
 if(mode==='production')assertProductionReady(config,pages);
 const output=path.join(ROOT,mode==='preview'?'dist':'dist-release');
 const staging=path.join(ROOT,mode==='preview'?'.build-stage':'.release-stage');
 await rm(staging,{recursive:true,force:true});await mkdir(staging,{recursive:true});
 await cp(path.join(ROOT,'public'),staging,{recursive:true});
 const manifests=[];
 for(const page of pages){
  const html=linkDescriptions(resolveHTML(renderPage(page,config,pages),page.route,built,{mode}));
  assertRenderedPage(html,page);
  if(mode==='production' && /exb-legal-warning|exb-review-requirements|exb-local-notice|data-send-enabled="false"/.test(html))throw new Error('Entwurfswarnung oder nicht angeschlossener Anfrageweg in Produktionsseite: '+page.route);
  if(mode==='production' && /\bhref="\/(?!\/)[^"]*index\.html(?:[?#]|\")/.test(html))throw new Error('Nicht konsolidierter index.html-Link: '+page.route);
  if(mode==='production'){
   const expectedRobots=isIndexable(page)?'index,follow':'noindex,nofollow';
   if(!html.includes(`<meta name="robots" content="${expectedRobots}"`))throw new Error('SEO-Robotsausgabe fehlt: '+page.route);
   const canonical=`<link rel="canonical" href="${canonicalURL(page,config)}"`;
   if(isIndexable(page)?!html.includes(canonical):html.includes('rel="canonical"'))throw new Error('SEO-Canonical fehlt oder ist unzulässig: '+page.route);
  }
  const h1=(html.match(/<h1\b/g)||[]).length;
  if(h1!==1)throw new Error('Expected exactly one H1: '+page.route);
  if(/(?:wp:flatsome|contact-form-7|{{CF7|localhost:8443|data:font|font\/woff|@font-face|Heartweb)/i.test(html))throw new Error('Legacy/private or font payload leaked: '+page.route);
  const target=path.join(staging,page.route.slice(1),'index.html');await mkdir(path.dirname(target),{recursive:true});await writeFile(target,html);
  const main=html.match(/<main\b[\s\S]*?<\/main>/)?.[0]||'';
  manifests.push({route:page.route,lang:page.lang,title:page.displayTitle||page.title,originalTitle:page.title,model:page.model,kind:page.kind,translation:page.translation,parent:page.parent,file:page.route.slice(1)+'index.html',sourceFile:page.sourceFile,contentHash:page.contentHash,htmlSourceHash:page.htmlSourceHash,htmlHash:sha(html),h1Text:headingTexts(html)[0],words:countWords(main),sections:(main.match(/<section\b/g)||[]).length,renderedH1:h1,reviewStatus:page.reviewStatus,technicalStatus:mode==='preview'?'built_draft':'built_release_candidate',publication:mode==='preview'?'not_authorised':'release_candidate'});
 }
 const root=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>EXOBASIS | Sprache wählen</title><link rel="stylesheet" href="css/v6.css"><link rel="stylesheet" href="css/site.css"></head><body><main class="exb-section"><div class="exb-wrap"><p class="exb-eyebrow">EXOBASIS</p><h1>Eine eigene Basis.<br>Your own base.</h1><div class="exb-page-actions"><a class="exb-btn" href="de/index.html" lang="de">Deutsch</a><a class="exb-btn" href="en/index.html" lang="en">English</a></div></div></main></body></html>`;
 await writeFile(path.join(staging,'index.html'),mode==='preview'?root:root.replaceAll('de/index.html','de/').replaceAll('en/index.html','en/'));
 await writeFile(path.join(staging,'robots.txt'),mode==='preview'?'User-agent: *\nDisallow: /\n':`User-agent: *\nAllow: /\nSitemap: ${productionOrigin(config)}/sitemap.xml\n`);
 if(mode==='production')await writeFile(path.join(staging,'sitemap.xml'),sitemapXML(pages,config));
 // Release candidates never write editorial preview manifests or review indexes.
 const status={package:'gesamt-1.0',base:'EXOBASIS_Startseite_V6',generatedAt:new Date().toISOString(),scopeTotal:registry.length,builtVariants:manifests.length,remainingVariants:registry.length-manifests.length,publication:mode==='preview'?'not_authorised':'release_candidate_not_deployed',contactTransport:'not_connected',runtime:'static_html_css_javascript',generator:'node_esm_no_dependencies',pages:registry.map(r=>{const m=manifests.find(p=>p.route===r.route);return {route:r.route,title:r.title,lang:r.lang,model:r.model,translation:r.translation,parent:r.parent,kind:r.kind,...(m||{technicalStatus:'planned',reviewStatus:'not_authored_in_this_package',publication:'not_authorised'} )};})};
 if(mode==='preview'){
 await writeFile(path.join(ROOT,'editorial/build-status.json'),JSON.stringify(status,null,2)+'\n');
 await writeFile(path.join(ROOT,'editorial/checks/render-manifest.json'),JSON.stringify(manifests,null,2)+'\n');
 }
 // Only directories controlled by this project can be replaced. Inputs/reference remain unchanged.
 const old=path.join(ROOT,mode==='preview'?'.build-previous':'.release-previous');await rm(old,{recursive:true,force:true});
 try{await stat(output);await rename(output,old);}catch(err){if(err.code!=='ENOENT')throw err;}
 try{await rename(staging,output);}catch(err){try{await rename(old,output);}catch{}throw err;}
 await rm(old,{recursive:true,force:true});
 if(mode==='preview')await writeReviewIndex(status);
 console.log(`Built ${pages.length} ${mode==='preview'?'preview variants. No publication.':'release candidate variants. No deployment.'}`);
 return status;
}
if(process.argv[1] && path.resolve(process.argv[1])===path.join(ROOT,'scripts/build.mjs')) {
 const args=process.argv.slice(2);
 if(args.length && !(args.length===2 && args[0]==='--mode' && args[1]==='production'))throw new Error('Nur --mode production ist als Build-Option erlaubt. Ohne Option wird Vorschau gebaut.');
 await build({mode:args.length?'production':'preview'});
}
