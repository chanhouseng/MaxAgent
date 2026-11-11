const {contextBridge,ipcRenderer}=require('electron');
const invoke=(name)=>(...args)=>ipcRenderer.invoke('agent:'+name,...args);
contextBridge.exposeInMainWorld('maxagent',{
 manualCodexFallback:invoke('manualCodexFallback'),getChatModel:invoke('getChatModel'),setChatModel:invoke('setChatModel'),list:invoke('list'),history:invoke('history'),read:invoke('read'),send:invoke('send'),chooseClaude:invoke('chooseClaude'),getPreferences:invoke('getPreferences'),setPreference:invoke('setPreference'),
 preferencesChanged:fn=>ipcRenderer.on('agent:preferencesChanged',(_e,p)=>fn(p)),
 preferenceError:fn=>ipcRenderer.on('agent:preferenceError',(_e,message)=>fn(message)),
 changed:fn=>ipcRenderer.on('agent:changed',(_e,key)=>fn(key)),
 focus:fn=>ipcRenderer.on('agent:focus',(_e,key)=>fn(key))
});
