import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/lib/site.mjs';
import { readContent } from '../scripts/build.mjs';
import { renderPage } from '../src/templates/page.mjs';

const pages = await readContent();
const baselineHomes = {
  '/de/': 'c3c8820d93af286258b6d8fb594040f977425d5067269216b0aca4dc34995f7c',
  '/en/': '57ef7801d9678a5cc3e18db1a5e059898b5cb6054110c41534a6e61720ef867a'
};
const cssPaths = ['fonts', 'tokens', 'components', 'motion', 'integration'].map(name => `/css/exobasis-b-${name}.css`);
const render = page => renderPage(page, { mode: 'preview' }, pages);

test('B is bound centrally to every non-home page, with its real style order', () => {
  for (const page of pages.filter(p => p.kind !== 'home')) {
    const html = render(page);
    assert.match(html, /<body\b[^>]*\bclass="[^"]*\bexb-brand\b[^>]*\bdata-exb-system="B"/, page.route);
    let previous = html.indexOf('/css/site.css');
    for (const css of cssPaths) {
      const at = html.indexOf(css);
      assert.ok(at > previous, `${page.route}: ${css}`);
      assert.equal(html.split(css).length - 1, 1);
      previous = at;
    }
    assert.match(html, /\/logo\/exobasis-b-horizontal-hell\.svg/);
    assert.match(html, /<source media="\(max-width: 429\.98px\)" srcset="\/logo\/exobasis-b-wortmarke-hell\.svg"\/>/);
  }
});

test('The two protected home renderings remain byte-identical before their personal finish', () => {
  for (const page of pages.filter(p => p.kind === 'home')) {
    const html = render(page);
    assert.equal(createHash('sha256').update(html).digest('hex'), baselineHomes[page.route]);
    assert.doesNotMatch(html, /data-exb-system|exobasis-b-/);
  }
});

test('Only the four supplied and checksum-bound webfonts pass the font guard', async () => {
  const { approvedFontIssue, brandAssets } = await import('../src/lib/brand.mjs');
  assert.equal(brandAssets.fonts.length, 4);
  for (const font of brandAssets.fonts) {
    const bytes = await readFile(path.join(ROOT, 'public', font.path));
    assert.equal(approvedFontIssue(font.path, bytes), null);
    assert.match(approvedFontIssue(font.path, Buffer.from('different font')), /checksum/i);
    assert.ok((await readFile(path.join(ROOT, 'public', font.license))).length > 1000);
  }
  assert.match(approvedFontIssue('assets/fonts/unapproved.woff2', Buffer.from('x')), /unapproved/i);
  assert.match(approvedFontIssue('../private.woff2', Buffer.from('x')), /unapproved/i);
});

test('Brand styles are surface-scoped and keep a reduced-motion state', async () => {
  const css = await readFile(path.join(ROOT, 'public/css/exobasis-b-integration.css'), 'utf8');
  assert.match(css, /\.exb-brand\[data-exb-system="B"\]:not\(\.exb-page-home\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /^\s*(?:html|body|:root)\s*[{,]/m);
});

test('Legacy logo scoping does not raise specificity on the protected homepages', async () => {
  const css = await readFile(path.join(ROOT, 'public/css/v6.css'), 'utf8');
  assert.equal((css.match(/:where\(a\)\.exb-brand/g) || []).length, 10);
  assert.ok(!css.includes('a.exb-brand'));
});
