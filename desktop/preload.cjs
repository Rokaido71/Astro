const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('astroDesktop',{
  command:message=>ipcRenderer.invoke('astro:command',message),
  onStatus:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('astro:status',listener);return()=>ipcRenderer.removeListener('astro:status',listener);}
});
