"""Startseiten-Kanäle und Navigation am Loopback-Prüfstand. Autor: Raphael Rechberger."""
import json


def exercise(page, report, screenshot, base):
    report['home_channels'] = []
    legacy = page.call('Page.addScriptToEvaluateOnNewDocument', source="window.EXOBASIS_CONFIG={email:'legacy@example.org',cryptpad:'https://legacy.example.org/'}")['identifier']
    try:
        for lang in ('de', 'en'):
            labels = None
            for scenario in ('preview', 'confirmed', 'draft'):
                page.call('Emulation.setDeviceMetricsOverride', width=390, height=950, deviceScaleFactor=1, mobile=False)
                page.navigate(base + '/' + lang + '/?scenario=' + scenario)
                page.click('.exb6-extra-channels>summary')
                page.wait('document.querySelector(".exb6-extra-channels").open')
                data = page.js("""({lang:document.documentElement.lang,title:document.title,
                  h1:[...document.querySelectorAll('h1')].map(e=>e.innerText),
                  description:document.querySelector('meta[name=description]').content,
                  robots:document.querySelector('meta[name=robots]').content,
                  slots:[...document.querySelectorAll('[data-contact-channel]')].map(e=>({
                    key:e.dataset.contactChannel,tag:e.tagName,disabled:e.getAttribute('aria-disabled'),
                    href:e.getAttribute('href'),label:e.innerText.trim(),icon:!!e.querySelector('svg')}))})""")
                expected = ['SPAN', 'SPAN'] if scenario == 'preview' else ['A', 'SPAN' if scenario == 'draft' and lang == 'de' else 'A']
                assert [slot['key'] for slot in data['slots']] == ['email', 'cryptpad'], data
                assert [slot['tag'] for slot in data['slots']] == expected, data
                assert data['lang'] == lang and len(data['h1']) == 1 and data['title'] and data['description'], data
                assert data['robots'] == 'noindex, nofollow', data
                current = [slot['label'] for slot in data['slots']]
                if labels is None:
                    labels = current
                assert current == labels, data
                for slot in data['slots']:
                    assert slot['label'] and slot['icon'], slot
                    if slot['tag'] == 'SPAN':
                        assert slot['disabled'] == 'true' and slot['href'] is None, slot
                    else:
                        assert slot['disabled'] is None, slot
                        assert slot['href'] == ('mailto:fixture@example.org' if slot['key'] == 'email' else f'https://forms.example.org/{lang}/'), slot
                assert not page.exceptions and not page.failures, (page.exceptions, page.failures)
                assert not [url for url in page.requests if url.startswith('http') and not url.startswith(base)]
                data.update(scenario=scenario,legacy_override_ignored=True,passed=True)
                report['home_channels'].append(data)

            page.navigate(base + '/' + lang + '/?scenario=confirmed')
            visited = []
            for _ in range(180):
                page.key('Tab', 'Tab', 9)
                if page.js('document.activeElement.matches(".exb6-extra-channels>summary")'):
                    page.key(' ', 'Space', 32)
                    page.wait('document.querySelector(".exb6-extra-channels").open')
                page.wait('''(() => {
                  const e=document.activeElement;
                  if(!e.dataset.contactChannel)return true;
                  const r=e.getBoundingClientRect();
                  return r.top>=0&&r.bottom<=document.documentElement.clientHeight;
                })()''')
                focus = page.js("""({key:document.activeElement.dataset.contactChannel,
                  tag:document.activeElement.tagName,text:document.activeElement.innerText,
                  top:document.activeElement.getBoundingClientRect().top,
                  bottom:document.activeElement.getBoundingClientRect().bottom,
                  height:document.documentElement.clientHeight})""")
                if focus.get('key'):
                    assert focus['tag'] == 'A' and 0 <= focus['top'] < focus['bottom'] <= focus['height'], focus
                    visited.append(focus['key'])
                    if visited == ['email', 'cryptpad']:
                        break
            assert visited == ['email', 'cryptpad'], visited
            names = [node.get('name', {}).get('value') for node in page.call('Accessibility.getFullAXTree')['nodes'] if node.get('role', {}).get('value') == 'link']
            assert all(label in names for label in labels), (labels, names)
            screenshot(lang + '-confirmed-channels-keyboard')
            report['interactions'].append({'case':'home-channel-native-keyboard-and-accessible-names','lang':lang,'passed':True,'submitted':False})

            page.navigate(base + '/' + lang + '/')
            page.click('#exb6-mobile-trigger')
            page.wait('document.querySelector("#exb6-mobile-menu").open')
            page.key('Escape', 'Escape', 27)
            page.wait('!document.querySelector("#exb6-mobile-menu").open')
            assert page.js('document.activeElement.id') == 'exb6-mobile-trigger'
            page.call('Emulation.setDeviceMetricsOverride', width=1440, height=950, deviceScaleFactor=1, mobile=False)
            page.click('[aria-controls="exb6-menu-1"]')
            page.wait('document.querySelector("[aria-controls=exb6-menu-1]").getAttribute("aria-expanded")==="true"')
            page.key('Escape', 'Escape', 27)
            assert page.js('document.activeElement.matches("[aria-controls=exb6-menu-1]")')
            assert not page.exceptions and not page.failures, (page.exceptions, page.failures)
            report['interactions'].append({'case':'home-mobile-and-desktop-menu-escape','lang':lang,'passed':True})
    finally:
        page.call('Page.removeScriptToEvaluateOnNewDocument', identifier=legacy)
