import {e,loadJSON,registry} from './site.mjs';

export const pageDesign=loadJSON('src/data/page-design.json');
if(pageDesign.schemaVersion!==1 || Object.keys(pageDesign.pages).length!==registry.length ||
 registry.some(page=>!pageDesign.pages[page.route]))throw new Error('Incomplete per-page design assignment.');
for(const entry of Object.values(pageDesign.pages)){
 if(!/^[a-z0-9-]+$/.test(entry.family))throw new Error('Invalid page layout family.');
 if(entry.hero && !entry.hero.startsWith('existing-') && !pageDesign.assets[entry.hero])throw new Error('Unknown assigned hero.');
}
for(const asset of Object.values(pageDesign.assets)){
 if(!/^assets\/hero-[a-z0-9-]+\.webp$/.test(asset.src) || !asset.alt.de || !asset.alt.en ||
 !Number.isInteger(asset.width) || !Number.isInteger(asset.height) || !Array.isArray(asset.srcset) ||
 asset.srcset.some(x=>!/^assets\/hero-[a-z0-9-]+\.webp$/.test(x.src)||!Number.isInteger(x.width)))throw new Error('Invalid page hero asset.');
}
export function layoutFamily(page){
 const design=pageDesign.pages[page.route];
 if(!design)throw new Error('Missing per-page design: '+page.route);
 return design.family;
}
export function designHero(page){
 const design=pageDesign.pages[page.route];
 if(!design)throw new Error('Missing per-page hero assignment: '+page.route);
 if(page.kind==='home' || !design.hero || design.hero.startsWith('existing-'))return '';
 const asset=pageDesign.assets[design.hero];
 return `<figure class="exb-page-hero-media" data-hero-motif="${e(design.hero)}"><img src="/${e(asset.src)}" srcset="${asset.srcset.map(x=>`/${e(x.src)} ${x.width}w`).join(', ')}" sizes="(max-width: 899px) calc(100vw - 40px), (max-width: 1279px) 43vw, 560px" width="${asset.width}" height="${asset.height}" alt="${e(asset.alt[page.lang])}" decoding="async" fetchpriority="high"/></figure>`;
}
