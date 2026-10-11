import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
const result = await build({ entryPoints:['apps-script/server.js'],bundle:true,write:false,format:'iife',globalName:'Hospitality',target:'es2020',loader:{'.html':'text'},legalComments:'none' });
await writeFile('apps-script/Code.gs', result.outputFiles[0].text + '\nfunction doGet(e) { return Hospitality.doGet(e); }\nfunction hospitalityRequest(request) { return Hospitality.hospitalityRequest(request); }\nfunction setupHospitality_() { console.log(Hospitality.setupHospitality()); }\nfunction showAdminLink_() { console.log(Hospitality.showAdminLink()); }\n');
