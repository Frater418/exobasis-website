import { e,loadJSON,routeIndex } from './site.mjs';

const knowledgeModels=new Set(['themenhub','fachbeitrag','herkunft']);
export function publicContexts(lang){
 if(!['de','en'].includes(lang))throw new Error('Unsupported context language: '+lang);
 const contexts={};
 for(const page of routeIndex.values()){
  if(page.lang!==lang||!knowledgeModels.has(page.model))continue;
  const label=page.model==='herkunft'?(lang==='de'?'Herkunftsbezug: ':'Departure context: '):(lang==='de'?'Themenbezug: ':'Topic: ');
  contexts[page.route]=label+page.title;
 }
 const countries=loadJSON('src/data/country-contexts.json');
 for(const [route,message] of Object.entries(countries)){
  const page=routeIndex.get(route);
  if(!page||page.model!=='laenderprofil'||typeof message!=='string'||!message.trim()||message.length>300)throw new Error('Invalid country context: '+route);
  if(page.lang===lang)contexts[route]=message;
 }
 for(const page of routeIndex.values())if(page.lang===lang&&page.model==='laenderprofil'&&!Object.hasOwn(contexts,page.route))throw new Error('Missing country context: '+page.route);
 for(const [route,message] of Object.entries(contexts))if(message.length>300)throw new Error('Public context exceeds field limit: '+route);
 return contexts;
}

/** Bind only main-content enquiry links. Navigation stays general and never carries private input. */
export function contextualEnquiryLinks(html,page){
 if(!knowledgeModels.has(page.model)&&page.model!=='laenderprofil')return html;
 const target=page.lang==='de'?'/de/anfrage/':'/en/enquiry/';
 const fragment=page.lang==='de'?'kurzanfrage':'short-enquiry';
 return html.replace(/<a\b[^>]*>/g,tag=>{
  const match=tag.match(/\bhref="([^"]*)"/);
  if(!match)return tag;
  const href=match[1].replaceAll('&amp;','&');
  const parts=href.match(/^([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/);
  if(!parts||parts[1]!==target)return tag;
  const query=new URLSearchParams(parts[2]||'');
  query.set('kontext',page.route);
  return tag.replace(match[0],`href="${e(target+'?'+query.toString()+'#'+(parts[3]||fragment))}"`);
 });
}
