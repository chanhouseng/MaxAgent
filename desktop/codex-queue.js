'use strict';
const fs=require('node:fs'),readline=require('node:readline'),{spawn}=require('node:child_process');
const {resolveCodexExe}=require('./codex-cli');
function findQueuedTurn(data,clientId,expected){
 let turn=null,matched=null,final=false,settings=null;
 for(const line of data.split('\n').slice(0,-1)){let x;try{x=JSON.parse(line)}catch{continue}const p=x.payload||{};
  if(x.type==='event_msg'&&p.type==='task_started'){turn=p.turn_id;final=false;settings=null}
  if(x.type==='turn_context'&&p.turn_id===turn)settings=p;
  if(x.type==='event_msg'&&p.type==='item_completed'&&p.turn_id===turn&&p.item?.type==='UserMessage'&&p.item.client_id===clientId)matched=turn;
  if(turn===matched&&x.type==='response_item'&&p.type==='message'&&p.role==='assistant'&&p.phase==='final_answer'&&p.content?.some(v=>v.text?.trim()))final=true;
  if(expected&&matched&&turn===matched&&x.type==='event_msg'&&p.type==='turn_aborted'&&p.turn_id===matched)return {state:'interrupted',turn:matched};
  if(matched&&turn===matched&&x.type==='event_msg'&&p.type==='task_complete'&&p.turn_id===matched&&(final||p.last_agent_message?.trim())){
   if(expected&&(settings?.model!==expected.model||expected.effort&&settings.effort!==expected.effort))return {state:'model_unconfirmed',turn:matched};
   return {state:'completed',turn:matched,marker:x.timestamp};
  }
 }
 return matched?{state:'received',turn:matched}:null;
}
function readQueuedTurn(s,offset,clientId,expected){const fd=fs.openSync(s.file,'r');try{const size=fs.fstatSync(fd).size;if(size<offset)throw Error('原對話紀錄已變更，無法確認結果。');const b=Buffer.alloc(size-offset);const n=fs.readSync(fd,b,0,b.length,offset);return findQueuedTurn(b.subarray(0,n).toString('utf8'),clientId,expected)}finally{fs.closeSync(fd)}}
function request(method,params,cwd){return new Promise((resolve,reject)=>{
 let child,timer,done=false,dispatched=false,seq=0;const pending=new Map();
 const finish=(err,value)=>{if(done)return;done=true;clearTimeout(timer);child?.stdin.end();child?.kill();if(err){err.sendPhase||=dispatched?'possibly_sent':'not_sent';reject(err)}else resolve(value)};
 try{child=spawn(resolveCodexExe(),['app-server'],{cwd,stdio:['pipe','pipe','ignore'],windowsHide:true})}catch(e){return finish(e)}
 timer=setTimeout(()=>finish(Error('Codex 佇列連線逾時。')),15000);
 const send=(name,value,cb)=>{const id=++seq;pending.set(id,cb);child.stdin.write(JSON.stringify({id,method:name,params:value})+'\n')};
 child.on('error',e=>finish(e));child.on('exit',()=>finish(Error('Codex 佇列連線已結束。')));child.stdin.on('error',e=>finish(e));
 readline.createInterface({input:child.stdout}).on('line',line=>{let x;try{x=JSON.parse(line)}catch{return}const cb=pending.get(x.id);if(!cb)return;pending.delete(x.id);if(x.error){const err=Error(x.error.message||'Codex 佇列操作失敗。');if(x.error.code===-32601||x.error.code===-32602)err.sendPhase='not_sent';return finish(err)}cb(x.result)});
 send('initialize',{clientInfo:{name:'maxagent',version:'0.1.0'},capabilities:{experimentalApi:true}},()=>{child.stdin.write(JSON.stringify({method:'initialized'})+'\n');dispatched=true;send(method,params,result=>finish(null,result))});
})}
async function add(s,prompt,clientId){const r=await request('thread/queue/add',{threadId:s.id,input:[{type:'text',text:prompt,text_elements:[]}],clientUserMessageId:clientId},s.cwd);if(!r?.queuedSubmission?.id)throw Error('Codex 沒有回傳佇列識別碼。');return r.queuedSubmission.id}
async function list(s){let cursor=null,all=[];do{const r=await request('thread/queue/list',{threadId:s.id,cursor},s.cwd);all.push(...r.data);cursor=r.nextCursor}while(cursor);return all}
async function cancel(s,id){return (await request('thread/queue/delete',{threadId:s.id,queuedSubmissionId:id},s.cwd)).deleted===true}
module.exports={findQueuedTurn,readQueuedTurn,add,list,cancel};
