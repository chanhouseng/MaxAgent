const {contextBridge,ipcRenderer}=require('electron');
const invoke=(name)=>(...args)=>ipcRenderer.invoke('agent:'+name,...args);
contextBridge.exposeInMainWorld('maxagent',{
 getDshLink:invoke('getDshLink'),setDshLink:invoke('setDshLink'),copyDshDraft:invoke('copyDshDraft'),manualCodexFallback:invoke('manualCodexFallback'),cancelCodexQueue:invoke('cancelCodexQueue'),openCodexForResend:invoke('openCodexForResend'),reviewCodexResend:invoke('reviewCodexResend'),acknowledgePending:invoke('acknowledgePending'),getChatModel:invoke('getChatModel'),setChatModel:invoke('setChatModel'),list:invoke('list'),history:invoke('history'),read:invoke('read'),send:invoke('send'),getDraft:invoke('getDraft'),setDraft:invoke('setDraft'),testNotification:invoke('testNotification'),chooseClaude:invoke('chooseClaude'),getPreferences:invoke('getPreferences'),setPreference:invoke('setPreference'),getClaudePetHook:invoke('getClaudePetHook'),setClaudePetHook:invoke('setClaudePetHook'),getCodexStopHook:invoke('getCodexStopHook'),setCodexStopHook:invoke('setCodexStopHook'),sessionUpdated:fn=>ipcRenderer.on('agent:sessionUpdated',(_e,item)=>fn(item)),
 notificationFailure:fn=>ipcRenderer.on('agent:notificationFailure',(_e,message)=>fn(message)),beforeClose:fn=>ipcRenderer.on('agent:beforeClose',()=>fn()),closeReady:invoke('closeReady'),preferencesChanged:fn=>ipcRenderer.on('agent:preferencesChanged',(_e,p)=>fn(p)),
 preferenceError:fn=>ipcRenderer.on('agent:preferenceError',(_e,message)=>fn(message)),
 changed:fn=>ipcRenderer.on('agent:changed',(_e,key)=>fn(key)),
 focus:fn=>ipcRenderer.on('agent:focus',(_e,key)=>fn(key))
});
