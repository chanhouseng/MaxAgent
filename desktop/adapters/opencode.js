'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const sessionId=/^ses_[a-z0-9]+$/i,messageId=/^msg_[a-z0-9]+$/i,partId=/^prt_[a-z0-9]+$/i;
const defaultRoot=()=>path.join(process.env.XDG_DATA_HOME||path.join(os.homedir(),'.local','share'),'opencode','storage');
const entries=dir=>fs.readdirSync(dir,{withFileTypes:true});
function read(file){
 const stat=fs.statSync(file);
 if(!stat.isFile()||stat.size>8*1024*1024)throw Error('Invalid OpenCode record');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
const byTime=(a,b)=>a.time-b.time||a.id.localeCompare(b.id);

function createOpenCodeAdapter({root=defaultRoot()}={}){
 const summaries=new Map();
 function list(){
  const dir=path.join(root,'session'),found=new Set(),rows=new Map(),duplicates=new Set();
  try{
   for(const project of entries(dir)){
    if(!project.isDirectory())continue;
    const folder=path.join(dir,project.name);
    let files;try{files=entries(folder)}catch{continue}
    for(const entry of files){
     const id=path.basename(entry.name,'.json');
     if(!entry.isFile()||!entry.name.endsWith('.json')||!sessionId.test(id))continue;
     const file=path.join(folder,entry.name);
     found.add(file);
     try{
      const stat=fs.statSync(file),stamp=[stat.mtimeMs,stat.ctimeMs,stat.size].join(':');
      let row=summaries.get(file);
      if(row?.stamp!==stamp){
       const data=read(file);
       if(data.id!==id||data.projectID!==project.name||data.parentID||typeof data.directory!=='string'){summaries.delete(file);continue}
       row={stamp,tool:'opencode',id,file,cwd:data.directory,title:typeof data.title==='string'?data.title.trim():'',time:Number.isFinite(data.time?.updated)?data.time.updated:stat.mtimeMs,last:null,busy:false};
       summaries.set(file,row);
      }
      if(rows.has(id))duplicates.add(id);
      else rows.set(id,row);
     }catch{summaries.delete(file)}
    }
   }
  }catch{}
  for(const file of summaries.keys())if(!found.has(file))summaries.delete(file);
  return [...rows.values()].filter(row=>!duplicates.has(row.id)).map(({stamp,...row})=>row);
 }

 function history(s){
  const out={messages:[],last:null,busy:false,historyUnavailable:false};
  if(!sessionId.test(s.id))return {...out,historyUnavailable:true};
  let files;
  try{files=entries(path.join(root,'message',s.id))}catch{return {...out,historyUnavailable:true}}
  const messages=[];
  for(const file of files){
   const id=path.basename(file.name,'.json');
   if(!file.isFile()||!file.name.endsWith('.json')||!messageId.test(id))continue;
   try{
    const msg=read(path.join(root,'message',s.id,file.name));
    if(msg.id!==id||msg.sessionID!==s.id){out.historyUnavailable=true;continue}
    if(!['user','assistant'].includes(msg.role)||msg.summary===true)continue;
    messages.push({id,role:msg.role,failed:!!msg.error,time:Number.isFinite(msg.time?.created)?msg.time.created:0});
   }catch{out.historyUnavailable=true}
  }
  for(const msg of messages.sort(byTime)){
   const folder=path.join(root,'part',msg.id),parts=[];
   let files;try{files=entries(folder)}catch(error){if(error.code!=='ENOENT'||!msg.failed)out.historyUnavailable=true;continue}
   for(const file of files){
    const id=path.basename(file.name,'.json');
    if(!file.isFile()||!file.name.endsWith('.json')||!partId.test(id))continue;
    try{
     const part=read(path.join(folder,file.name));
     if(part.id!==id||part.messageID!==msg.id||part.sessionID!==s.id){out.historyUnavailable=true;continue}
     if(part.type==='text'&&!part.synthetic&&!part.ignored&&typeof part.text==='string'&&part.text.trim())parts.push({id,text:part.text});
    }catch{out.historyUnavailable=true}
   }
   if(parts.length)out.messages.push({role:msg.role,kind:msg.role,text:parts.sort((a,b)=>a.id.localeCompare(b.id)).map(p=>p.text).join('\n')});
  }
  return out;
 }
 return {list,history};
}
function evaluateOpenCodeTurn(messages,id){let found=false,reply=null;for(const m of messages){if(m.type==='user'){if(found)return null;if(m.id===id)found=true;continue}if(!found)continue;if(m.type==='assistant'&&m.finish==='stop'&&!m.error&&m.content?.some(x=>x.type==='text'&&typeof x.text==='string'&&x.text.trim()))reply=m.id;if(m.type==='idle')return m.outcome==='succeeded'&&reply?{marker:reply,turn:id}:null}return null}
function createDesktopService({request}={}){
 async function localRequest(route,options={}){
  const file=path.join(os.homedir(),'.local','state','opencode','service.json');
  const s=JSON.parse(await fs.promises.readFile(file,'utf8'));
  const url=new URL(s.url);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||typeof s.password!=='string'||!s.password)throw Error('OpenCode 本機服務資料無效。');
  const response=await fetch(url.origin+route,{method:options.method||'GET',body:options.body?JSON.stringify(options.body):undefined,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),Authorization:'Basic '+Buffer.from('opencode:'+s.password).toString('base64')},redirect:'error',signal:AbortSignal.timeout(4000)});
  if(!response.ok){const e=Error('OpenCode 服務拒絕請求（'+response.status+'）。');if([400,401,403,404,409].includes(response.status))e.sendPhase='not_sent';throw e}return response.status===204?null:response.json();
 }
 const get=request||localRequest;
 async function models(s){const query=s?.cwd?'?'+new URLSearchParams({'location[directory]':s.cwd}).toString():'';const [modelData,providerData]=await Promise.all([get('/api/model'+query),get('/api/provider'+query)]);if(!Array.isArray(modelData.data)||!Array.isArray(providerData.data))throw Error('OpenCode 模型清單格式不正確。');const providers=new Map(providerData.data.filter(p=>typeof p.id==='string').map(p=>[p.id,typeof p.name==='string'?p.name:p.id]));return modelData.data.filter(m=>m.enabled===true&&m.status==='active'&&typeof m.providerID==='string'&&typeof m.modelID==='string'&&providers.has(m.providerID)).map(m=>({id:JSON.stringify([m.providerID,m.modelID]),label:providers.get(m.providerID)+' · '+(m.name||m.modelID),efforts:[],ref:{providerID:m.providerID,id:m.id}}))}
 async function list(){const result=[],seen=new Set();let cursor=null;for(let page=0;page<50;page++){const data=await get('/api/session?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));if(!Array.isArray(data.data))throw Error('OpenCode 對話清單格式不正確。');for(const s of data.data){if(!sessionId.test(s.id||'')||s.parentID||!s.location?.directory||seen.has(s.id))continue;seen.add(s.id);result.push({id:s.id,tool:'opencode',source:'desktop',title:typeof s.title==='string'?s.title:'',cwd:s.location.directory,time:s.time?.updated||0,last:null,busy:false})}cursor=data.data.length<100?null:data.cursor?.next;if(!cursor)break}return result}
 async function raw(s){if(!sessionId.test(s.id||''))throw Error('無效的 OpenCode 對話。');const detail=await get('/api/session/'+encodeURIComponent(s.id));if(detail.data?.id!==s.id)throw Error('OpenCode 對話識別不吻合。');const messages=[];let cursor=null;for(let page=0;page<50;page++){const data=await get('/api/session/'+encodeURIComponent(s.id)+'/message?limit=100&order=asc'+(cursor?'&cursor='+encodeURIComponent(cursor):''));if(!Array.isArray(data.data))throw Error('OpenCode 歷史格式不正確。');messages.push(...data.data);cursor=data.data.length<100?null:data.cursor?.next;if(!cursor)break}return {messages,incomplete:!!cursor}}
 async function history(s){const data=await raw(s),messages=[];for(const x of data.messages){if(!['user','assistant'].includes(x.type))continue;const msg=x.type==='user'&&typeof x.text==='string'?x.text:typeof x.content==='string'?x.content:Array.isArray(x.content)?x.content.filter(p=>p.type==='text'&&!p.synthetic&&!p.ignored&&typeof p.text==='string').map(p=>p.text).join('\n'):'';if(msg.trim())messages.push({role:x.type,kind:x.type,text:msg})}return {messages,last:null,busy:false,historyUnavailable:data.incomplete}}
 async function send(s,id,text){if(!sessionId.test(s.id||'')||!/^msg_[a-z0-9]+$/i.test(id))throw Error('無效的 OpenCode 對話識別。');const response=await get('/api/session/'+encodeURIComponent(s.id)+'/prompt',{method:'POST',body:{id,text}});if(response.data?.id!==id||response.data?.sessionID!==s.id)throw Error('OpenCode 接收回報未能核對，請勿重送。');return true}
 async function switchModel(s,model){if(!sessionId.test(s.id||'')||typeof model?.id!=='string'||typeof model?.providerID!=='string')throw Error('無效的 OpenCode 模型或對話。');return get('/api/session/'+encodeURIComponent(s.id)+'/model',{method:'POST',body:{model}})}
 async function result(s,id){const data=await raw(s);return data.incomplete?null:evaluateOpenCodeTurn(data.messages,id)}
 return {list,history,send,result,models,switchModel};
}
module.exports={createOpenCodeAdapter,createDesktopService,evaluateOpenCodeTurn};
