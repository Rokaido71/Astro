import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {resolveCodexExecutable} from '../lib/codex-executable.mjs';import {readSettings,dataDirectory} from '../lib/bot-settings.mjs';
// Help only: no queue submission, no model call, no Discord or token read.
try{
 const settings=readSettings(dataDirectory());const file=resolveCodexExecutable(settings.codexExecutable);
 const {stdout}=await promisify(execFile)(file,['queue','--help'],{windowsHide:true,timeout:10000,maxBuffer:65536});
 if(!stdout.includes('--thread')||!stdout.includes('--message'))throw new Error('unsupported');
 console.log('Interface queue --thread/--message détectée. Compatibilité de réveil réelle à vérifier avec votre tâche ; aucune commande envoyée.');
}catch{console.error('CLI compatible non confirmé. Configurer un exécutable disposant de queue --thread/--message. Aucun réveil envoyé.');process.exitCode=1;}
