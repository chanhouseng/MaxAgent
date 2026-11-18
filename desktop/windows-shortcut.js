'use strict';
function ensureShortcut({shell,exists,shortcut,exe,root,appId}){
 const expected={target:exe,cwd:root,args:'"'+root+'"',description:'MaxAgent',appUserModelId:appId};
 try{if(!exists(shortcut)&&!shell.writeShortcutLink(shortcut,'create',expected))return {ok:false,error:'無法建立開始選單捷徑。'};const actual=shell.readShortcutLink(shortcut);const same=actual.target?.toLowerCase()===exe.toLowerCase()&&actual.appUserModelId===appId&&actual.args===expected.args;return same?{ok:true}:{ok:false,error:'現有 MaxAgent 捷徑與程式身分不一致，未覆寫。'}}catch{return {ok:false,error:'無法核對開始選單捷徑。'}}
}
module.exports={ensureShortcut};
