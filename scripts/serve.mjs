import http from 'node:http';
import { readFile,stat,realpath } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/lib/site.mjs';
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8'};
export async function createPreviewServer(port=4173){
 const root=await realpath(path.join(ROOT,'dist'));
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'self'");
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});res.end('Sending is not connected. Nothing was accepted or stored.');return;}
  let pathname='/';
  try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400);res.end('Invalid path');return;}
  if(pathname.includes('\0')||pathname.includes('\\')){res.writeHead(400);res.end('Invalid path');return;}
  let file=path.resolve(root,'.'+pathname);
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{
   let info=await stat(file);
   if(info.isDirectory()){
    if(!pathname.endsWith('/')){res.writeHead(308,{Location:pathname+'/'+new URL(req.url,'http://127.0.0.1').search});res.end();return;}
    file=path.join(file,'index.html');info=await stat(file);
   }
   const resolved=await realpath(file);if(!resolved.startsWith(root+path.sep))throw new Error('Outside output');
   const isError=/^\/(de|en)\/404\/(?:index\.html)?$/.test(pathname);
   const data=await readFile(file);res.writeHead(isError?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);
  }catch{
   const lang=pathname.startsWith('/en/')?'en':'de';
   let data=await readFile(path.join(root,lang,'404/index.html'),'utf8');
   data=data.replace('<head>',`<head><base href="/${lang}/404/">`);
   res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?undefined:data);
  }
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.join(ROOT,'scripts/serve.mjs')){
 const at=process.argv.indexOf('--port');const port=at>=0?Number(process.argv[at+1]):4173;
 if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Use a port between 1024 and 65535.');
 const server=await createPreviewServer(port);
 console.log(`EXOBASIS local preview: http://127.0.0.1:${server.address().port}/de/`);
 console.log('Loopback only. No sender, no publication. Ctrl+C stops the preview.');
}
