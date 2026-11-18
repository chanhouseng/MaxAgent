'use strict';
const fs=require('node:fs');
function inspectClaudeTurn(session,startedAt){
 const max=2*1024*1024;let data;
 try{const st=fs.statSync(session.file),n=Math.min(st.size,max),fd=fs.openSync(session.file,'r'),buf=Buffer.alloc(n);try{fs.readSync(fd,buf,0,n,st.size-n)}finally{fs.closeSync(fd)}data=buf.toString('utf8');if(st.size>n)data=data.slice(data.indexOf('\n')+1)}catch{return null}
 const rows=[];for(const line of data.split('\n').slice(0,-1)){let x;try{x=JSON.parse(line)}catch{continue}if(x.sessionId===session.id&&!x.isSidechain)rows.push(x)}
 const users=rows.filter(x=>x.type==='user'&&!x.isMeta&&x.uuid&&Date.parse(x.timestamp)>=startedAt-5000&&((typeof x.message?.content==='string'&&x.message.content.trim())||(Array.isArray(x.message?.content)&&x.message.content.some(y=>y.type==='text'&&typeof y.text==='string'&&y.text.trim()))));
 if(users.length!==1)return null;const user=users[0],nodes=new Map(rows.filter(x=>x.uuid).map(x=>[x.uuid,x]));let answer=null,seenUser=false,invalid=false;
 for(const x of rows){if(x===user)seenUser=true;if(!seenUser)continue;
  if(x.type==='assistant'){if(x.isApiErrorMessage||x.error){invalid=true;continue}answer=x}
  if(x.type==='system'&&(x.subtype==='api_error'||x.subtype==='stop_hook_summary'&&(x.preventedContinuation!==false||x.stopReason||x.hookErrors?.length||x.hookAdditionalContext?.length)))invalid=true;
 }
 if(invalid||!answer?.uuid||answer.message?.stop_reason!=='end_turn'||!answer.message.content?.some(x=>x.type==='text'&&typeof x.text==='string'&&x.text.trim()))return null;
 let node=answer;const visited=new Set();while(node?.parentUuid&&!visited.has(node.parentUuid)){visited.add(node.parentUuid);if(node.parentUuid===user.uuid)return {user:user.uuid,answer:answer.uuid};node=nodes.get(node.parentUuid)}return null;
}
function createClaudePetTracker(inspect=inspectClaudeTurn){
 const candidates=new Map(),active=new Map(),maxAge=30*60*1000;
 const blocked=job=>['running','confirming'].includes(job?.status)||job?.status==='result_unavailable'&&!job.turn;
 function clear(key){candidates.delete(key);active.delete(key)}
 function expire(now){const removed=[];for(const [key,start] of active)if(now-start>=maxAge){clear(key);removed.push(key)}return removed}
 return {event(e,sessions,jobs){
  const key='claude:'+e.session,s=sessions.get(key),job=jobs.get(key);if(!s||s.tool!=='claude'||s.id!==e.session||!Number.isFinite(e.time))return null;
  expire(e.time);if(blocked(job)){clear(key);return null}
  if(e.type==='UserPromptSubmit'){candidates.set(key,{started:e.time});active.set(key,e.time);return null}
  if(e.type==='StopFailure'||e.type==='SessionEnd'){clear(key);return null}
  const c=candidates.get(key);if(!c||e.time<c.started||e.time-c.started>24*60*60*1000)return null;
  if(e.type==='Stop'){c.stopped=e.time;c.pair=e.backgroundClear===true?inspect(s,c.started):null;return null}
  if(e.type!=='idle_prompt'||!c.pair||!c.stopped||e.time-c.stopped<50000||e.time-c.stopped>15*60*1000)return null;
  clear(key);const pair=inspect(s,c.started);if(!pair||pair.user!==c.pair.user||pair.answer!==c.pair.answer||job?.turn===pair.answer)return null;
  return {key,tool:'claude',title:s.title||'未命名對話',status:'completed',time:e.time,source:'claude-hook',turn:pair.answer};
 },clear,expire,running(sessions,jobs,now=Date.now()){expire(now);for(const key of active.keys())if(!sessions.has(key)||blocked(jobs.get(key)))clear(key);return [...active.keys()]}};
}
module.exports={createClaudePetTracker,inspectClaudeTurn};
