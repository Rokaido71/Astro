import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const findings=[];
for(const file of new Set(files)){
 if(!fs.existsSync(path.join(root,file)))continue;
 if(/(^|\/)(context|work|runtime|donnees|node_modules|\.build)\//.test(file)||/\.(bin|pem|key|pfx|exe|zip)$/.test(file))findings.push({file,rule:'private-or-generated-file'});
 if(!/\.(mjs|cjs|js|md|json|html|css|yml|yaml|svg)$/.test(file)&&!['LICENSE','.gitignore','.gitattributes'].includes(file))continue;
 const content=fs.readFileSync(path.join(root,file),'utf8');
 if(file!==path.relative(root,import.meta.filename).replaceAll('\\','/')&&/[A-Z]:[\\/]Users[\\/][^\s]+/i.test(content))findings.push({file,rule:'personal-absolute-path'});
 if(!file.startsWith('test/')&&file!=='package-lock.json'&&/(?<![0-9])[0-9]{16,22}(?![0-9])/.test(content))findings.push({file,rule:'hardcoded-snowflake'});
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content))findings.push({file,rule:'private-key'});
 if(/(?:mfa\.[A-Za-z0-9_-]{30,}|[MN][A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{25,})/.test(content))findings.push({file,rule:'possible-discord-token'});
}
// Report locations/rules only, never matched contents.
console.log(JSON.stringify({files:new Set(files).size,findings},null,2));if(findings.length)process.exitCode=1;
