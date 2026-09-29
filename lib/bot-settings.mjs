import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export const snowflake=value=>typeof value==='string'&&/^[1-9]\d{15,21}$/.test(value);
export const threadId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const dataDirectory=()=>path.resolve(process.env.ASTRO_DATA_DIR||path.join(process.env.APPDATA||path.join(os.homedir(),'.config'),'Astro'));
export function botSettings(value={}){
  if(value.transport&&value.transport!=='bot')throw new Error('Seul le bot officiel est pris en charge');
  const guildId=value.guildId??'',channelId=value.channelId??'',targetThread=value.targetThread??'',codexExecutable=value.codexExecutable??'';
  if((guildId&&!snowflake(guildId))||(channelId&&!snowflake(channelId)))throw new Error('Identifiants Discord invalides');
  if(targetThread&&!threadId(targetThread))throw new Error('Identifiant de conversation Codex invalide');
  if(typeof codexExecutable!=='string'||/[\r\n\0]/.test(codexExecutable))throw new Error('Chemin CLI invalide');
  return {transport:'bot',guildId,channelId,targetThread,codexExecutable};
}
export const botRuntime=(data,settings)=>path.join(data,'bot-runtime',settings.guildId&&settings.channelId?`${settings.guildId}-${settings.channelId}`:'unconfigured');
export const guildRuntime=(data,settings)=>path.join(data,'bot-runtime',settings.guildId||'unconfigured','coordinator');
export function readSettings(data){
  for(const name of ['transport.json','config.local.json']){const file=path.join(data,name);if(fs.existsSync(file))return botSettings(JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')));}
  return botSettings();
}
export function writeJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2));fs.renameSync(file+'.tmp',file);}
export function saveSettings(data,value){const settings=botSettings(value);writeJSON(path.join(data,'transport.json'),settings);return settings;}
