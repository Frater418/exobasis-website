import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, e } from '../src/lib/site.mjs';
import { readContent } from '../scripts/build.mjs';
import { renderMain, renderPage } from '../src/templates/page.mjs';
import { flags } from '../src/templates/navigation.mjs';

const pages = await readContent();
const h1 = html => html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]
  .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

test('Every non-home renderer displays the supplied H1 without changing page identity', () => {
  const nonHome = pages.filter(p => p.kind !== 'home');
  assert.equal(nonHome.length, 148);
  for (const page of nonHome) {
    const identity = page.title;
    const displayTitle = `PB_D65_PUBLIC_H1 ${page.route}`;
    const input = {...page, displayTitle};
    assert.equal(h1(renderMain(input)), displayTitle, page.route);
    assert.equal(input.title, identity, page.route);
  }
});

test('Country title spans preserve the complete heading including punctuation and escaping', () => {
  for (const page of pages.filter(p => p.kind === 'country')) {
    for (const displayTitle of [page.country.name, `${page.country.name}: Wohnen & Kauf`, `${page.country.name} als Standort`, `Wohnen in ${page.country.name}`, `${page.country.name} <test>`]) {
      const html = renderMain({...page, displayTitle});
      assert.equal(h1(html), e(displayTitle), page.route + ' ' + displayTitle);
      assert.doesNotMatch(html, /<test>/);
      if (displayTitle.startsWith(page.country.name)) {
        assert.match(html, /class="exb-country-name"/);
        const name = html.match(/class="exb-country-name">([^<]*)<\/span>/)?.[1];
        if (displayTitle === `${page.country.name}: Wohnen & Kauf`) {
          assert.equal(name, e(`${page.country.name}:`), 'Colon belongs to the country name: ' + page.route);
        } else {
          assert.equal(name, e(page.country.name), page.route);
        }
      }
    }
  }
});

test('Homepage H1 remains explicitly owned by its separate HTML source', async () => {
  for (const page of pages.filter(p => p.kind === 'home')) {
    const original = await readFile(path.join(ROOT, 'src/content', page.lang, page.html), 'utf8');
    const html = renderMain({...page, displayTitle: 'DO_NOT_REPLACE_HOME_HTML'});
    assert.equal(h1(html), h1(original));
    assert.match(html, /<h1 id="exb-h1">/);
    assert.doesNotMatch(h1(html), /DO_NOT_REPLACE/);
  }
});

test('Visible ancestor breadcrumbs and JSON-LD share the updated content labels', () => {
  for (const lang of ['de', 'en']) {
    const parentRoute = lang === 'de' ? '/de/leistungen/' : '/en/services/';
    const childRoute = lang === 'de' ? '/de/leistungen/erstklaerung/' : '/en/services/initial-assessment/';
    const parent = pages.find(p => p.route === parentRoute);
    const child = {...pages.find(p => p.route === childRoute), displayTitle: 'CHILD & TITLE'};
    const updated = pages.map(p => p.route === parentRoute ? {...parent, displayTitle: 'PARENT & TITLE'} : p.route === childRoute ? child : p);
    const html = renderPage(child, {mode:'production', domain:'https://test.example'}, updated);
    const trail = html.match(/<div class="exb-wrap exb-page-breadcrumb">([\s\S]*?)<\/nav><\/div>/)[1];
    const labels = [...trail.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1].replace(/<[^>]*>/g, ''));
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(labels, schema.itemListElement.map(x => e(x.name)));
    assert.equal(labels[1], 'PARENT &amp; TITLE');
    assert.equal(labels[0], lang === 'de' ? 'Startseite' : 'Home');
    assert.match(trail, new RegExp(`aria-label="${lang === 'de' ? 'Brotkrumennavigation' : 'Breadcrumb'}"`));
  }
});

test('Language selection is a named group with a language state, not a false current page', () => {
  for (const page of pages) {
    const html = flags(page);
    assert.match(html, /class="exb6-flags" role="group" aria-label="/);
    assert.match(html, /aria-current="true"/);
    assert.doesNotMatch(html, /aria-current="page"/);
    const target = page.translation || (page.lang === 'de' ? '/en/' : '/de/');
    assert.ok(html.includes(`href="${target}"`), page.route);
  }
});
