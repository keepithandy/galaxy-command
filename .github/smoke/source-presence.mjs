import { readdir } from 'node:fs/promises';import { extname, join } from 'node:path';
const SKIP=new Set(['.git','.github','node_modules','dist','build','coverage']),EXTS=new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.html','.py']);let count=0;
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(SKIP.has(e.name))continue;const f=join(dir,e.name);if(e.isDirectory()){await walk(f);continue;}if(EXTS.has(extname(e.name).toLowerCase()))count++;}}
await walk(process.cwd());if(count===0){console.error('No application/source entry files found outside generated or smoke directories.');process.exit(1);}console.log(`smoke:source-presence passed (${count} source files)`);
