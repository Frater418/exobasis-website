from pathlib import Path
import base64,mimetypes,re
from bs4 import BeautifulSoup

def inline_for_render(file):
 file=Path(file);soup=BeautifulSoup(file.read_text(),'html.parser')
 for el in soup.select('link[rel="stylesheet"]'):
  css=(file.parent/el['href']).resolve();st=soup.new_tag('style');st.string=css.read_text();el.replace_with(st)
 for el in soup.select('script[src]'):
  src=(file.parent/el['src']).resolve();el.string=src.read_text();del el['src'];el.attrs.pop('defer',None)
 for el in soup.select('img[src]'):
  src=(file.parent/el['src']).resolve();data=src.read_bytes();typ=mimetypes.guess_type(src)[0];el['src']='data:'+typ+';base64,'+base64.b64encode(data).decode()
 for el in soup.select('link[rel="icon"],link[rel="apple-touch-icon"]'):el.decompose()
 return str(soup)
