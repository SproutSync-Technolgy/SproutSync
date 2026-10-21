import {existsSync,readFileSync} from 'node:fs';
const required=['README.md','package-lock.json','compose.yaml','frontend/dashboard/src/App.tsx','backend/api/app/main.py','iot/esp32/platformio.ini','.github/workflows/ci.yml','docs/architecture.md','packages/contracts/README.md'];
for(const file of required){if(!existsSync(file))throw Error('Missing '+file);}
for(const file of ['package.json','frontend/dashboard/package.json','frontend/dashboard/tsconfig.json'])JSON.parse(readFileSync(file,'utf8'));
console.log('Repository structure and JSON checks passed.');
