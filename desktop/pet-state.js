const fs=require('node:fs');
function createCodexPetTracker(){
 const observed=new Map(),started=new Set();
 function tail(fd,end){const n=Math.min(end,64),b=Buffer.alloc(n);if(n)fs.readSync(fd,b,0,n,end-n);return b}
 function baseline(fd,st,file){const anchor=tail(fd,st.size);return {file,dev:st.dev,ino:st.ino,birth:st.birthtimeMs,offset:st.size,mtime:st.mtimeMs,anchor,pending:Buffer.alloc(0),skip:st.size>0&&anchor.at(-1)!==10,active:null,seen:new Set()}}
 return {observe(sessions,jobs,partial=false){
  const completed=[];
  for(const [key,s] of sessions){
   if(s.tool!=='codex'||!s.file)continue;
   let fd;try{
    fd=fs.openSync(s.file,'r');const st=fs.fstatSync(fd),old=observed.get(key);
    if(!old||old.file!==s.file||old.dev!==st.dev||old.ino!==st.ino||old.birth!==st.birthtimeMs||st.size<old.offset||st.size===old.offset&&st.mtimeMs!==old.mtime||!tail(fd,old.offset).equals(old.anchor)){observed.set(key,baseline(fd,st,s.file));continue}
    const job=jobs.get(key);if(['running','confirming'].includes(job?.status)||job?.status==='result_unavailable'&&!job.turn)old.active=null;
    let pos=old.offset;const buffer=Buffer.alloc(65536);
    while(pos<st.size){const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,st.size-pos),pos);if(!n)break;pos+=n;let chunk=Buffer.concat([old.pending,buffer.subarray(0,n)]),at;
     while((at=chunk.indexOf(10))!==-1){const row=chunk.subarray(0,at);chunk=chunk.subarray(at+1);if(old.skip){old.skip=false;continue}let x;try{x=JSON.parse(row.toString('utf8'))}catch{continue}const p=x.payload||{};
      if(x.type==='event_msg'&&p.type==='task_started'){const blocked=['running','confirming'].includes(job?.status)||job?.status==='result_unavailable'&&!job.turn||job?.turn===p.turn_id;old.active=typeof p.turn_id==='string'&&p.turn_id&&!blocked?{id:p.turn_id,final:false}:null;if(old.active)started.add(key)}
      else if(x.type==='response_item'&&p.type==='message'&&p.role==='assistant'&&p.phase==='final_answer'&&old.active&&(typeof p.content==='string'&&p.content.trim()||Array.isArray(p.content)&&p.content.some(v=>['output_text','text'].includes(v?.type)&&typeof v.text==='string'&&v.text.trim())))old.active.final=true;
      else if(x.type==='event_msg'&&['task_complete','turn_aborted'].includes(p.type)){const active=old.active;if(active&&p.turn_id===active.id){if(p.type==='task_complete'&&active.final&&!old.seen.has(active.id)&&job?.turn!==active.id&&!['running','confirming'].includes(job?.status)&&!(job?.status==='result_unavailable'&&!job.turn)){old.seen.add(active.id);completed.push({key,tool:'codex',title:s.title||'未命名對話',status:'completed',time:Date.now(),source:'codex-record',turn:active.id,marker:typeof x.timestamp==='string'?x.timestamp:null})}old.active=null}else old.active=null}
     }
     if(chunk.length>2*1024*1024){old.pending=Buffer.alloc(0);old.skip=true}else old.pending=Buffer.from(chunk);
    }
    old.offset=pos;old.mtime=st.mtimeMs;old.anchor=tail(fd,pos);
   }catch{observed.delete(key)}finally{if(fd!==undefined)fs.closeSync(fd)}
  }
  if(!partial)for(const key of observed.keys())if(!sessions.has(key))observed.delete(key);
  return completed;
 },takeStarted(){const keys=[...started];started.clear();return keys},running(sessions){return [...observed].flatMap(([key,state])=>{const s=sessions.get(key);return s&&state.active?[{key,tool:'codex',title:s.title||'未命名對話',status:'running',time:s.time||0,source:'codex-record'}]:[]})}};
}
function recordPetCompletion(completed,item){const {key,tool,title,status,time,source}=item;for(let i=completed.length-1;i>=0;i--)if(completed[i].key===key)completed.splice(i,1);completed.unshift({key,tool,title,status,time,source});if(completed.length>5)completed.length=5}
function clearPetCompletionsForRunning(completed,running){const keys=new Set(running.map(item=>item.key));for(let i=completed.length-1;i>=0;i--)if(keys.has(completed[i].key))completed.splice(i,1)}
function projectPetState(sessions,jobs,completed=[],externalRunning=[]){
 const byKey=new Map(externalRunning.map(x=>[x.key,{...x}]));
 for(const [key,job] of jobs){if(!['running','confirming'].includes(job.status))continue;const session=sessions.get(key);if(!session)continue;byKey.set(key,{key,tool:session.tool,title:session.title||'未命名對話',status:job.status,time:job.time||0})}
 const running=[...byKey.values()].sort((a,b)=>b.time-a.time),recent=completed.filter(x=>!byKey.has(x.key)).map(x=>({...x}));
 recent.sort((a,b)=>b.time-a.time);return {running,recent:recent.slice(0,5)};
}
module.exports={projectPetState,createCodexPetTracker,recordPetCompletion,clearPetCompletionsForRunning};
