import {app,BrowserWindow,ipcMain,session,safeStorage} from 'electron';
import path from 'node:path';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
import {BotGuildService} from './bot-guild-service.mjs';import {TokenVault} from './token-vault.mjs';
import {botSettings,readSettings,saveSettings,dataDirectory} from '../lib/bot-settings.mjs';
app.setName('Astro');
const data=dataDirectory();fs.mkdirSync(data,{recursive:true});app.setPath('userData',data);app.setPath('sessionData',data);app.setAppLogsPath(path.join(data,'logs'));
if(!app.requestSingleInstanceLock())app.quit();
else{
 let win,service,vault,settings,switching=false,quitting=false,closed=false;
 let status={mode:'paused',serviceReady:false,configurationBlocked:true,responseMode:'current-task'};
 const root=app.getAppPath(),url=pathToFileURL(path.join(root,'ui/dashboard.html')).href;
 const publish=patch=>{status={...status,...patch,switching};if(win&&!win.isDestroyed())win.webContents.send('astro:status',status);};
 const start=()=>{
  service=new BotGuildService({data,settings,vault,config:{debounceMs:1500,maxWaitMs:5000,codexExecutable:settings.codexExecutable},publish});service.update();
 };
 app.whenReady().then(async()=>{
  vault=new TokenVault(data,safeStorage);
  try{settings=readSettings(data);start();}catch{settings=botSettings();publish({error:'Configuration locale illisible : renseigner les réglages',botSettings:settings});}
  session.defaultSession.setPermissionRequestHandler((_w,_p,done)=>done(false));session.defaultSession.setPermissionCheckHandler(()=>false);
  win=new BrowserWindow({width:1180,height:900,minWidth:800,minHeight:680,title:'Astro',icon:path.join(root,'assets/brand/astro.ico'),backgroundColor:'#f7f7f7',autoHideMenuBar:true,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.removeMenu();win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(e,next)=>{if(next.split('#')[0]!==url)e.preventDefault();});win.webContents.on('will-attach-webview',e=>e.preventDefault());
  ipcMain.handle('astro:command',async(event,m)=>{
   if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url.split('#')[0]!==url)throw new Error('Commande refusée');
   try{
    if(m.type==='getStatus')return status;
    if(m.type==='mode'&&m.mode==='paused'){if(service)await service.mode('paused');return status;}
    if(switching)throw new Error('Configuration en cours');
    if(m.type==='mode'){if(!service)throw new Error('Configuration requise');return await service.mode(m.mode);}
    if(m.type==='saveConnection'){
     if(status.mode!=='paused'||status.busy||status.starting||status.outbox||status.queued)throw new Error('Mettre en pause et traiter les demandes avant de changer la connexion');
     const next=botSettings(m.settings);switching=true;publish({});
     try{if(m.token)vault.save(m.token);if(m.removeToken===true)vault.remove();if(service)await service.dispose();settings=saveSettings(data,next);start();}
     finally{switching=false;publish({});}
     return status;
    }
    throw new Error('Commande inconnue');
   }catch(e){return {error:m.type==='saveConnection'?'Connexion non enregistrée : vérifier champs, pause, file et chiffrement':e.message};}
   finally{if(m&&Object.hasOwn(m,'token'))m.token='';}
  });
  await win.loadURL(url);
  app.on('second-instance',()=>{if(win.isMinimized())win.restore();win.show();win.focus();});app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',e=>{if(closed)return;e.preventDefault();if(quitting)return;quitting=true;(async()=>{if(service)await service.dispose();})().catch(()=>{}).finally(()=>{closed=true;app.quit();});});
 }).catch(()=>{console.error('Astro startup failed');app.quit();});
}
