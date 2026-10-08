import test from 'node:test';
import assert from 'node:assert/strict';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/lib/site.mjs';
import { readContent } from '../scripts/build.mjs';
import { renderPage } from '../src/templates/page.mjs';

const pages = await readContent();

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

test('The two personally completed homepages explicitly opt into B without changing their structure', () => {
  for (const page of pages.filter(p => p.kind === 'home')) {
    const html = render(page);
    assert.equal(page.brandSystem, 'B');
    assert.match(html, /class="exb-page-home exb-brand" data-exb-system="B"/);
    assert.equal(html.split('/css/exobasis-b-home.css').length - 1, 1);
    assert.ok(html.indexOf('/css/exobasis-b-home.css') > html.indexOf('/css/exobasis-b-integration.css'));
    assert.match(html, /\/logo\/exobasis-b-horizontal-hell\.svg/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.equal((html.match(/<main\b/g) || []).length, 1);
    assert.equal((html.match(/<footer\b/g) || []).length, 1);
    const sections = page.lang === 'de'
      ? ['einstieg', 'eigene-basis', 'dein-einstieg', 'vom-plan-zur-basis', 'warum-exobasis', 'konkrete-ergebnisse', 'naechster-schritt']
      : ['opening', 'your-own-base', 'where-to-start', 'from-plan-to-base', 'why-exobasis', 'concrete-results', 'next-step'];
    for (const id of sections) assert.ok(html.includes(`id="${id}"`), page.route + ' ' + id);
    assert.doesNotMatch(html, /Weitere Wege bei ExoBasis|More ways with ExoBasis/);
  }
});

test('Homepages without the explicit B choice keep the legacy shell; unknown choices fail', async () => {
  const { usesBrandSystem } = await import('../src/lib/brand.mjs');
  for (const page of pages.filter(p => p.kind === 'home')) {
    const html = render({...page, brandSystem: undefined});
    assert.doesNotMatch(html, /data-exb-system|exobasis-b-/);
    assert.match(html, /\/logo\/exobasis-quer-hell\.svg/);
    assert.throws(() => usesBrandSystem({...page, brandSystem: 'unknown'}), /Unknown homepage brand/);
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
  const homeCss = await readFile(path.join(ROOT, 'public/css/exobasis-b-home.css'), 'utf8');
  assert.match(homeCss, /\.exb-page-home\[data-exb-system="B"\]/);
  assert.match(homeCss, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(homeCss, /^\s*(?:html|body|:root)\s*[{,]/m);
});

test('Legacy logo scoping does not raise specificity on the protected homepages', async () => {
  const css = await readFile(path.join(ROOT, 'public/css/v6.css'), 'utf8');
  assert.equal((css.match(/:where\(a\)\.exb-brand/g) || []).length, 10);
  assert.ok(!css.includes('a.exb-brand'));
});
