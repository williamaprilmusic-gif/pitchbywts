import fs from 'node:fs';
import path from 'node:path';
const file=path.resolve('scripts/prepare-competition-platform.mjs');
let source=fs.readFileSync(file,'utf8');
const routeStart=source.indexOf('const routes = `');
const routeEnd=source.indexOf('`;\nsource = source.replace(marker, routes',routeStart);
if(routeStart<0||routeEnd<0)throw new Error('Competition platform template boundaries not found');
const head=source.slice(0,routeStart);
let template=source.slice(routeStart,routeEnd+2);
// Keep generated backend code free of nested template interpolation.
template=template.replace("||`${action}:${competitionId}:${JSON.stringify(input)}`", "||String(action)+':'+String(competitionId)+':'+JSON.stringify(input)");
template=template.replace("error(`Exactly ${requested} teams are required`,400)", "error('Exactly '+String(requested)+' teams are required',400)");
template=template.replace("message=`${requested}-team knockout bracket created.`", "message=String(requested)+'-team knockout bracket created.'");
// Escape nested expressions so they are emitted into backend/index.ts
// rather than evaluated while this build-time generator is running.
template=template.replaceAll('${','\\${');
// These two expressions belong to the generator itself and must remain live.
template=template.replaceAll('\\${begin}', '${begin}');
template=template.replaceAll('\\${end}', '${end}');
const tail=source.slice(routeEnd+2);
fs.writeFileSync(file,head+template+tail);
console.log('Competition platform route template normalized for safe nested interpolation.');
