'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const types=['UserPromptSubmit','Stop','StopFailure','SessionEnd','Notification'];
function entry(type,command){return {...(type==='Notification'?{matcher:'idle_prompt'}:{}),hooks:[{type:'command',command,timeout:5}]}}
function read(file){try{const raw=fs.readFileSync(file,'utf8');const data=JSON.parse(raw.replace(/^\uFEFF/,''));if(!data||typeof data!=='object'||Array.isArray(data)||data.hooks!=null&&(typeof data.hooks!=='object'||Array.isArray(data.hooks)))throw Error();return {raw,data}}catch(e){if(e.code==='ENOENT')return {raw:null,data:{}};throw Error('無法安全讀取 Claude 設定；請檢查檔案格式或權限。')}}
function owned(item,type,command){return isDeepStrictEqual(item,entry(type,command))}
function getClaudeHook(file,command){const {data}=read(file);let count=0;for(const type of types){const list=data.hooks?.[type];if(list!=null&&!Array.isArray(list))return 'partial';if(list?.some(x=>owned(x,type,command)))count++}return count===0?'disabled':count===types.length?'enabled':'partial'}
function setClaudeHook(file,command,enabled){
 if(typeof enabled!=='boolean')throw Error('無效的設定。');const {raw,data}=read(file);if(enabled&&data.disableAllHooks===true)throw Error('Claude 設定已關閉所有 Hook，請先檢查 Claude 設定。');
 for(const type of types){const list=data.hooks?.[type];if(list!=null&&!Array.isArray(list))throw Error('Claude 的 Hook 設定格式無法安全合併。')}
 if(enabled){data.hooks??={};for(const type of types){data.hooks[type]??=[];if(!data.hooks[type].some(x=>owned(x,type,command)))data.hooks[type].push(entry(type,command))}}
 else if(data.hooks){for(const type of types){if(!data.hooks[type])continue;data.hooks[type]=data.hooks[type].filter(x=>!owned(x,type,command));if(!data.hooks[type].length)delete data.hooks[type]}if(!Object.keys(data.hooks).length)delete data.hooks}
 if(raw===null&&!enabled)return;
 fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.maxagent-'+crypto.randomBytes(8).toString('hex')+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{encoding:'utf8',flag:'wx'});let current=null;try{current=fs.readFileSync(file,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}if(current!==raw)throw Error('Claude 設定剛被其他程式修改，請重新開啟設定後再試。');fs.renameSync(tmp,file)}finally{try{fs.unlinkSync(tmp)}catch{}}
}
module.exports={getClaudeHook,setClaudeHook};
