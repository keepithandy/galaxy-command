import { readdir, stat } from 'node:fs/promises';import { join } from 'node:path';
const ROOT=process.cwd(),SKIP=new Set(['.git','node_modules','dist','build','coverage']),LIMIT=90*1024*1024,failures=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(SKIP.has(e.name))continue;const f=join(dir,e.name);if(e.isDirectory()){await walk(f);continue;}const s=(await stat(f)).size;if(s>LIMIT)failures.push(`${f.slice(ROOT.length+1)} (${(s/1024/1024).toFixed(1)} MiB)`);}}
await walk(ROOT);if(failures.length){console.error(`Files exceed the 90 MiB repository smoke budget:\n- ${failures.join('\n- ')}`);process.exit(1);}console.log('smoke:large-file-budget passed');
