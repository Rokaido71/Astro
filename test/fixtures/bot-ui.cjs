const {app,BrowserWindow,ipcMain}=require('electron');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
app.disableHardwareAcceleration();
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astro-bot-ui-'));app.setPath('userData',dir);app.setPath('sessionData',dir);
const status={transport:'bot',mode:'paused',responseMode:'current-task',configurationBlocked:true,tokenStored:false,encryptionAvailable:true,botSettings:{transport:'bot',guildId:'',channelId:'',targetThread:''}};
let saved;
app.whenReady().then(async()=>{
 const preload=path.join(dir,'preload.cjs');fs.writeFileSync(preload,"const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('astroDesktop',{command:m=>ipcRenderer.invoke('fixture-command',m),onStatus:()=>()=>{}});");
 ipcMain.handle('fixture-command',(_event,m)=>{
  if(m.type==='getStatus')return status;
  if(m.type==='saveConnection'){saved={settings:m.settings,hadFakeToken:m.token==='FAKE_TEST_TOKEN_NOT_A_CREDENTIAL'};return {...status,botSettings:m.settings,transport:m.settings.transport,tokenStored:!!m.token,configurationBlocked:false};}
  throw new Error('Unexpected fixture command');
 });
 const win=new BrowserWindow({show:false,width:1250,height:1000,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false,preload}});
 win.webContents.session.webRequest.onBeforeRequest((d,done)=>done({cancel:!d.url.startsWith('file:')&&!d.url.startsWith('data:')}));
 await win.loadFile(path.resolve(__dirname,'../../ui/dashboard.html'));
 await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(location.hash==='#settings'){clearInterval(timer);resolve();}else if(++n>100){clearInterval(timer);reject(new Error('settings not shown'));}},10);})`);
 await win.webContents.executeJavaScript(`(()=>{
 const check=(v,m)=>{if(!v)throw new Error(m);},q=s=>document.querySelector(s);
 check(q('#guild-id').value===''&&q('#channel-id').value===''&&q('#target-thread').value==='','no preset destinations');
 check(q('#bot-token').type==='password'&&q('#bot-token').value==='','masked empty input');
 check(q('[data-mode="wake"]').disabled&&q('[data-mode="observe"]').disabled,'activation blocked');
 check(document.documentElement.scrollWidth<=innerWidth,'no horizontal overflow');
 check(q('.nav.active').dataset.view==='settings','active settings navigation');
 })()`);
 if(process.env.ASTRO_UI_SCREENSHOT){fs.mkdirSync(path.dirname(process.env.ASTRO_UI_SCREENSHOT),{recursive:true});fs.writeFileSync(process.env.ASTRO_UI_SCREENSHOT,(await win.webContents.capturePage()).toPNG());}
 await win.webContents.executeJavaScript(`(()=>{
 const q=s=>document.querySelector(s);q('#channel-link').value='https://discord.com/channels/1000000000000000005/1000000000000000006';q('#channel-link').dispatchEvent(new Event('input'));
 if(q('#guild-id').value!=='1000000000000000005'||q('#channel-id').value!=='1000000000000000006')throw new Error('link not parsed');
 q('#target-thread').value='00000000-0000-4000-8000-000000000001';q('#bot-token').value='FAKE_TEST_TOKEN_NOT_A_CREDENTIAL';q('#save-connection').click();
 if(q('#bot-token').value!=='')throw new Error('token not cleared immediately');
 })()`);
 await new Promise(r=>setTimeout(r,50));
 if(!saved?.hadFakeToken)throw new Error('fake input did not reach isolated main');
 const text=await win.webContents.executeJavaScript('document.body.innerText');if(text.includes('FAKE_TEST_TOKEN'))throw new Error('token echoed in UI');
 console.log('BOT_UI_PASSED');app.exit(0);
}).catch(e=>{console.error(e.stack);app.exit(1);});
app.on('quit',()=>{if(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('astro-bot-ui-'))try{fs.rmSync(dir,{recursive:true,force:true});}catch{}});
