import { createHash } from 'node:crypto';
import { e, loadJSON } from './site.mjs';

export const brandAssets = loadJSON('src/data/brand-assets.json');
if (!Array.isArray(brandAssets.fonts) || brandAssets.fonts.length !== 4 ||
    new Set(brandAssets.fonts.map(font => font.path)).size !== 4 ||
    brandAssets.fonts.some(font => !/^assets\/fonts\/[a-z0-9-]+\.woff2$/.test(font.path) || !/^[a-f0-9]{64}$/.test(font.sha256))) {
  throw new Error('Invalid approved B font manifest.');
}

export const usesBrandSystem = page => Boolean(page?.kind && page.kind !== 'home');

export function brandStyleLinks(page) {
  return usesBrandSystem(page) ? brandAssets.styles.map(file => `<link rel="stylesheet" href="/${e(file)}"/>`).join('') : '';
}

export function brandLogo(page, { responsive = false, mobile = false } = {}) {
  if (!usesBrandSystem(page)) return mobile
    ? '<img src="/logo/exobasis-quer-hell.svg" class="exb-logo" alt="EXOBASIS" width="454" height="96"/>'
    : '<img src="/logo/exobasis-quer-hell.svg" class="exb-logo" width="454" height="96" alt="EXOBASIS" decoding="async"/>';
  const image = `<img src="/${e(brandAssets.logos.horizontal)}" class="exb-logo" width="460" height="104" alt="EXOBASIS" decoding="async"/>`;
  return responsive ? `<picture><source media="(max-width: 429.98px)" srcset="/${e(brandAssets.logos.wordmark)}"/>${image}</picture>` : image;
}

export function brandIconLinks(page) {
  if (!usesBrandSystem(page)) return '<link rel="icon" href="/logo/favicon.ico" sizes="any"/><link rel="icon" href="/logo/favicon.svg" type="image/svg+xml"/><link rel="apple-touch-icon" href="/logo/exobasis-icon-180.png"/>';
  return `<link rel="icon" href="/${e(brandAssets.icons.ico)}" sizes="any"/><link rel="icon" href="/${e(brandAssets.icons.svg)}" type="image/svg+xml"/><link rel="apple-touch-icon" href="/${e(brandAssets.icons.apple)}"/>`;
}

export function approvedFontIssue(relativePath, bytes) {
  const font = brandAssets.fonts.find(item => item.path === relativePath);
  if (!font) return 'Unapproved font asset: ' + relativePath;
  if (createHash('sha256').update(bytes).digest('hex') !== font.sha256) return 'Font checksum mismatch: ' + relativePath;
  return null;
}
