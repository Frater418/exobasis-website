import { e } from './site.mjs';

const excluded = new Set(['confirmation', 'error']);
export const isIndexable = page => !excluded.has(page.kind);

export function productionOrigin(config) {
  const value = config?.domain;
  if (typeof value !== 'string' || !value.trim()) throw new Error('Produktionsdomain fehlt (publication.json: domain).');
  let url;
  try { url = new URL(value); } catch { throw new Error('Produktionsdomain ist keine absolute HTTPS-URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash ||
      !url.hostname.includes('.') || /(?:^|\.)(?:test|invalid|localhost)$/.test(url.hostname) || /^\d+(?:\.\d+){3}$/.test(url.hostname)) {
    throw new Error('Produktionsdomain muss eine echte HTTPS-Origin ohne Pfad, Zugangsdaten oder Testhost sein.');
  }
  return url.origin;
}

export function canonicalURL(page, config) {
  if (!/^\/(?:de|en)\/(?:[a-z0-9-]+\/)*$/.test(page.route)) throw new Error('Ungültige SEO-Route: '+page.route);
  return productionOrigin(config) + page.route;
}

export function breadcrumbLabel(page) {
  return page.kind === 'home' || page.model === 'startseite' ? (page.lang === 'de' ? 'Startseite' : 'Home') : page.displayTitle || page.title;
}

export function renderSeoHead(page, config = {mode:'preview'}, pages = []) {
  if (config.mode !== 'preview' && config.mode !== 'production') throw new Error('Unbekannter Ausgabemodus: '+config.mode);
  if (config.mode === 'preview') return '<meta name="robots" content="noindex,nofollow"/>';
  const noindex = !isIndexable(page);
  let head = `<meta name="robots" content="${noindex?'noindex,nofollow':'index,follow'}"/>`;
  if (noindex) return head;
  const byRoute = new Map(pages.map(p => [p.route, p]));
  if (byRoute.size !== pages.length) throw new Error('Doppelte SEO-Route.');
  head += `<link rel="canonical" href="${e(canonicalURL(page, config))}"/>`;
  const other = page.translation && byRoute.get(page.translation);
  if (other && other.translation === page.route && other.lang !== page.lang && isIndexable(other)) {
    for (const target of [page, other]) head += `<link rel="alternate" hreflang="${e(target.lang)}" href="${e(canonicalURL(target, config))}"/>`;
  }
  // The breadcrumb is derived only from the actual page hierarchy and titles.
  const crumbs = [], seen = new Set(), all = byRoute;
  let node = page;
  while (node) {
    if (seen.has(node.route)) throw new Error('Zyklische Breadcrumb-Hierarchie: '+page.route);
    seen.add(node.route);
    crumbs.unshift(node);
    node = node.parent ? all.get(node.parent) : null;
  }
  if (crumbs.length > 1) {
    const data = {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:crumbs.map((p,i)=>({'@type':'ListItem',position:i+1,name:breadcrumbLabel(p),item:canonicalURL(p,config)}))};
    head += `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<','\\u003c')}</script>`;
  }
  return head;
}

export function sitemapXML(pages, config) {
  const sorted = pages.filter(isIndexable).toSorted((a,b)=>a.route.localeCompare(b.route));
  const routes = new Set(sorted.map(p=>p.route));
  if (routes.size !== sorted.length) throw new Error('Doppelte Sitemap-Route.');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    sorted.map(p=>{
      let links='';
      const other = p.translation && sorted.find(x=>x.route===p.translation);
      if (other && other.translation===p.route && other.lang!==p.lang) for (const target of [p,other]) links += `<xhtml:link rel="alternate" hreflang="${e(target.lang)}" href="${e(canonicalURL(target,config))}"/>`;
      return `<url><loc>${e(canonicalURL(p,config))}</loc>${links}</url>`;
    }).join('\n') + '\n</urlset>\n';
}

export function assertProductionReady(config, pages) {
  const origin = productionOrigin(config);
  const errors = [];
  if (new URL(origin).hostname.endsWith('.example')) errors.push('Testdomain .example ist keine echte Produktionsdomain.');
  if (config.mode !== 'production') errors.push('Produktionsmodus fehlt.');
  const facts = config.operatorFacts || {};
  for (const key of ['legalName','legalForm','representative','postalAddress','publicEmail','privacyContact']) {
    const value = facts[key];
    if (typeof value !== 'string' || !value.trim() || /(?:TODO|TBD|Platzhalter|example\.|@example\.|MUSTER)/i.test(value)) errors.push('Betreiberpflichtangabe fehlt: '+key);
  }
  if (facts.publicEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(facts.publicEmail)) errors.push('Ungültige öffentliche E-Mail-Adresse.');
  if (config.approvals?.publication !== true) errors.push('Tatsächliche Veröffentlichungsfreigabe fehlt.');
  if (config.approvals?.legal !== true) errors.push('Tatsächliche Rechtsfreigabe fehlt.');
  if (config.approvals?.content !== true) errors.push('Tatsächliche Inhaltsfreigabe fehlt.');
  if (!Array.isArray(pages) || !pages.length) errors.push('Keine Seiten für die Produktionsausgabe.');
  const routes = new Set(pages.map(p=>p.route));
  if (routes.size !== pages.length) errors.push('Doppelte Seitenroute.');
  for (const p of pages) {
    if (p.reviewStatus !== 'approved') errors.push('Seite nicht tatsächlich freigegeben: '+p.route);
    if (p.kind === 'legal') {
      if (p.releaseBlockers?.length) errors.push('Offene Rechts-/Betreiberanforderungen '+p.route+': '+p.releaseBlockers.join('; '));
      if (p.sections?.some(s=>s.reviewRequirements?.length)) errors.push('Offene Rechtsprüfungen in Abschnitten: '+p.route);
    }
    if (p.translation && !routes.has(p.translation)) errors.push('Fehlender Sprachpartner: '+p.route);
  }
  if (errors.length) throw new Error('Produktionsausgabe gesperrt:\n- '+errors.join('\n- '));
}
