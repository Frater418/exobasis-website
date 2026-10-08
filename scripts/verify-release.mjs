import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ROOT } from '../src/lib/site.mjs';
const manifest=JSON.parse(await readFile(path.join(ROOT,'RELEASE_SHA256.json'),'utf8'));
const failures=[];
for(const [name,expected] of Object.entries(manifest.files)) {
 const target=path.resolve(ROOT,name);
 if(!target.startsWith(path.resolve(ROOT)+path.sep)) throw new Error('Invalid manifest path');
 try {
  const bytes=await readFile(target),actual=createHash('sha256').update(bytes).digest('hex');
  if(actual!==expected.sha256||bytes.length!==expected.bytes)failures.push(name);
 }catch{failures.push(name);}
}
if(failures.length){console.error('Changed or missing files:',failures);process.exitCode=1;}
else console.log(`Release snapshot verified: ${Object.keys(manifest.files).length} files match. No publication.`);
