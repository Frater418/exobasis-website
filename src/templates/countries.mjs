import { loadJSON } from '../lib/site.mjs';
import {designHero} from '../lib/page-design.mjs';
const photographs=loadJSON('src/data/country-photos.json').photos;
const photoByRoute=new Map(photographs.flatMap(photo=>[[photo.deRoute,photo],[photo.enRoute,photo]]));
if(photoByRoute.size!==photographs.length*2)throw new Error('Doppelte Sprachzuordnung bei Ortsfotografien.');

/** Real local place photograph with linked attribution; orientation maps remain accessible. */
export function countryHero(page,{e,anchor,icon}) {
 const de=page.lang==='de', c=page.country;
 const media=photoByRoute.get(page.route);
 if(!media||!media.alt[page.lang]||!media.caption[page.lang])throw new Error('Ortsfotografie fehlt: '+page.route);
 const mediaCredit=` <a href="${e(media.sourceUrl)}" rel="noreferrer">${de?'Originalfoto':'Original photograph'}</a> · <a href="${e(media.licenseUrl)}" rel="license noreferrer">${de?'Lizenz':'Licence'}</a> · ${de?'Ausschnitt angepasst, WebP.':'Cropped, WebP.'}`;
 const map=`<details class="exb-country-map"><summary>${de?'Land auf der Karte einordnen':'Locate the country on a map'}</summary><img src="/assets/${e(c.map)}" alt="${e(c.imageAlt)}" width="960" height="720" loading="lazy" decoding="async"/><p>${e(c.caption)} <a href="https://www.naturalearthdata.com/" rel="noreferrer">Natural Earth</a></p></details>`;
 const jumps=`<div class="exb-country-jumps">${anchor('#'+(de?'rechte-programme':'rights-routes'),(de?'Rechte und Vorbereitung prüfen':'Explore rights and preparation')+icon('arrow'),'exb-text-link')}${anchor('#'+page.sections.at(-1).id,de?'Welche Arbeit wir übernehmen':'How we can help','exb-text-link')}</div>`;
 const title=page.displayTitle||page.title;
 const namePrefix=title.startsWith(`${c.name}:`)?`${c.name}:`:c.name;
 const heading=title.startsWith(c.name)?`<span class="exb-country-name">${e(namePrefix)}</span><span class="exb-country-title-rest">${e(title.slice(namePrefix.length))}</span>`:e(title);
 return `<section class="exb-country-hero"><div class="exb-wrap"><div class="exb-country-hero-grid"><div class="exb-country-hero-copy"><p class="exb-eyebrow">${e(page.eyebrow)} · ${e(c.region)}</p><h1>${heading}</h1><div class="exb-page-lead">${page.intro}</div>${jumps}</div><div><figure class="exb-country-figure"><div class="exb-country-visual"><img src="/${e(media.path)}" alt="${e(media.alt[page.lang])}" width="${e(media.width)}" height="${e(media.height)}" decoding="async" fetchpriority="high"/></div><figcaption>${e(media.caption[page.lang])}${mediaCredit}</figcaption></figure>${map}</div></div><dl class="exb-country-summary">${c.summary.map(([title,body],i)=>`<div><span class="exb-country-summary-number" aria-hidden="true">0${i+1}</span><dt>${e(title)}</dt><dd>${e(body)}</dd></div>`).join('')}</dl></div></section>`;
}
export function countryHubHero(page,{e,anchor,icon}) {
 const de=page.lang==='de';
 return `<section class="exb-country-hub-hero" id="${e(page.openingId)}"><div class="exb-wrap"><div class="exb-country-hub-grid exb-hero-frame"><div><p class="exb-eyebrow">${e(page.eyebrow)}</p><h1>${e(page.displayTitle||page.title)}</h1><div class="exb-page-lead">${page.intro}</div><div class="exb-country-jumps">${anchor('#'+(de?'lebensmodell':'life-model'),(de?'Länder nach deinem Bedarf vergleichen':'Compare countries for your needs')+icon('arrow'),'exb-text-link')}${anchor('#'+(de?'laenderprofile':'country-profiles'),de?'Zu den Länderprofilen':'Explore the country profiles','exb-text-link')}</div></div>${designHero(page)}</div><aside class="exb-country-hub-statement"><p class="exb-eyebrow">${de?'Dein Standort muss funktionieren':'Your location needs to work'}</p><p>${de?'<span>Erreichbar.</span><span>Rechtlich nutzbar.</span><span>Für deine Familie vorbereitet.</span>':'<span>Reachable.</span><span>Lawfully usable.</span><span>Prepared for your family.</span>'}</p><span>${de?'Nicht die beste Platzierung auf einer Liste. Sondern die passende Antwort auf deine Situation.':'Not the highest position on a list. The right answer to your circumstances.'}</span></aside></div></section>`;
}
/** Preserve the inherited reading layout; extend only the country hub's local outline. */
export function countryContent(page,html,{e}) {
 if(page.kind!=='country-hub')return html;
 const de=page.lang==='de';
 const addChildren=(id,items)=>{
  const needle=`<li><a href="#${id}">${e(page.sections.find(s=>s.id===id).title)}</a></li>`;
  const children=`<ol class="exb-country-subnav">${items.map(x=>`<li><a href="#${e(x.id)}">${e(x.title)}</a></li>`).join('')}</ol>`;
  return [needle,needle.replace('</li>',children+'</li>')];
 };
 for(const [from,to] of [addChildren(de?'laenderprofile':'country-profiles',page.regionalGroups),addChildren(de?'szenario-und-kriterien':'scenarios-and-criteria',page.matrixFragments.map((id,i)=>({id,title:de?['Welche Anforderungen muss dein Standort erfüllen?','Was ändert sich, wenn die Lage kippt?'][i]:['What must your location provide?','What changes when conditions deteriorate?'][i]})))])html=html.replace(from,to);
 // The H1 opening is section 01; editorial sections begin at 02.
 let number=1;html=html.replace(/class="exb-section-number">\d+<\/span>/g,()=>`class="exb-section-number">${String(++number).padStart(2,'0')}</span>`);
 return html;
}
