import { createHash } from 'node:crypto';

const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const digest = value => createHash('sha256').update(value).digest('hex');
const entities = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:'\u00a0'};
function decode(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, code) => {
    if (!code.startsWith('#')) return entities[code.toLowerCase()];
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : whole;
  });
}
export function htmlText(value) {
  return normalize(decode(value.replace(/<!--[\s\S]*?-->/g, '').replace(/<br\b[^>]*>/gi, ' ').replace(/<[^>]*>/g, '')));
}
export function headingTexts(html) {
  return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(match => htmlText(match[1]));
}
export function sourceMetadataIssues(pages) {
  const issues = [];
  for (const field of ['seoTitle', 'description']) {
    const seen = new Map();
    for (const page of pages) {
      const value = page[field];
      if (typeof value !== 'string' || !value.trim()) {
        issues.push(`Empty ${field}: ${page.route}`);
        continue;
      }
      const key = normalize(value);
      if (seen.has(key)) issues.push(`Duplicate ${field}: ${page.route} / ${seen.get(key)}`);
      else seen.set(key, page.route);
    }
  }
  return issues;
}
/** Compare actual generated HTML with its current authoring source, not just element counts. */
export function renderedPageIssues(html, page, manifest) {
  const issues = [];
  const headings = headingTexts(html);
  const expectedH1 = page.kind === 'home' ? page.htmlH1 : page.displayTitle || page.title;
  if (headings.length !== 1) issues.push(`H1 count: ${page.route}`);
  if (typeof expectedH1 !== 'string' || !expectedH1.trim()) issues.push(`Missing H1 source: ${page.route}`);
  else if (headings[0] !== normalize(expectedH1)) issues.push(`H1 text mismatch: ${page.route}`);

  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
  const titles = [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map(match => normalize(decode(match[1])));
  if (titles.length !== 1) issues.push(`Title count: ${page.route}`);
  if (titles[0] !== normalize(page.seoTitle)) issues.push(`SEO title mismatch: ${page.route}`);
  const descriptions = [];
  for (const match of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = Object.fromEntries([...match[0].matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m => [m[1].toLowerCase(), decode(m[2] ?? m[3])]));
    if (attrs.name?.toLowerCase() === 'description') descriptions.push(normalize(attrs.content));
  }
  if (descriptions.length !== 1) issues.push(`Description count: ${page.route}`);
  if (descriptions[0] !== normalize(page.description)) issues.push(`Description mismatch: ${page.route}`);

  if (manifest) {
    if (manifest.contentHash !== page.contentHash) issues.push(`Stale content source: ${page.route}`);
    if (page.kind === 'home' && manifest.htmlSourceHash !== page.htmlSourceHash) issues.push(`Stale homepage HTML source: ${page.route}`);
    if (manifest.htmlHash !== digest(html)) issues.push(`Changed built HTML: ${page.route}`);
  }
  return issues;
}
export function assertRenderedPage(html, page) {
  const issues = renderedPageIssues(html, page);
  if (issues.length) throw new Error(issues.join('\n'));
}
