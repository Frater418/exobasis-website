// Loopback-only homepage rendering fixture. No SMTP, submission or external service calls.
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { ROOT,loadJSON,resolveHTML } from '../src/lib/site.mjs';
import { readContent } from '../scripts/build.mjs';
import { renderPage } from '../src/templates/page.mjs';

const args=process.argv.slice(2);
if(args.length!==0&&(args.length!==2||args[0]!=='--candidate-root'))throw new Error('Usage: node tests/home-browser-fixture.mjs [--candidate-root PATH]');
const candidateRoot=args.length?path.resolve(args[1]):null;
const pages=await readContent(),built=new Set(pages.map(page=>page.route));
const homes=new Map(pages.filter(page=>page.kind==='home').map(page=>[page.lang,page]));
if(candidateRoot){
 for(const lang of ['de','en']){
  const candidate=JSON.parse(await readFile(path.join(candidateRoot,'content',lang,'home.json'),'utf8'));
  if(candidate.route!==`/${lang}/`||candidate.lang!==lang||candidate.kind!=='home'||candidate.html!=='home.html')throw new Error('Unexpected homepage candidate: '+lang);
  const html=path.relative(path.join(ROOT,'src/content',lang),path.join(candidateRoot,'content',lang,'home.html'));
  homes.set(lang,{...homes.get(lang),...candidate,html});
 }
}
const confirmed=url=>({url,confirmed:true});
const contact={...loadJSON('src/data/contact.json'),enabled:true,email:'fixture@example.org',formEndpoint:'/api/enquiry',calendar:null,booking:null,simplex:null,cryptpad:{de:confirmed('https://forms.example.org/de/'),en:confirmed('https://forms.example.org/en/')}};
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/de/'||url.pathname==='/en/'){
  const scenario=url.searchParams.get('scenario')||'preview';
  if(!['preview','confirmed','draft'].includes(scenario)){res.writeHead(400);res.end();return;}
  const lang=url.pathname.slice(1,-1),page=homes.get(lang);
  const channels=scenario==='draft'?{...contact,cryptpad:{de:{...contact.cryptpad.de,confirmed:false},en:contact.cryptpad.en}}:contact;
  const config={mode:scenario==='preview'?'preview':'production',domain:'https://exobasis.org',contact:channels};
  let html=resolveHTML(renderPage(page,config,pages),page.route,built,config);
  html=html.replace(/<meta name="robots" content="[^\"]*"\s*\/?\s*>/,'<meta name="robots" content="noindex, nofollow"/>');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'self'"});res.end(html);return;
 }
 try{
  const file=path.resolve(ROOT,'public','.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(path.join(ROOT,'public')+path.sep))throw new Error('scope');
  const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch{res.writeHead(404);res.end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
console.log(JSON.stringify({origin:`http://127.0.0.1:${server.address().port}`,pid:process.pid,candidateRoot,fixture:true,submissions:false}));
const close=()=>server.close(()=>process.exit(0));
process.stdin.once('data',close);process.once('SIGTERM',close);process.once('SIGINT',close);
