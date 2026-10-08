from pathlib import Path
import json,re,hashlib
from urllib.parse import urlsplit,unquote,parse_qs
from bs4 import BeautifulSoup
R=Path(__file__).resolve().parents[2];pages=[json.loads(f.read_text()) for f in sorted((R/'src/content').rglob('*.json')) if 'linkPlan' in json.loads(f.read_text())];routes={p['route'] for p in json.loads((R/'src/data/registry.json').read_text())};records=[];errors=[];targets=[]
for p in pages:
 file=R/'dist'/p['route'].strip('/')/'index.html';s=BeautifulSoup(file.read_text(),'html.parser');main=s.select_one('main');ids=[x['id'] for x in s.select('[id]')];dups=sorted({x for x in ids if ids.count(x)>1})
 if dups:errors.append((p['route'],'duplicate IDs',dups))
 if s.h1.get_text(' ',strip=True)!=p.get('displayTitle',p['title']):errors.append((p['route'],'H1 mismatch',s.h1.get_text(' ',strip=True)))
 for a in s.select('a[href]'):
  href=a['href'];u=urlsplit(href)
  if not u.scheme:
   target=file if not u.path else (file.parent/unquote(u.path)).resolve()
   if not target.is_file():errors.append((p['route'],'missing href file',href))
   elif u.fragment:
    soup=s if target==file else BeautifulSoup(target.read_text(),'html.parser')
    if not soup.find(id=unquote(u.fragment)):errors.append((p['route'],'missing fragment',href))
 for x in p.get('linkPlan',[]):
  matches=s.select('[data-route]');matches=[a for a in matches if a['data-route']==x['target']]
  if not matches:errors.append((p['route'],'missing original link',x));continue
  if x['role'] in ['Parent / Breadcrumb','Sprachwechsel']:continue
  # Exact labels and source-relative position, not merely presence in global navigation.
  matches=[a for a in matches if a.find_parent('main') and a.get_text(' ',strip=True)==x['label']]
  if not matches:errors.append((p['route'],'missing body label',x));continue
  if p['kind']=='country':
   nums=re.findall(r'Abschnitt (\d+)',x['placement']);nums=list(dict.fromkeys(nums))
   for n in nums:
    sid=p['sections'][int(n)-1]['id']
    if not any(a.find_parent(id=sid) for a in matches):errors.append((p['route'],'wrong context position',sid,x))
  else:
   anchors=re.findall(r'#([a-z0-9-]+)',x['placement'])
   for sid in dict.fromkeys(anchors):
    if not any(a.find_parent(id=sid) or a.find_previous(id=sid) and a.find_parent(class_='exb-country-group') and a.find_parent(class_='exb-country-group').find(id=sid) for a in matches):
     # Regional heading ID is on H3 within its containing group.
     container=s.find(id=sid)
     inregion=container and any(a in container.parent.descendants for a in matches)
     if not inregion:errors.append((p['route'],'wrong hub context',sid,x))
  targets.append({'source':p['route'],'target':x['target'],'sourceLine':x['sourceLine'],'active':x['target'] in routes,'dependency':None if x['target'] in routes else ('05' if '/laender/' in x['target'] or '/countries/' in x['target'] else '03')})
 text=main.get_text(' ',strip=True)
 if re.search(r'\bTODO\b|\{\{|Interne Beschaffungsbasis|Originaldatei:|WordPress-Baukarte|Heartweb',text):errors.append((p['route'],'internal leak'))
 if '\u2014' in text or '\u2013' in text:errors.append((p['route'],'forbidden dash'))
 if p['kind']=='country-hub':
  if len(s.select('.exb-country-directory-item'))!=27 or len(s.select('.exb-country-table'))!=2:errors.append((p['route'],'hub quantity'))
  for table in s.select('.exb-country-table'):
   if not table.select_one('caption') or not table.select('th[scope=col]') or not table.select('th[scope=row]'):errors.append((p['route'],'table semantics'))
 words=len(re.findall(r'\S+',text));records.append({'route':p['route'],'wordsIncludingLocalNavigation':words,'h1Count':len(s.select('h1')),'sectionCount':len(p['sections'])+(p['kind']=='country-hub'),'internalLinks':len(s.select('a[data-route]')),'pendingLinks':len(s.select('span[data-package-dependency]'))})
report={'scope':'Integrated HTML: local paths, fragments, exact inherited body labels. Numeric section and explicit fragment positions are checked; broad source positions are not invented.','pages':len(pages),'originalBodyRelationshipsChecked':len(targets),'errors':errors,'records':records}
(R/'editorial/checks/supplement-links.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));(R/'editorial/checks/resolved-supplement-links.json').write_text(json.dumps(targets,ensure_ascii=False,indent=2));print('pages',len(pages),'body relationships',len(targets),'errors',len(errors));print(json.dumps(errors[:10],ensure_ascii=False,indent=2))
if errors:raise SystemExit(1)
