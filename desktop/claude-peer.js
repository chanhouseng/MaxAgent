'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const idRe=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const prefix=id=>`[MaxAgent task ${id}]`;
function cleanPeerMessage(value){if(typeof value!=='string')return value;const m=value.match(/^Another Claude session sent a message:\n\[MaxAgent task ([0-9a-f-]{36})\]\n([\s\S]*?)\n\nThis came from another Claude session [\s\S]*$/i);return m&&idRe.test(m[1])?m[2]:value}
function discover(id,host,{dir=path.join(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'),'sessions')}={}){
 if(!idRe.test(id||'')||!/^local_[0-9a-f-]{36}$/i.test(host||''))throw Error('無法確認 Claude 原對話身分，任務未送出。');
 let files;try{files=fs.readdirSync(dir)}catch{throw Error('找不到正在運行的 Claude 桌面原對話，任務未送出。')}
 const found=[];for(const f of files.filter(x=>/^\d+\.json$/.test(x))){try{const x=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));if(x.sessionId===id&&x.hostSessionId===host&&/^claude-desktop/.test(x.entrypoint||'')&&String(x.pid)===f.slice(0,-5))found.push(x)}catch{}}
 if(found.length>1)throw Error('發現多個 Claude 桌面程序，無法確定目標；任務未送出。');if(!found.length)throw Error('找不到正在運行的 Claude 桌面原對話，任務未送出。');
 const s=found[0];if(s.status!=='idle')throw Error('Claude 原對話正在處理或狀態不明；任務未送出。');
 if(typeof s.procStart!=='string'||!/^\\\\\.\\pipe\\LOCAL\\cc-msg-[a-f0-9]{32}$/i.test(s.messagingSocketPath||''))throw Error('無法安全確認 Claude 本機通道，任務未送出。');
 const keys=files.filter(x=>new RegExp('^'+s.pid+'\\.[a-f0-9]{64}\\.key$','i').test(x));if(keys.length!==1)throw Error('無法確認 Claude 本機通道授權，任務未送出。');let auth;try{auth=JSON.parse(fs.readFileSync(path.join(dir,keys[0]),'utf8'))}catch{throw Error('無法讀取 Claude 本機通道授權，任務未送出。')}
 if(typeof auth.peerToken!=='string'||!auth.peerToken||String(auth.procStartFt)!==s.procStart)throw Error('Claude 程序已變更，任務未送出。');
 return {pid:s.pid,id,host,started:s.procStart,pipe:s.messagingSocketPath,token:auth.peerToken,dir};
}
function send(target,prompt,ticket,beforeWrite=()=>{}){return new Promise((resolve,reject)=>{
 let socket,settled=false,writing=false;
 const fail=(reason)=>{if(settled)return;settled=true;socket?.destroy();reject(Object.assign(Error(writing?'可能已送出，無法確認 Claude 本機通道結果；請勿重送。':reason||'無法連到 Claude 桌面原對話，任務未送出。'),{sendPhase:writing?'possibly_sent':'not_sent'}))};
 const verify=()=>{try{const current=JSON.parse(fs.readFileSync(path.join(target.dir,target.pid+'.json'),'utf8'));return current.sessionId===target.id&&current.hostSessionId===target.host&&current.procStart===target.started&&current.messagingSocketPath===target.pipe&&current.status==='idle'}catch{return false}};
 const changed='Claude 原對話已忙碌或程序已變更，任務未送出。';
 try{
  if(!verify())return fail(changed);
  socket=net.createConnection(target.pipe);socket.setTimeout(5000,()=>fail());socket.on('error',()=>fail());socket.on('close',()=>fail());
  socket.on('connect',()=>{
   if(!verify())return fail(changed);
   try{beforeWrite()}catch(e){return fail(e.message)}
   writing=true;
   try{socket.write(JSON.stringify({type:'auth',token:target.token})+'\n'+JSON.stringify({type:'user',message:{role:'user',content:prefix(ticket)+'\n'+prompt}})+'\n',error=>{if(error)return fail();if(settled)return;settled=true;socket.end();resolve()})}catch{fail()}
  });
 }catch{fail()}
})}
function findPeerEvidence(data,id,ticket){if(!idRe.test(ticket||''))return null;const rows=[];for(const l of data.split('\n').slice(0,-1)){try{const x=JSON.parse(l);if(x.sessionId===id&&!x.isSidechain&&x.uuid)rows.push(x)}catch{}}const start=rows.filter(x=>x.type==='user'&&x.turnOrigin==='peer'&&typeof x.message?.content==='string'&&x.message.content.startsWith('Another Claude session sent a message:\n'+prefix(ticket)+'\n'));if(start.length!==1)return null;const nodes=new Map(rows.map(x=>[x.uuid,x]));function desc(node,ancestor){const seen=new Set();while(node?.parentUuid&&!seen.has(node.parentUuid)){seen.add(node.parentUuid);if(node.parentUuid===ancestor)return true;node=nodes.get(node.parentUuid);if(node?.type==='user')return false}return false}
 const answers=rows.filter(x=>x.type==='assistant'&&!x.isApiErrorMessage&&!x.error&&!x.parent_tool_use_id&&x.message?.stop_reason==='end_turn'&&x.message.content?.some?.(v=>v.type==='text'&&v.text?.trim())&&desc(x,start[0].uuid));const complete=answers.filter(a=>rows.some(x=>x.type==='system'&&x.subtype==='stop_hook_summary'&&x.preventedContinuation===false&&x.stopReason===''&&Array.isArray(x.hookErrors)&&x.hookErrors.length===0&&Array.isArray(x.hookAdditionalContext)&&x.hookAdditionalContext.length===0&&desc(x,a.uuid)));return {received:start[0].uuid,result:complete.length===1?{marker:complete[0].uuid,turn:complete[0].uuid}:null}}
function findPeerResult(data,id,ticket){return findPeerEvidence(data,id,ticket)?.result||null}
function readPeerEvidence(session,offset,ticket){const fd=fs.openSync(session.file,'r');try{const size=fs.fstatSync(fd).size;if(!Number.isSafeInteger(offset)||offset<0||size<offset)throw Error('原對話紀錄已變更。');const b=Buffer.alloc(size-offset),n=fs.readSync(fd,b,0,b.length,offset);return findPeerEvidence(b.subarray(0,n).toString('utf8'),session.id,ticket)}finally{fs.closeSync(fd)}}
function readPeerResult(session,offset,ticket){return readPeerEvidence(session,offset,ticket)?.result||null}
module.exports={discover,send,findPeerEvidence,findPeerResult,readPeerEvidence,readPeerResult,prefix,cleanPeerMessage};
