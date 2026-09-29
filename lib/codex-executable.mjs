import fs from 'node:fs';
import path from 'node:path';
// Prefer the currently installed desktop CLI; never pin a version hash.
export function resolveCodexExecutable(configured,{localAppData=process.env.LOCALAPPDATA}={}){
  if(configured){if(fs.existsSync(configured))return configured;throw new Error('Chemin CLI configuré introuvable');}
  const base=localAppData&&path.join(localAppData,'OpenAI','Codex','bin');
  if(base&&fs.existsSync(base)){
    const candidates=fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(base,e.name,'codex.exe')).filter(f=>fs.existsSync(f));
    candidates.sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
    if(candidates.length)return candidates[0];
  }
  if(configured&&fs.existsSync(configured))return configured;
  throw new Error('CLI Codex installé introuvable : ouvrir ou mettre à jour Codex');
}
