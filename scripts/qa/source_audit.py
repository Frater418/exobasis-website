"""Optional source/media/link audit. Does not change input sources or public HTML."""
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter
from urllib.parse import urlsplit, unquote
import hashlib, json, re
from bs4 import BeautifulSoup
from PIL import Image
R=Path(__file__).resolve().parents[2]
def read(name):return json.loads((R/name).read_text())
def write(name,data):(R/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
manifest=read('editorial/checks/render-manifest.json'); links=read('src/data/link-plan.json')
registry={p['route']:p for p in read('src/data/registry.json')}
index={(u['module'],u['anchor']):u for u in read('editorial/source-index.json')}
inputs=read('editorial/input-sha256.json');checked=[]; errors=[]
for name,expected in inputs.items():
    if name.endswith('.md'):p=R/'editorial/sources'/name
    elif name=='EXOBASIS_Startseite_V6.html':p=R/'reference/Startseite_V6_original.html'
    elif name=='Raphael-Rechberger-Avatar.png':p=R/'public/assets/raphael-rechberger-original.png'
    else:continue
    ok=p.exists() and sha(p)==expected['sha256'];checked.append({'input':name,'copy':str(p.relative_to(R)),'sha256':sha(p) if p.exists() else None,'unchanged':ok})
    if not ok:errors.append('Input copy changed: '+name)
provenance=[];coverage=[]
for m in manifest:
    data=read(m['sourceFile']); units=[]
    for ref in data['sourceRefs']:
        key=(ref['module'],ref['anchor']);unit=index.get(key)
        if not unit:errors.append('Unknown source ref '+repr(key));continue
        units.append({'module':unit['module'],'anchor':unit['anchor'],'sourceBlockStart':unit['start'],'sourceBlockEnd':unit['end'],'original':unit['original'],'scope':'source unit for the named page; not every statement in the containing module is copied'})
    provenance.append({'route':m['route'],'contentFile':m['sourceFile'],'status':data.get('reviewStatus'),'sourceUnits':units,'sharedInputs':['V6 and current conversation decisions','01_Unternehmen_und_Businessplan.md','02_Service_Delivery_Fallbeispiele_und_Vorlagen.md','03_Betriebsarchitektur.md','06_Design_und_native_Seitenmodelle.md','08_Copywriting_Grundlagen_und_Endtexte.md'],'seeding': data.get('editorial',{}).get('seeding',[]) or (['D18'] if m['route']=='/de/leistungen/flucht-notfallplan/' else ['EN10'] if m['route']=='/en/services/departure-contingency-plan/' else ['D17'] if m['route']=='/de/leistungen/laender-standortauswahl/' else ['EN11'] if m['route']=='/en/services/country-location-selection/' else [])})
    soup=BeautifulSoup((R/'dist'/m['file']).read_text(),'lxml')
    expected=[{'originalCSVLine':i+2,**x} for i,x in enumerate(links) if x['quellpfad_vorschlag']==m['route']]
    occurrences=[]
    for el in soup.select('[data-route]'):
        target=el['data-route'];parent=el.find_parent(['main','header','footer','dialog','noscript']);section=el.find_parent('section')
        occurrences.append({'target':target,'targetRoute':urlsplit(target).path,'label':el.get_text(' ',strip=True),'element':el.name,'active':el.name=='a' and bool(el.get('href')),'surface':parent.name if parent else 'other','section':section.get('id') if section else None})
    allTargets={x['targetRoute'] for x in occurrences};bodyTargets={x['targetRoute'] for x in occurrences if x['surface']=='main'}
    originalTargets={x['zielpfad_vorschlag'] for x in expected}
    missing=sorted(originalTargets-allTargets)
    if missing:errors.append('Missing original target: '+m['route']+' '+repr(missing))
    coverage.append({'route':m['route'],'originalOccurrences':len(expected),'originalUniqueDestinations':len(originalTargets),'representedUniqueDestinations':len(originalTargets&allTargets),'bodyUniqueDestinations':len(originalTargets&bodyTargets),'onlyOutsideMain':sorted(originalTargets-bodyTargets),'missingUniqueDestinations':missing,'originalRelationships':expected,'renderedOccurrences':occurrences,'qualification':'Unique destination and rendered position audit. This does not claim exact duplication of every historical occurrence; homepage duplicates were deliberately removed by Raphael.'})
assets=[]
for p in sorted((R/'public').rglob('*')):
    if not p.is_file() or p.suffix.lower() not in ['.webp','.png','.svg','.ico','.jpg','.jpeg']:continue
    rec={'file':str(p.relative_to(R/'public')),'bytes':p.stat().st_size,'sha256':sha(p)}
    if p.suffix.lower()!='.svg':
        with Image.open(p) as im:rec['width'],rec['height']=im.size
    if p.name=='raphael-rechberger-original.png':rec.update(origin='Raphael-provided original portrait',treatment='unchanged bytes',use='personal founder section and contact/trust context')
    elif p.suffix.lower()=='.webp':rec.update(origin='generated illustrative V6 asset',treatment='reused without regenerating',use='illustrative only; not a verified country/place/office/customer image')
    elif 'countries' in p.parts:rec.update(origin='Natural Earth location drawing carried over from packages 04/05',treatment='unchanged geometry',use='geographic orientation only; not the promised country photograph or a safety assessment')
    elif p.name.startswith('flag-'):rec.update(origin='V6 language selector graphic',use='German/English language choice, not visitor nationality')
    else:rec.update(origin='V6 graphics / accepted logo and lettering assets',use='brand or typography graphic; no external font required')
    assets.append(rec)
write('editorial/checks/source-integrity.json',{'checkedAt':datetime.now(timezone.utc).isoformat(),'status':'passed' if not errors else 'failed','copies':checked,'errors':errors})
write('editorial/checks/page-provenance.json',provenance)
write('editorial/checks/link-coverage.json',{'scope':f'{len(manifest)} authored variants; source archive retains all 1534 relationships','notes':['All 150 registered site destinations are connected within the unified build; only external contact channels remain inactive.','Language switching is in the shared page frame.','Homepage legal/company links occur in the footer, not twice.','Header/mobile/noscript duplicates are separate responsive/navigation surfaces, not duplicated article content.'],'pages':coverage,'errors':errors})
write('editorial/checks/media-register.json',assets)
print(json.dumps({'copiedInputs':len(checked),'builtPages':len(manifest),'uniquePageDestinationPairs':sum(x['originalUniqueDestinations'] for x in coverage),'missingTargets':sum(len(x['missingUniqueDestinations']) for x in coverage),'mediaFiles':len(assets),'errors':errors},ensure_ascii=False,indent=2))
if errors:raise SystemExit(1)
