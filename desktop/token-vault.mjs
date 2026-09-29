import fs from 'node:fs';
import path from 'node:path';
// No token GET IPC. Only main-process consumers can decrypt this file.
export class TokenVault {
  constructor(data,safeStorage){this.file=path.join(data,'discord-token.bin');this.safe=safeStorage;}
  available(){try{return this.safe.isEncryptionAvailable()&&(process.platform!=='linux'||this.safe.getSelectedStorageBackend?.()!=='basic_text');}catch{return false;}}
  has(){return fs.existsSync(this.file);}
  save(token){
    if(!this.available())throw new Error('Chiffrement système indisponible : jeton non enregistré');
    if(typeof token!=='string'||token.length<20||token.length>512||/\s/.test(token))throw new Error('Format du jeton invalide');
    let encrypted;
    try{encrypted=this.safe.encryptString(token);}catch{throw new Error('Chiffrement du jeton impossible');}
    fs.writeFileSync(this.file+'.tmp',encrypted,{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);
  }
  read(){
    if(!this.has()||!this.available())throw new Error('Jeton chiffré absent ou indisponible');
    try{return this.safe.decryptString(fs.readFileSync(this.file));}catch{throw new Error('Jeton illisible pour cet utilisateur Windows');}
  }
  remove(){if(this.has())fs.unlinkSync(this.file);}
}
