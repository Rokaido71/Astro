import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
const rows=[];
for(const [relative,entry] of Object.entries(lock.packages)){
 if(!relative)continue;
 const pkg=JSON.parse(fs.readFileSync(path.join(root,relative,'package.json'),'utf8'));
 if(typeof pkg.license!=='string')throw new Error('License metadata missing: '+pkg.name);
 rows.push({name:pkg.name,version:pkg.version,license:pkg.license,scope:entry.dev?'development':'production'});
}
rows.sort((a,b)=>a.name.localeCompare(b.name));
const text='# Inventaire des dépendances\n\nGénéré depuis package-lock.json et les manifestes installés par `npm run licenses`. Les licences des bibliothèques restent applicables ; la licence MIT du projet ne les remplace pas.\n\n| Paquet | Version | Licence déclarée | Usage |\n|---|---|---|---|\n'+rows.map(r=>`| ${r.name} | ${r.version} | ${r.license} | ${r.scope} |`).join('\n')+'\n';
fs.writeFileSync(path.join(root,'docs/dependencies.md'),text);console.log(`${rows.length} licences déclarées inventoriées, ${rows.filter(r=>r.scope==='production').length} dépendances de production.`);
