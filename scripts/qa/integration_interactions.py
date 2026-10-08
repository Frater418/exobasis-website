"""Interaction checks on the unified output. Test URL injected only in the QA copy.
Uses no customer data and cannot send messages. HTTP routes have independent tests.
"""
from pathlib import Path
from urllib.parse import urlsplit,urljoin,urlencode,parse_qs
from html import escape
import json,os,shutil,datetime
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from render_helpers import inline_for_render
R=Path(__file__).resolve().parents[2]
reg={x['route']:x for x in json.loads((R/'src/data/registry.json').read_text())}
contexts=json.loads((R/'src/data/country-contexts.json').read_text())
for route,p in reg.items():
 if p['model']=='herkunft':contexts[route]=('Herkunftsbezug: ' if p['lang']=='de' else 'Departure context: ')+p['title']
forms={l:inline_for_render(R/'dist'/('de/anfrage/index.html' if l=='de' else 'en/enquiry/index.html')) for l in ['de','en']}
results=[];errors=[];network=[]
def result(name,ok,**detail):results.append({'test':name,'passed':bool(ok),**detail})
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('EXOBASIS_CHROMIUM') or shutil.which('chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 def fixture(lang,query,prior='',selected=''):
  route='/de/anfrage/' if lang=='de' else '/en/enquiry/'
  url='https://preview.example.invalid'+route+'?'+urlencode(query)
  html=forms[lang].replace('new URL(location.href)','new URL('+json.dumps(url)+')')
  if prior:html=html.replace('</textarea>',escape(prior)+'</textarea>')
  if selected:html=html.replace('<option value="'+selected+'">','<option selected value="'+selected+'">')
  page=b.new_page(viewport={'width':390,'height':900},reduced_motion='reduce')
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda q:network.append(q.url) if q.url.startswith(('http:','https:')) else None)
  page.set_content(html,wait_until='load')
  return page
 # Each country and origin CTA must really carry the allowed public route.
 for route,suggestion in contexts.items():
  lang=reg[route]['lang'];source=R/'dist'/route.strip('/')/'index.html'
  soup=BeautifulSoup(source.read_text(),'html.parser')
  links=[a for a in soup.select('main a[href]') if 'kontext=' in a['href']]
  valid=[a for a in links if parse_qs(urlsplit(a['href']).query).get('kontext')==[route]]
  if not valid:result('Context CTA: '+route,False,reason='No source-bound context link');continue
  target=(source.parent/urlsplit(valid[0]['href']).path).resolve()
  expected=R/'dist'/('de/anfrage/index.html' if lang=='de' else 'en/enquiry/index.html')
  q={k:v[0] for k,v in parse_qs(urlsplit(valid[0]['href']).query).items()}
  page=fixture(lang,q)
  ok=target==expected and page.locator('#short-message').input_value()==suggestion and page.locator('#anliegen').input_value()==('Allgemeine Anfrage' if lang=='de' else 'General enquiry') and page.locator('button[type=submit]').is_disabled()
  result('Context CTA and editable suggestion: '+route,ok)
  page.close()
 contact=json.loads((R/'src/data/contact.json').read_text())
 for lang in ['de','en']:
  for intent in contact['languages'][lang]['options']:
   page=fixture(lang,{'anliegen':intent});result(lang+' exact public enquiry option: '+intent,page.locator('#anliegen').input_value()==intent and page.locator('#short-message').input_value()=='');page.close()
  country='/de/laender/irland/' if lang=='de' else '/en/countries/ireland/'
  keep='Persönliche Erstklärung' if lang=='de' else 'Personal initial assessment'
  page=fixture(lang,{'kontext':country,'anliegen':'General enquiry'},'Synthetic prior text',keep)
  result(lang+' existing message and choice preserved',page.locator('#short-message').input_value()=='Synthetic prior text' and page.locator('#anliegen').input_value()==keep)
  page.locator('#exb-context-offer button').click()
  result(lang+' context appended only after consent',page.locator('#short-message').input_value()=='Synthetic prior text\n\n'+contexts[country] and page.evaluate('document.activeElement.id')=='short-message')
  page.locator('#short-message').fill('');result(lang+' context can be removed',page.locator('#short-message').input_value()=='');page.close()
  for value in ['/de/not-an-authorised-context/','<img src=x onerror=alert(1)>','x'*301,('/en/countries/ireland/' if lang=='de' else '/de/laender/irland/')]:
   page=fixture(lang,{'kontext':value});result(lang+' unknown/foreign/oversized context ignored',page.locator('#short-message').input_value()=='' and page.locator('#exb-context-offer').count()==0,inputClass=('oversized' if len(value)>300 else value));page.close()
  page=fixture(lang,{'kontext':country},'x'*1999);page.locator('#exb-context-offer button').click();result(lang+' maximum-length existing text not truncated',page.locator('#short-message').input_value()=='x'*1999);page.close()
  page=fixture(lang,{'reply-email':'private@example.invalid','short-message':'must-not-be-reflected','anliegen':'NOT_ALLOWED'})
  result(lang+' private query fields and unknown option ignored',page.locator('#reply-email').input_value()=='' and page.locator('#short-message').input_value()=='' and page.locator('#anliegen').input_value()=='')
  page.locator('#exb-check-form').click();result(lang+' empty form gives accessible errors',page.locator('.exb-form-error-summary').is_visible() and page.evaluate('document.activeElement.classList.contains("exb-form-error-summary")'))
  page.locator('#reply-email').fill('synthetic@example.invalid');page.locator('#anliegen').select_option(contact['languages'][lang]['options'][0]);page.locator('#exb-check-form').click()
  result(lang+' valid local check never claims sending',('nichts gesendet' in page.locator('#exb-form-status').inner_text() if lang=='de' else 'Nothing has been sent' in page.locator('#exb-form-status').inner_text()) and page.locator('button[type=submit]').is_disabled())
  page.evaluate('document.querySelector("form").dispatchEvent(new Event("submit",{cancelable:true,bubbles:true}))')
  result(lang+' forced submission event stays unsent',('Nicht gesendet' if lang=='de' else 'Not sent') in page.locator('#exb-form-status').inner_text());page.close()
 # Representative actual fragment movement; external navigation is not substituted with fake success.
 examples=['/de/laender/','/en/countries/','/de/laender/dominikanische-republik/','/de/laender/irland/','/en/countries/uae/','/de/wissen/','/de/leistungen/erstklaerung/','/de/zusammenarbeit/','/de/datenschutz/']
 for route in examples:
  page=b.new_page(viewport={'width':390,'height':900},reduced_motion='reduce');page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(inline_for_render(R/'dist'/route.strip('/')/'index.html'),wait_until='load')
  jump=page.locator('.exb-page-toc a').last;href=jump.get_attribute('href');jump.click();page.wait_for_timeout(100)
  y=page.locator(href).evaluate('(e)=>e.getBoundingClientRect().top');result('Final section jump: '+route,-2<=y<=250,top=y,target=href)
  table=page.locator('[role=region][tabindex="0"]:has(table)').first
  if table.count():
   table.focus();page.keyboard.press('ArrowRight');page.wait_for_timeout(200)
   overflow=table.evaluate('(e)=>({width:e.clientWidth,scrollWidth:e.scrollWidth,left:e.scrollLeft})')
   result('Keyboard table region: '+route,overflow['scrollWidth']<=overflow['width'] or overflow['left']>0,**overflow)
  link=page.locator('main a[data-link-description]').first;link.focus();page.wait_for_timeout(230)
  tooltip=page.locator('#exb-tooltip');result('Focus link description: '+route,tooltip.is_visible())
  page.keyboard.press('Escape');result('Escape closes description: '+route,not tooltip.is_visible());page.close()
 for route in ['/de/','/de/laender/','/en/countries/uae/']:
  ctx=b.new_context(java_script_enabled=False,viewport={'width':390,'height':900});page=ctx.new_page();page.set_content(inline_for_render(R/'dist'/route.strip('/')/'index.html'),wait_until='load')
  result('Readable navigation without JavaScript: '+route,page.locator('.exb-static-nav').is_visible() and page.locator('h1').is_visible());ctx.close()
 b.close()
report={'testedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mode':'Chromium in-memory rendering of actual output; only input URL replaced in context fixtures, no production scripts modified; actual HTTP tested separately','checks':len(results),'passed':sum(r['passed'] for r in results),'failures':[r for r in results if not r['passed']],'jsErrors':errors,'externalHTTPRequests':network,'results':results}
(R/'editorial/checks/integration-interactions.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='results'},ensure_ascii=False,indent=2))
if report['failures'] or errors or network:raise SystemExit(1)
