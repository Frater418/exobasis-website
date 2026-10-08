"""Review authentic output in memory. No browser policy or output files are modified.
HTTP is checked separately because this environment blocks browser URL navigation.
Optional QA dependencies: playwright, beautifulsoup4; Chromium installed locally.
"""
from pathlib import Path
import json,sys,os,shutil,datetime
from playwright.sync_api import sync_playwright
from render_helpers import inline_for_render
R=Path(__file__).resolve().parents[2]
items=json.loads((R/'editorial/checks/render-manifest.json').read_text())
start=int(sys.argv[1]) if len(sys.argv)>1 else 0
end=min(int(sys.argv[2]) if len(sys.argv)>2 else len(items),len(items))
selected={'/de/','/en/','/de/laender/','/en/countries/','/de/laender/irland/','/de/laender/dominikanische-republik/','/en/countries/uae/','/de/zusammenarbeit/','/en/collaboration/','/de/anfrage/','/en/enquiry/','/de/datenschutz/','/de/wissen/','/de/leistungen/erstklaerung/'}
layouts=[];interactions=[];failures=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('EXOBASIS_CHROMIUM') or shutil.which('chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for item in items[start:end]:
  html=inline_for_render(R/'dist'/item['file']);key=item['route'].strip('/').replace('/','--')
  for width in [320,390,768,1440]:
   page=browser.new_page(viewport={'width':width,'height':1000},device_scale_factor=1,reduced_motion='reduce')
   js=[];page.on('pageerror',lambda e:js.append(str(e)))
   page.set_content(html,wait_until='load')
   page.evaluate('''async()=>{for(const image of document.images)image.loading='eager';await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)}''')
   page.wait_for_timeout(60)
   data=page.evaluate('''() => ({scrollWidth:document.documentElement.scrollWidth,bodyHeight:document.documentElement.scrollHeight,brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.alt),h1:document.querySelector('h1')?.innerText,mainCount:document.querySelectorAll('main').length,tableRegions:[...document.querySelectorAll('[role="region"][tabindex="0"]')].length,internalPending:[...document.querySelectorAll('[data-route][aria-disabled="true"]')].map(e=>e.dataset.route)})''')
   passed=data['scrollWidth']<=width and not data['brokenImages'] and not data['internalPending'] and not js and data['mainCount']==1
   record={'route':item['route'],'width':width,'passed':passed,**data,'jsErrors':list(js)};layouts.append(record)
   if not passed:failures.append(record)
   if item['route'] in selected and width in [390,1440]:
    page.screenshot(path=str(R/'reviews'/f'{key}--{width}.jpg'),type='jpeg',quality=83,full_page=width==390)
   if width==390:
    try:
     page.locator('#exb6-mobile-trigger').click();assert page.locator('#exb6-mobile-menu').evaluate('(d)=>d.open')
     toggle=page.locator('.exb6-mobile-section-toggle').nth(2);toggle.click();assert toggle.get_attribute('aria-expanded')=='true'
     page.keyboard.press('Escape');page.wait_for_timeout(20);assert not page.locator('#exb6-mobile-menu').evaluate('(d)=>d.open')
     assert page.locator('#exb6-mobile-trigger').evaluate('(e)=>e===document.activeElement')
     interactions.append({'route':item['route'],'test':'mobile menu, country group, Escape, restored focus','passed':True})
    except Exception as e:interactions.append({'route':item['route'],'test':'mobile','passed':False,'error':str(e)[:500]})
   if width==1440:
    try:
     toggle=page.locator('.exb6-menu-toggle').nth(1);toggle.focus();page.keyboard.press('Enter');assert toggle.get_attribute('aria-expanded')=='true'
     page.locator('.exb6-service-tab').first.focus();page.keyboard.press('ArrowDown');assert page.locator('.exb6-service-tab').nth(1).get_attribute('aria-selected')=='true'
     page.keyboard.press('Escape');assert toggle.get_attribute('aria-expanded')=='false'
     interactions.append({'route':item['route'],'test':'desktop menu, keyboard service-tab selection, Escape','passed':True})
    except Exception as e:interactions.append({'route':item['route'],'test':'desktop','passed':False,'error':str(e)[:500]})
   page.close()
 browser.close()
report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'Actual built HTML with local CSS/JS/images inlined for Chromium DOM rendering; browser URL navigation blocked; HTTP independently checked; images decoded and lazy images requested eagerly in the QA DOM only before screenshot','start':start,'end':end,'layouts':layouts,'interactions':interactions,'failures':failures}
(R/'editorial/checks'/f'browser-layout-{start:03}-{end:03}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'pages':end-start,'layouts':len(layouts),'layoutFailures':len(failures),'interactions':len(interactions),'interactionFailures':sum(not x['passed'] for x in interactions)}));print(json.dumps(failures[:3],ensure_ascii=False))
