import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {readSettings,guildRuntime,dataDirectory} from '../lib/bot-settings.mjs';
const data=dataDirectory();
const settings=readSettings(data);

const [action,arg]=process.argv.slice(2);
const serverRuntime=guildRuntime(data,settings),serverView=path.join(serverRuntime,'task-view.json');
if(settings.transport==='bot'&&fs.existsSync(serverView)){
  const state=JSON.parse(fs.readFileSync(serverView,'utf8'));
  if(Date.now()-state.hostUpdatedAt>5000)throw new Error('Coordinateur Astro arrêté ou indisponible');
  let command;
  if(action==='respond'||action==='recover-observed'){
    command=JSON.parse(fs.readFileSync(path.resolve(arg),'utf8').replace(/^\uFEFF/,''));
    if(action==='recover-observed')command={action,outboxId:command.outboxId,messageId:command.messageId,observedText:command.observedText,acceptObserved:command.acceptObserved===true};
  }else if(action==='inspect')command={action,ticket:arg};
  else if(['recover','diagnose'].includes(action))command={action,outboxId:arg};
  else if(['emojis','catchup'].includes(action))command={action,channelId:arg};
  else if(['pause','channels'].includes(action))command={action};
  else throw new Error('Commande serveur inconnue');
  command.id=randomUUID();const input=path.join(serverRuntime,'task-command.json');
  if(fs.existsSync(input))throw new Error('Une commande attend déjà : inspecter son résultat');
  const temp=input+'.'+command.id+'.tmp';fs.writeFileSync(temp,JSON.stringify(command),{flag:'wx'});fs.renameSync(temp,input);
  let found=false;const end=Date.now()+120000;
  while(Date.now()<end){await new Promise(r=>setTimeout(r,200));try{
    const result=JSON.parse(fs.readFileSync(path.join(serverRuntime,'task-result.json'),'utf8'));
    if(result.id===command.id){console.log(JSON.stringify(action==='inspect'&&result.view?result.view:result));if(result.error)process.exitCode=1;found=true;break;}
  }catch(e){if(e.code!=='ENOENT')throw e;}}
  if(!found)throw new Error('Résultat incertain : inspecter le résultat local sans répéter un envoi');
  process.exit(process.exitCode||0);
}
throw new Error('Astro arrêté : lancer le tableau de bord avec le même ASTRO_DATA_DIR');
