import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const loadJSON = name => JSON.parse(readFileSync(path.join(ROOT,name),'utf8'));
export const registry = loadJSON('src/data/registry.json');
export const routeIndex = new Map(registry.map(p=>[p.route,p]));
export const descriptions = {...loadJSON('src/data/link-descriptions.json'),...loadJSON('src/data/link-descriptions-additions.json')};
export const e = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function icon(name, className='') {
  return `<svg class="exb-icon ${e(className)}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="#exb-i-${e(name)}"></use></svg>`;
}
export function anchor(route,label,cls='exb-inline-link',description='') {
  const desc=description||descriptions[route]||'';
  return `<a href="${e(route)}" data-route="${e(route)}" class="${e(cls)}"${desc?` data-link-description="${e(desc)}"`:''}>${label}</a>`;
}
export function action(route,label,cls='exb-btn') { return anchor(route,`<span>${e(label)}</span>${icon('arrow')}`,cls); }
export function enquiry(lang,intent='') {
  const root=lang==='de'?'/de/anfrage/':'/en/enquiry/';
  return root+(intent?'?anliegen='+encodeURIComponent(intent)+(lang==='de'?'#kurzanfrage':'#short-enquiry'):'');
}
export function translateRoute(route, lang) {
  const item=routeIndex.get(route);
  if (!item) throw new Error('Unknown route: '+route);
  return item.lang===lang?route:item.translation;
}
export function toFileHref(target,from) {
  if (target.startsWith('#')||/^(?:https?:|mailto:)/.test(target)) return target;
  const m=target.match(/^([^?#]*)(.*)$/);const base=m[1];const extra=m[2];
  if (!base.startsWith('/')) return target;
  const file=base.endsWith('/')?base+'index.html':base;
  const result=path.posix.relative(path.posix.dirname(from+'index.html'),file);
  return (result||'index.html')+extra;
}
/** One compiler pass. Pending routes stay as labelled text, not fake pages or dead anchors. */
export function resolveHTML(html,from,built,{mode='preview'}={}) {
  if(!['preview','production'].includes(mode))throw new Error('Unknown link output mode: '+mode);
  const outputHref=target=>mode==='production'?target:toFileHref(target,from);
  html=html.replace(/\saria-describedby="exb6-desc-[^"]*"/g,'');
  html=html.replace(/\sdata-(?:copy-line|link-plan)="[^"]*"/g,'');
  html=html.replace(/data-wp-route=/g,'data-route=');
  html=html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g,(all,attrs,body)=>{
    const found=attrs.match(/\bhref="([^"]*)"/); if(!found)return all;
    const target=found[1].replaceAll('&amp;','&');
    if (/^(javascript|data|vbscript):/i.test(target))throw new Error('Unsafe link');
    if (!target.startsWith('/')) return all;
    const base=target.split(/[?#]/)[0];
    if (base!=='/'&&!routeIndex.has(base))throw new Error(`Unknown internal target: ${base} on ${from}`);
    let updated=attrs.replace(/\sdata-route="[^"]*"/g,'');
    // Keep existing copy; use the target's approved draft description only where no help text exists.
    if (descriptions[base]&&!/data-link-description=|exb6-flag|exb-logo/.test(updated)) updated+=` data-link-description="${e(descriptions[base])}"`;
    if (base!=='/'&&!built.has(base)) {
      let a=updated.replace(/\s?href="[^"]*"/,'').replace(/\saria-current="[^"]*"/,'');
      a=a.replace(/class="([^"]*)"/,(m,c)=>`class="${c} exb-pending"`);
      if(!/class=/.test(a))a+=' class="exb-pending"';
      return `<span${a} data-route="${e(target)}" aria-disabled="true">${body}</span>`;
    }
    return `<a${updated.replace(/href="[^"]*"/,`href="${e(outputHref(target))}"`)} data-route="${e(target)}">${body}</a>`;
  });
  html=html.replace(/\b(src|href)="((?:\/)?(?:assets|logo|css|js)\/[^\"]+)"/g,(_,attr,target)=>`${attr}="${e(outputHref('/'+target.replace(/^\//,'').replaceAll('&amp;','&')))}"`);
  return html.replaceAll('viewbox=','viewBox=');
}
export function assertRoute(route) {
  if (!/^\/(de|en)\/(?:[a-z0-9-]+\/)*$/.test(route))throw new Error('Invalid route: '+route);
}
