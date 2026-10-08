"""Lokale EXOBASIS-Browserprobe. Autor: Raphael Rechberger.
uv run --offline --no-project --with websockets==15.0.1 python tests/browser_smoke.py --output <Ordner> [--baseline]
Ein isolierter Chrome ohne Nutzerprofil; keine externen Anfragen oder Übermittlungen.
"""
from __future__ import annotations
import argparse
import base64
import json
import os
import queue
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from websockets.sync.client import connect

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:4173'
CHROME = Path('C:/Program Files/Google/Chrome/Application/chrome.exe')


class Page:
    def __init__(self, ws):
        self.ws, self.number, self.loads = ws, 0, 0
        self.requests, self.failures, self.exceptions = set(), [], []

    def call(self, method, **params):
        self.number += 1
        number = self.number
        self.ws.send(json.dumps({'id': number, 'method': method, 'params': params}))
        while True:
            message = json.loads(self.ws.recv(timeout=25))
            event, data = message.get('method'), message.get('params', {})
            if event == 'Page.loadEventFired':
                self.loads += 1
            if event == 'Network.requestWillBeSent':
                self.requests.add(data['request']['url'].split('?')[0])
            if event == 'Network.loadingFailed':
                self.failures.append({'type': data.get('type'), 'error': data.get('errorText')})
            if event == 'Runtime.exceptionThrown':
                self.exceptions.append(data['exceptionDetails'])
            if message.get('id') == number:
                if 'error' in message:
                    raise RuntimeError(message['error'])
                return message.get('result', {})

    def js(self, expression):
        result = self.call('Runtime.evaluate', expression=expression, returnByValue=True, awaitPromise=True)
        if 'exceptionDetails' in result:
            raise RuntimeError(result['exceptionDetails'])
        return result['result'].get('value')

    def wait(self, expression):
        deadline = time.monotonic() + 8
        while not self.js(expression):
            if time.monotonic() > deadline:
                raise RuntimeError('Browserzustand nicht erreicht: ' + expression)
            time.sleep(0.03)

    def navigate(self, url):
        before = self.loads
        self.requests, self.failures, self.exceptions = set(), [], []
        self.call('Page.navigate', url=url)
        deadline = time.monotonic() + 15
        while True:
            state = self.js('({url:location.href,ready:document.readyState})')
            if self.loads > before and state['url'] == url and state['ready'] == 'complete':
                break
            if time.monotonic() > deadline:
                raise RuntimeError('Navigation nicht bestätigt: ' + str(state))
            time.sleep(0.03)
        self.js('document.fonts.ready.then(()=>true)')
        self.settle()

    def settle(self):
        self.js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')

    def key(self, key, code, number):
        for kind in ('keyDown', 'keyUp'):
            self.call('Input.dispatchKeyEvent', type=kind, key=key, code=code, windowsVirtualKeyCode=number)
        self.settle()

    def click(self, selector):
        coord = self.js('''(() => {
          const e=[...document.querySelectorAll(%s)].find(e=>{const r=e.getBoundingClientRect();return r.width&&r.height});
          if(!e)throw Error('Kein sichtbares Klickziel');
          e.scrollIntoView({block:'center',behavior:'instant'});
          const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};
        })()''' % json.dumps(selector))
        self.settle()
        for kind in ('mousePressed', 'mouseReleased'):
            self.call('Input.dispatchMouseEvent', type=kind, button='left', clickCount=1, **coord)
        self.settle()


def run(args):
    global BASE
    if args.base:
        target = urllib.parse.urlsplit(args.base)
        if target.scheme != 'http' or target.hostname != '127.0.0.1' or not target.port or target.path not in ('', '/') or target.query or target.fragment or target.username or target.password:
            raise ValueError('Die Browserprobe akzeptiert nur einen expliziten Loopback-HTTP-Ursprung')
        BASE = args.base.rstrip('/')
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    scratch = Path(os.environ['LOCALAPPDATA']) / 'hermes/cache/scratch'
    profile = Path(tempfile.mkdtemp(prefix='exb-browser-', dir=scratch))
    process = subprocess.Popen([str(CHROME), '--headless=new', '--no-first-run', '--no-default-browser-check',
        '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
        '--remote-debugging-port=0', '--user-data-dir=' + str(profile), 'about:blank'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    report = {'scope': 'Lokale Layoutzellen und getrennte reale Bedienproben', 'baseline': args.baseline, 'base': BASE,
              'pages': [], 'interactions': [], 'screenshots': [], 'pid': process.pid}
    ws, port, fixture, fixture_info = None, None, None, None
    try:
        marker = profile / 'DevToolsActivePort'
        deadline = time.monotonic() + 20
        while not marker.exists():
            if process.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError('Eigener Chrome ist nicht gestartet')
            time.sleep(0.05)
        port = int(marker.read_text().splitlines()[0])
        report['debug_port'] = port
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f'http://127.0.0.1:{port}/json/list', timeout=5) as response:
            target = next(t for t in json.load(response) if t['type'] == 'page')
        ws = connect(target['webSocketDebuggerUrl'], proxy=None, ping_interval=None, max_size=32 * 1024 * 1024)
        page = Page(ws)
        for method in ('Page.enable', 'Runtime.enable', 'Network.enable'):
            page.call(method)
        page.call('Network.setBlockedURLs', urls=['http://*', 'https://*'])
        # CDP URL blocking cannot exempt loopback with its glob syntax; intercept remote traffic instead.
        page.call('Network.setBlockedURLs', urls=['https://*'])
        page.call('Emulation.setFocusEmulationEnabled', enabled=True)

        if args.enquiry:
            fixture = subprocess.Popen(['node', str(ROOT / 'tests/enquiry-browser-fixture.mjs')], cwd=ROOT,
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       text=True, encoding='utf-8')
            lines = queue.Queue()
            threading.Thread(target=lambda: lines.put(fixture.stdout.readline()), daemon=True).start()
            fixture_info = json.loads(lines.get(timeout=20))
            assert fixture_info['fixture'] is True
            BASE = fixture_info['origin']
            report['scope'] = 'Reale DE/EN-Formularbedienung mit isoliertem Loopback-SMTP, keine externe Nachricht'
            report['fixture'] = fixture_info

        def screenshot(name):
            dest = output / (name + '.png')
            dest.write_bytes(base64.b64decode(page.call('Page.captureScreenshot', format='png', fromSurface=True)['data']))
            report['screenshots'].append(str(dest))

        routes = ['/de/', '/en/'] if args.baseline or args.home else ['/de/', '/en/', '/de/leistungen/erstklaerung/',
            '/en/services/initial-assessment/', '/de/wissen/aufenthalt-dokumente/', '/en/knowledge/residence-and-documents/',
            '/de/anfrage/', '/en/enquiry/', '/de/laender/paraguay/', '/en/countries/paraguay/']
        if args.all:
            routes = [x['route'] for x in json.loads((ROOT / 'editorial/checks/render-manifest.json').read_text(encoding='utf-8'))]
            assert len(routes) == 150 and len(set(routes)) == 150
        if args.enquiry:
            routes = []
        if args.routes:
            routes = args.routes
        widths = args.widths or ((320, 390, 768, 1440) if args.all else (390, 768, 1440))
        report['requested_routes'] = routes
        report['widths'] = list(widths)
        for width in widths:
            page.call('Emulation.setDeviceMetricsOverride', width=width, height=950, deviceScaleFactor=1, mobile=False)
            for route in routes:
                page.navigate(BASE + route)
                data = page.js('''({url:location.href,lang:document.documentElement.lang,
                  h1:[...document.querySelectorAll('h1')].map(e=>e.innerText),
                  width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,
                  headings:[...document.querySelectorAll('main h2')].map(e=>e.innerText),
                  sections:[...document.querySelectorAll('main section')].map(e=>({id:e.id,classes:e.className})),
                  brokenImages:[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.getAttribute('src')),
                  classes:[...document.querySelectorAll('main [class]')].map(e=>e.className.baseVal??e.className)})''')
                data.update(viewport=width, exceptions=page.exceptions, failures=page.failures,
                            external=[u for u in page.requests if u.startswith('http') and not u.startswith(BASE)])
                report['pages'].append(data)
                assert len(data['h1']) == 1 and data['lang'] == route.split('/')[1], data
                if data['scrollWidth'] > data['width']:
                    data['overflow_elements'] = page.js('''[...document.querySelectorAll('body *')].map(e=>({e,r:e.getBoundingClientRect()})).filter(({e,r})=>r.width>1&&(r.right>document.documentElement.clientWidth+1||r.left < -1)&&getComputedStyle(e).visibility!=='hidden').map(({e,r})=>({tag:e.tagName,cls:e.className.baseVal??e.className,text:e.innerText?.slice(0,140),left:r.left,right:r.right,width:r.width})).slice(0,30)''')
                    screenshot(route.strip('/').replace('/', '-') + '-' + str(width) + '-overflow')
                assert data['scrollWidth'] <= data['width'], data
                assert not data['brokenImages'] and not data['exceptions'] and not data['failures'] and not data['external'], data
                if args.all and width in (390, 1440):
                    screenshot(route.strip('/').replace('/', '-') + '-' + str(width) + '-top')
                if route in ('/de/', '/en/') and width in (390, 1440):
                    prefix = route.strip('/') + '-' + str(width)
                    screenshot(prefix + '-top')
                    targets = page.js("[...document.querySelectorAll('main>section')].map(e=>e.id).filter(Boolean)")
                    for section_id in targets:
                        page.js('document.getElementById(' + json.dumps(section_id) + ").scrollIntoView({block:'start',behavior:'instant'})")
                        page.settle()
                        screenshot(prefix + '-' + section_id)
        if args.enquiry:
            from browser_enquiry import exercise

            def request_json(route, post=False):
                request = urllib.request.Request(BASE + route, data=b'' if post else None, method='POST' if post else 'GET')
                with opener.open(request, timeout=10) as response:
                    value = response.read()
                    return json.loads(value) if not post else None

            exercise(page, report, screenshot, BASE, request_json)
        elif args.home:
            from browser_home import exercise
            report['scope'] = 'Echte Startseiten-Kandidaten mit lokalen Kontaktfixtures, ohne externe Übermittlung'
            exercise(page, report, screenshot, BASE)
        elif not args.baseline and not args.routes:
            interactions(page, report, screenshot)
        report['status'] = 'passed'
    except Exception as error:
        report.update(status='failed', error=repr(error))
        raise
    finally:
        if ws:
            try:
                page.call('Browser.close')
            except Exception:
                pass
            ws.close()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait(timeout=10)
        closed = False
        if port:
            with socket.socket() as sock:
                sock.settimeout(1)
                closed = sock.connect_ex(('127.0.0.1', port)) in (10061, 111)
        for _ in range(30):
            try:
                shutil.rmtree(profile)
                break
            except OSError:
                time.sleep(0.1)
        report['cleanup'] = {'process_exited': process.poll() is not None,
                             'debug_listener_closed': closed, 'profile_removed': not profile.exists()}
        if fixture:
            if fixture.poll() is None:
                fixture.stdin.write('stop\n')
                fixture.stdin.flush()
                try:
                    fixture.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    fixture.terminate()
                    fixture.wait(timeout=10)
            report['cleanup']['fixture_exited'] = fixture.poll() is not None
            if fixture_info:
                for key, check_port in [('fixture_http_closed', int(BASE.rsplit(':', 1)[1])), ('fixture_smtp_closed', fixture_info['smtpPort'])]:
                    with socket.socket() as sock:
                        sock.settimeout(1)
                        report['cleanup'][key] = sock.connect_ex(('127.0.0.1', check_port)) in (10061, 111)
        # Windows can return WSAEWOULDBLOCK from a timed socket even after process exit.
        # Read the actual OS listener table once, instead of treating any socket error as closed.
        if os.name == 'nt' and port:
            tracked = {'debug_listener_closed': port}
            if fixture_info:
                tracked.update(fixture_http_closed=int(BASE.rsplit(':', 1)[1]), fixture_smtp_closed=fixture_info['smtpPort'])
            numbers = ','.join(str(value) for value in tracked.values())
            command = '@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {$_.LocalPort -in @(' + numbers + ')} | Select-Object -ExpandProperty LocalPort) | ConvertTo-Json -Compress'
            os_check = subprocess.run(['powershell.exe', '-NoProfile', '-Command', command], capture_output=True, text=True, timeout=20)
            if os_check.returncode == 0:
                observed = json.loads(os_check.stdout.strip() or '[]')
                listeners = observed if isinstance(observed, list) else [observed]
                report['cleanup']['os_listener_readback'] = listeners
                for key, value in tracked.items():
                    report['cleanup'][key] = value not in listeners
            else:
                report['cleanup']['os_listener_readback_error'] = os_check.returncode
        if not all(value is True for key, value in report['cleanup'].items() if key not in ('os_listener_readback',)):
            report['status'] = 'failed'
            report['cleanup_failed'] = True
        (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'status': report.get('status'), 'error': report.get('error'),
                          'layout_cells': len(report['pages']), 'interactions': report['interactions'],
                          'report': str(output / 'report.json'), 'cleanup': report['cleanup']}, ensure_ascii=False))
        if report.get('cleanup_failed'):
            raise RuntimeError('Eigene Prüfressourcen nicht vollständig beendet oder Schließung nicht belegt')


def interactions(page, report, screenshot):
    for lang in ('de', 'en'):
        page.call('Emulation.setDeviceMetricsOverride', width=1440, height=950, deviceScaleFactor=1, mobile=False)
        page.navigate(BASE + '/' + lang + '/')
        page.click('[aria-controls="exb6-menu-1"]')
        page.wait('document.querySelector("[aria-controls=exb6-menu-1]").getAttribute("aria-expanded")==="true"')
        page.click('#exb6-tab-1')
        page.key('ArrowDown', 'ArrowDown', 40)
        assert page.js('document.querySelector("#exb6-tab-2").getAttribute("aria-selected")==="true"')
        page.key('Escape', 'Escape', 27)
        assert page.js('document.activeElement.matches("[aria-controls=exb6-menu-1]")')
        report['interactions'].append({'case': 'desktop-menu-tabs-escape', 'lang': lang, 'passed': True})
        page.click('.exb6-actions a.exb6-flag')
        other = 'en' if lang == 'de' else 'de'
        page.wait('document.documentElement.lang===' + json.dumps(other))
        report['interactions'].append({'case': 'language-home-link', 'lang': lang, 'passed': True})
        page.call('Emulation.setDeviceMetricsOverride', width=390, height=950, deviceScaleFactor=1, mobile=False)
        page.navigate(BASE + '/' + lang + '/')
        page.click('#exb6-mobile-trigger')
        page.wait('document.querySelector("#exb6-mobile-menu").open')
        page.click('.exb6-mobile-section-toggle[aria-controls="exb6-mobile-group-1"]')
        page.click('#exb6-mobile-group-1 summary')
        assert page.js('document.querySelector("#exb6-mobile-group-1 details").open')
        screenshot(lang + '-mobile-services-open')
        page.key('Escape', 'Escape', 27)
        page.wait('!document.querySelector("#exb6-mobile-group-1 details").open')
        assert page.js('document.querySelector("#exb6-mobile-menu").open')
        page.key('Escape', 'Escape', 27)
        page.wait('document.querySelector("#exb6-mobile-group-1").hidden')
        assert page.js('document.querySelector("#exb6-mobile-menu").open')
        page.key('Escape', 'Escape', 27)
        page.wait('!document.querySelector("#exb6-mobile-menu").open')
        assert page.js('document.activeElement.id==="exb6-mobile-trigger"')
        report['interactions'].append({'case': 'mobile-nested-escape-focus', 'lang': lang, 'passed': True})
        source = '/de/wissen/aufenthalt-dokumente/' if lang == 'de' else '/en/knowledge/residence-and-documents/'
        page.navigate(BASE + source)
        page.click('.exb-knowledge-action a.exb-btn')
        page.wait('!!document.getElementById("exb-enquiry-form") && document.readyState==="complete"')
        context = page.js('({url:location.href,message:document.querySelector("#short-message").value,intent:document.querySelector("#anliegen").value})')
        assert context['message'] and context['intent'], context
        assert page.js('new URL(location.href).searchParams.get("kontext")') == source, context
        page.click('#exb-check-form')
        assert page.js('document.querySelector("#reply-email").getAttribute("aria-invalid")==="true"')
        page.click('#reply-email')
        page.call('Input.insertText', text='browser-test@example.invalid')
        page.click('#exb-check-form')
        status = page.js('document.querySelector("#exb-form-status").innerText')
        assert ('nichts gesendet' if lang == 'de' else 'Nothing has been sent') in status, status
        assert not [u for u in page.requests if u.startswith('http') and not u.startswith(BASE)]
        report['interactions'].append({'case': 'knowledge-context-validation-no-send', 'lang': lang, 'passed': True, 'context': context, 'status': status})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    parser.add_argument('--base', help='Expliziter Loopback-HTTP-Ursprung eines eigenen Prüfstands')
    parser.add_argument('--home', action='store_true', help='Startseiten-Kandidaten und bestätigte/gesperrte Kontaktkanäle prüfen')
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--all', action='store_true', help='Alle 150 Varianten bei vier Breiten prüfen')
    parser.add_argument('--enquiry', action='store_true', help='Echte lokale HTTP-/SMTP-Formularbedienung prüfen')
    parser.add_argument('--routes', nargs='+', help='Gezielter betroffener Routensatz')
    parser.add_argument('--widths', nargs='+', type=int, help='Gezielte Viewportbreiten')
    args = parser.parse_args()
    if args.home and (not args.base or args.routes or args.all or args.enquiry or args.baseline):
        parser.error('--home braucht --base und darf nicht mit anderen Umfangsmodi kombiniert werden')
    if args.routes and (args.all or args.enquiry or args.baseline):
        parser.error('--routes nicht mit anderen Umfangsmodi kombinieren')
    run(args)
