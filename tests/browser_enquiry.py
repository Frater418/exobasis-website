"""Reale Browserbedienung am separaten lokalen SMTP-Prüfstand. Autor: Raphael Rechberger."""
import json


def exercise(page, report, screenshot, base, request_json):
    def set_mode(mode):
        request_json('/__fixture/mode/' + mode, post=True)

    def count():
        return request_json('/__fixture/summary')['received']

    def record(name, lang):
        assert not page.exceptions, page.exceptions
        assert not [url for url in page.requests if url.startswith('http') and not url.startswith(base)]
        report['interactions'].append({'case': name, 'lang': lang, 'passed': True, 'scope': 'local_http_and_smtp'})

    for lang in ('de', 'en'):
        de = lang == 'de'
        route = '/de/anfrage/' if de else '/en/enquiry/'
        confirmation = '/de/anfrage/bestaetigung/' if de else '/en/enquiry/confirmation/'
        other_confirmation = '/en/enquiry/confirmation/' if de else '/de/anfrage/bestaetigung/'
        page.call('Emulation.setDeviceMetricsOverride', width=390, height=900, deviceScaleFactor=1, mobile=False)
        page.navigate(base + confirmation + '?success=1')
        page.wait('document.readyState==="complete"')
        assert not page.js('!!document.querySelector("[data-confirmed=true]")')
        record('direct-query-is-not-proof', lang)

        source = '/de/laender/uruguay/' if de else '/en/countries/uruguay/'
        page.navigate(base + route + '?kontext=' + source)
        assert page.js('document.querySelector("#exb-enquiry-form").dataset.sendEnabled') == 'true'
        page.click('button[type="submit"]')
        assert page.js('document.querySelector("#reply-email").getAttribute("aria-invalid")') == 'true'
        assert page.js('document.activeElement.classList.contains("exb-form-error-summary")')
        record('required-email-and-focus', lang)
        page.js("document.querySelector('#short-message').value='x'.repeat(2001)")
        before = count()
        page.click('button[type="submit"]')
        assert page.js('document.querySelector("#short-message").getAttribute("aria-invalid")') == 'true'
        assert page.js('document.querySelector("#message-error").textContent')
        assert page.js('document.activeElement.classList.contains("exb-form-error-summary")')
        assert count() == before
        record('restored-message-limit-and-focus', lang)
        page.js("document.querySelector('#short-message').value=''")

        # Real input replaces the proposed public context instead of adding a hidden retained value.
        page.click('#short-message')
        page.call('Input.dispatchKeyEvent', type='keyDown', key='a', code='KeyA', windowsVirtualKeyCode=65, modifiers=2)
        page.call('Input.dispatchKeyEvent', type='keyUp', key='a', code='KeyA', windowsVirtualKeyCode=65, modifiers=2)
        page.call('Input.insertText', text='Explizite lokale Browserprobe ohne Seitenbezug.')
        page.click('#reply-email')
        page.call('Input.insertText', text='browser-test@exobasis.invalid')
        before = count()
        set_mode('accept')
        page.click('button[type="submit"]')
        page.wait('location.pathname===' + json.dumps(confirmation) + '&&!!document.querySelector("[data-confirmed=true]")')
        assert count() == before + 1
        assert request_json('/__fixture/summary')['publicContexts'][-1] == ''
        assert request_json('/__fixture/summary')['publicIntents'][-1] == ('Allgemeine Anfrage' if de else 'General enquiry')
        assert page.js('document.activeElement.tagName') == 'H1'
        screenshot(lang + '-smtp-confirmed-mobile')
        record('actual-send-and-server-confirmation', lang)

        page.navigate(base + confirmation)
        assert not page.js('!!document.querySelector("[data-confirmed=true]")')
        page.navigate(base + other_confirmation)
        assert not page.js('!!document.querySelector("[data-confirmed=true]")')
        record('refresh-and-other-language-not-proof', lang)

        for mode, expected in [('reject', 'nicht funktioniert' if de else 'Sending failed'), ('disconnect', 'noch unklar' if de else 'unclear')]:
            set_mode(mode)
            page.navigate(base + route)
            page.click('#reply-email')
            page.call('Input.insertText', text='browser-test@exobasis.invalid')
            page.click('#anliegen')
            page.key('ArrowDown', 'ArrowDown', 40)
            page.key('Enter', 'Enter', 13)
            page.click('#short-message')
            page.call('Input.insertText', text='Diese lokale Eingabe muss erhalten bleiben.')
            before = count()
            page.click('button[type="submit"]')
            page.wait('document.querySelector("#exb-form-status").innerText.includes(' + json.dumps(expected) + ')')
            assert page.js('location.pathname') == route
            assert page.js('document.querySelector("#short-message").value') == 'Diese lokale Eingabe muss erhalten bleiben.'
            assert count() == before
            assert not page.js('document.querySelector("button[type=submit]").disabled')
            screenshot(lang + '-' + mode + '-preserved-input')
            record(mode + '-preserves-input-no-success', lang)
        set_mode('accept')

        page.navigate(base + route + '?kontext=' + source)
        page.js("document.querySelector('#short-message').value=''")
        page.js('document.querySelector("#anliegen").value=' + json.dumps('Orientierungsgespräch' if de else 'Orientation call'))
        page.js("document.querySelector('#reply-email').value='browser-test@exobasis.invalid'")
        before = count()
        page.click('button[type="submit"]')
        page.wait('location.pathname===' + json.dumps(confirmation) + '&&!!document.querySelector("[data-confirmed=true]")')
        assert count() == before + 1
        assert request_json('/__fixture/summary')['publicContexts'][-1] == ''
        assert request_json('/__fixture/summary')['publicIntents'][-1] == ('Orientierungsgespräch' if de else 'Orientation call')
        record('own-intent-survives-context-removal', lang)

        set_mode('invalid-field')
        page.navigate(base + route)
        page.js("document.querySelector('#reply-email').value='browser-test@exobasis.invalid'")
        page.js('document.querySelector("#anliegen").value=' + json.dumps('Allgemeine Anfrage' if de else 'General enquiry'))
        before = count()
        page.click('button[type="submit"]')
        page.wait('document.querySelector("#short-message").getAttribute("aria-invalid")==="true"')
        assert page.js('document.activeElement.id') == 'short-message'
        assert page.js('document.querySelector("#message-error").textContent')
        assert count() == before
        record('server-context-field-error-and-focus', lang)

        set_mode('proof-unavailable')
        page.navigate(base + route)
        page.js("document.querySelector('#reply-email').value='browser-test@exobasis.invalid'")
        page.js('document.querySelector("#anliegen").value=' + json.dumps('Allgemeine Anfrage' if de else 'General enquiry'))
        before = count()
        page.click('button[type="submit"]')
        page.wait('document.querySelector("#exb-form-status").innerText.includes(' + json.dumps('wurde übermittelt' if de else 'has been sent') + ') && !document.querySelector("#exb-enquiry-form").hasAttribute("aria-busy")')
        assert page.js('location.pathname') == route and count() == before + 1
        set_mode('accept')
        page.navigate(base + confirmation)
        page.wait('!!document.querySelector("[data-confirmed=true]")')
        page.navigate(base + confirmation)
        assert not page.js('!!document.querySelector("[data-confirmed=true]")')
        record('lost-proof-response-keeps-form-success-and-reloads-proof', lang)

        script = page.call('Page.addScriptToEvaluateOnNewDocument', source="Object.defineProperty(window,'sessionStorage',{get(){throw Error('storage blocked')}})")['identifier']
        try:
            page.navigate(base + route)
            page.js("document.querySelector('#reply-email').value='browser-test@exobasis.invalid'")
            page.js('document.querySelector("#anliegen").value=' + json.dumps('Allgemeine Anfrage' if de else 'General enquiry'))
            before = count()
            page.click('button[type="submit"]')
            page.wait('document.querySelector("#exb-form-status").innerText.includes(' + json.dumps('wurde übermittelt' if de else 'has been sent') + ') && !document.querySelector("#exb-enquiry-form").hasAttribute("aria-busy")')
            assert page.js('location.pathname') == route and count() == before + 1
            record('storage-unavailable-keeps-confirmed-form-success', lang)
        finally:
            page.call('Page.removeScriptToEvaluateOnNewDocument', identifier=script)
        set_mode('accept')
    report['smtp'] = request_json('/__fixture/summary')
