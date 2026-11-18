'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
function decode(file){const r=spawnSync('zstd',['-dc','--',file],{encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024,timeout:10000});if(r.error||r.status!==0)throw Error('無法解壓 DSH 歷史');return r.stdout}
function createDshAdapter({home=process.env.DSH_HOME||path.join(os.homedir(),'.dsh'),decode:unpack=decode}={}){
 const cache=new Map(),summaryDir=path.join(home,'storages','session_projcache','sessions');
 function list(){let entries;try{entries=fs.readdirSync(summaryDir,{withFileTypes:true})}catch{return []}const found=new Set(),result=[];
  for(const e of entries){if(!e.isFile()||!/^session-[a-f0-9-]+\.json$/i.test(e.name))continue;const file=path.join(summaryDir,e.name);found.add(file);try{const st=fs.statSync(file),stamp=st.mtimeMs+':'+st.size;let row=cache.get(file);if(!row||row.stamp!==stamp){const x=JSON.parse(fs.readFileSync(file,'utf8')),rec=x.record||x,rows=rec.rows||{},value=k=>rows[k]?.val;let title=typeof value('title')==='string'?value('title'):value('goal')?.current?.objective;title=typeof title==='string'?title.replace(/\s+/g,' ').trim().slice(0,80):'';const cwd=typeof value('workingDirectory')==='string'?value('workingDirectory'):typeof rec.identity?.cwd==='string'?rec.identity.cwd:'';row={stamp,tool:'dsh',id:path.basename(file,'.json'),file,title:title||'（無標題）',cwd,description:'DSH 唯讀摘要',time:st.mtimeMs,last:null,busy:false,canResume:false,readHistory:false};cache.set(file,row)}result.push({...row})}catch{cache.delete(file)}}
  for(const f of cache.keys())if(!found.has(f))cache.delete(f);return result;
 }
 function history(s){const unavailable={messages:[],last:null,busy:false,cwd:s.cwd,historyUnavailable:true};try{
  const base=path.join(home,'sessions'),dirs=fs.readdirSync(base,{withFileTypes:true}).filter(x=>x.isDirectory()),matches=[];for(const d of dirs){const f=path.join(base,d.name,s.id,'session.v4.jsonl.zstd');if(fs.existsSync(f))matches.push(f)}if(matches.length!==1)return unavailable;
  const raw=unpack(matches[0]);if(typeof raw!=='string')return unavailable;const lines=raw.split('\n');let header;try{header=JSON.parse(lines[0])}catch{return unavailable}if(header.type!=='session'||header.id!==s.id||!s.cwd||typeof header.cwd!=='string'||path.win32.normalize(header.cwd).toLowerCase()!==path.win32.normalize(s.cwd).toLowerCase())return unavailable;
  const messages=[];for(const line of lines.slice(1)){if(!line.trim())continue;let x;try{x=JSON.parse(line)}catch{return unavailable}let content,role;if(x.type==='user/message'){role='user';content=x.data?.content}else if(x.type==='assistant/message'){role='assistant';content=x.data?.message?.content}else continue;if(!Array.isArray(content))continue;const text=content.filter(v=>v?.type==='text'&&typeof v.text==='string').map(v=>v.text).join('\n').trim();if(text)messages.push({role,kind:role==='user'?'user':'assistant',text})}
  return {messages,last:null,busy:false,cwd:s.cwd,historyUnavailable:false};
 }catch{return unavailable}}
 return {list,history};
}
module.exports={createDshAdapter};
