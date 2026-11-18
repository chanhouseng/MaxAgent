const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('pet',{
 onState:fn=>ipcRenderer.on('pet:state',(_e,state)=>fn(state)),
 setExpanded:expanded=>ipcRenderer.invoke('pet:setExpanded',expanded),
 openChat:key=>ipcRenderer.invoke('pet:openChat',key)
});
