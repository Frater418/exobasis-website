import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, e } from '../src/lib/site.mjs';
import { renderPage } from '../src/templates/page.mjs';
import { readContent } from '../scripts/build.mjs';
import { headingTexts, htmlText, sourceMetadataIssues, renderedPageIssues, assertRenderedPage } from '../scripts/render-contract.mjs';

const pages = await readContent();
const sha = value => createHash('sha256').update(value).digest('hex');
const page = {route:'/de/test/', kind:'article', title:'Stable identity', displayTitle:'Public & clear <heading>', seoTitle:'SEO & "Title"', description:"Description 'with' & facts", contentHash:'SOURCE_HASH'};
const document = p => `<html><head><title>${e(p.seoTitle)}</title><meta content="${e(p.description)}" name="description"/></head><body><main><h1>${e(p.displayTitle || p.title)}</h1></main></body></html>`;

test('The actual 150 page sources contain individual nonblank metadata', () => {
  assert.equal(pages.length, 150);
  assert.deepEqual(sourceMetadataIssues(pages), []);
});

test('Metadata checks reject whitespace, nonstrings and duplicates after whitespace normalization', () => {
  for (const field of ['seoTitle', 'description']) {
    for (const invalid of ['', ' \n\t ', null, {}, 42]) assert.ok(sourceMetadataIssues([{...page, [field]:invalid}]).some(x => x.startsWith(`Empty ${field}:`)));
    const other = {...page, route:'/en/test/', seoTitle:'Another title', description:'Another description', [field]:'  ' + page[field] + '  '};
    assert.ok(sourceMetadataIssues([page, other]).some(x => x.startsWith(`Duplicate ${field}:`)));
  }
});

test('H1 normalization preserves inline word boundaries, escaped text and line breaks', () => {
  assert.equal(htmlText('<span>Word</span> <span>two</span><br/>three &amp; &#x1f30d;'), 'Word two three & 🌍');
  assert.equal(htmlText('&amp;lt;literal&amp;gt;'), '&lt;literal&gt;');
  assert.deepEqual(headingTexts('<h1><span>Country</span><span>: living</span></h1>'), ['Country: living']);
});

test('Actual rendered metadata and H1 match the source including special characters', () => {
  assert.deepEqual(renderedPageIssues(document(page), page), []);
  assert.doesNotThrow(() => assertRenderedPage(document(page), page));
});

test('Rendered checks reject stale H1, stale metadata and duplicated metadata elements', () => {
  const html = document(page);
  const cases = [
    [html.replace(e(page.displayTitle), 'Old heading'), 'H1 text mismatch:'],
    [html.replace(e(page.seoTitle), 'Old SEO title'), 'SEO title mismatch:'],
    [html.replace(e(page.description), 'Old description'), 'Description mismatch:'],
    [html.replace('</main>', '<h1>Extra heading</h1></main>'), 'H1 count:'],
    [html.replace('</head>', '<title>Extra title</title></head>'), 'Title count:'],
    [html.replace('</head>', '<meta name="description" content="Extra"/></head>'), 'Description count:']
  ];
  for (const [changed, expected] of cases) {
    assert.ok(renderedPageIssues(changed, page).some(x => x.startsWith(expected)), expected);
    assert.throws(() => assertRenderedPage(changed, page));
  }
});

test('Manifest comparisons reject stale sources and changed output bytes', () => {
  const html = document(page), manifest = {contentHash:page.contentHash, htmlHash:sha(html)};
  assert.deepEqual(renderedPageIssues(html, page, manifest), []);
  assert.ok(renderedPageIssues(html, page, {...manifest, contentHash:'OLD'}).some(x => x.startsWith('Stale content source:')));
  assert.ok(renderedPageIssues(html + '\n', page, manifest).some(x => x.startsWith('Changed built HTML:')));
});

test('Homepage freshness includes the separately authored HTML and actual H1', async () => {
  for (const home of pages.filter(p => p.kind === 'home')) {
    const source = await readFile(path.join(ROOT, 'src/content', home.lang, home.html), 'utf8');
    assert.equal(home.htmlSourceHash, sha(source));
    assert.equal(home.htmlH1, headingTexts(source)[0]);
    const html = renderPage(home, {mode:'preview'}, pages);
    const manifest = {contentHash:home.contentHash, htmlSourceHash:home.htmlSourceHash, htmlHash:sha(html)};
    assert.deepEqual(renderedPageIssues(html, home, manifest), []);
    assert.ok(renderedPageIssues(html, home, {...manifest, htmlSourceHash:'OLD_HTML'}).some(x => x.startsWith('Stale homepage HTML source:')));
    assert.ok(renderedPageIssues(html, {...home, htmlH1:'Changed source heading'}, manifest).some(x => x.startsWith('H1 text mismatch:')));
  }
});

test('All 150 real renderer outputs satisfy the current source contract in preview', () => {
  for (const actual of pages) {
    const html = renderPage(actual, {mode:'preview'}, pages);
    assert.deepEqual(renderedPageIssues(html, actual), [], actual.route);
    assert.match(html, /name="robots" content="noindex,nofollow"/);
  }
});
