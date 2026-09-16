import fs from 'node:fs';
import path from 'node:path';
const file=path.resolve('scripts/prepare-competition-platform.mjs');
let source=fs.readFileSync(file,'utf8');
if(source.includes("\\${action}:${competitionId}")){
  console.log('Competition platform template already escaped.');
  process.exit(0);
}
const routeStart=source.indexOf('const routes = `');
const routeEnd=source.indexOf('`;\nsource = source.replace(marker, routes',routeStart);
if(routeStart<0||routeEnd<0)throw new Error('Competition platform template boundaries not found');
const head=source.slice(0,routeStart);
const template=source.slice(routeStart,routeEnd+2).replaceAll('${','\\${');
const tail=source.slice(routeEnd+2);
fs.writeFileSync(file,head+template+tail);
console.log('Escaped nested template expressions in competition platform route generator.');
