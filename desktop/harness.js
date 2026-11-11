const {codexSpawnError,codexRpcError,writerConflict}=require('./codex-error');
const {resolveCodexExe}=require('./codex-cli');
const fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const {spawn}=require('node:child_process'), readline=require('node:readline'), {StringDecoder}=require('node:string_decoder');
const ID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const codexHome=()=>process.env.CODEX_HOME||path.join(os.homedir(),'.codex');
const root=(tool)=>tool==='codex'?path.join(codexHome(),'sessions'):path.join(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'),'projects');
function *files(dir){
 let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{return}
 for(const e of entries){const p=path.join(dir,e.name);if(e.isDirectory())yield*files(p);else if(e.isFile()&&e.name.endsWith('.jsonl'))yield p}
}
function json(line){try{return JSON.parse(line)}catch{return null}}
const text=(content)=>typeof content==='string'?content:Array.isArray(content)?content.filter(x=>['text','input_text','output_text'].includes(x?.type)).map(x=>x.text||'').join('\n'):'';
function userText(s){
 return s.replace(/<environment_context>[\s\S]*?<\/environment_context>/g,'').replace(/<user_instructions>[\s\S]*?<\/user_instructions>/g,'').replace(/^# AGENTS\.md instructions[\s\S]*?<\/INSTRUCTIONS>/i,'').trim();
}
function codexUserText(value){
 const clean=userText(value).replace(/<external_codex_apps_open_page>[\s\S]*?<\/external_codex_apps_open_page>/g,'').replace(/<external_codex_apps_selected_page_part_\d+_of_\d+>[\s\S]*?<\/external_codex_apps_selected_page_part_\d+_of_\d+>/g,'').trim();
 return /^Side conversation boundary\./i.test(clean)?'':clean;
}
function *fileLines(file){
 const fd=fs.openSync(file,'r'),decoder=new StringDecoder('utf8'),buffer=Buffer.allocUnsafe(64*1024);let pending='';
 try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0){pending+=decoder.write(buffer.subarray(0,n));let end;while((end=pending.indexOf('\n'))!==-1){yield pending.slice(0,end);pending=pending.slice(end+1)}}pending+=decoder.end();if(pending)yield pending}finally{fs.closeSync(fd)}
}
function history(s){
 const out=[];let lastStarted=null, lastEnd=null, last=null, cwd=null,firstUser=null,finalSeen=false;
 function addUser(value){const msg=codexUserText(value);if(!msg)return;if(!firstUser)firstUser=msg;if(out.at(-1)?.text!==msg)out.push({role:'user',kind:'user',text:msg})}
 for(const line of fileLines(s.file)){
  const x=json(line);if(!x)continue;
  if(s.tool==='codex'){
   const p=x.payload||{};
   if(x.type==='session_meta'&&p.id===s.id)cwd=p.cwd||cwd;
   if(x.type==='event_msg'){
    if(p.type==='task_started'){lastStarted=p.turn_id;finalSeen=false}
    if(['task_complete','turn_aborted'].includes(p.type)){lastEnd=p.turn_id;if(p.type==='task_complete'&&(finalSeen||(typeof p.last_agent_message==='string'&&p.last_agent_message.trim())))last=x.timestamp||last}
    if(p.type==='user_message'&&typeof p.message==='string')addUser(p.message);
   }
   if(x.type==='response_item'&&p.type==='message'&&['user','assistant'].includes(p.role)){
    if(p.role==='user')addUser(text(p.content));else {const msg=text(p.content),kind=p.phase==='commentary'?'progress':p.phase==='final_answer'?'final':'assistant';if(kind==='final'&&msg)finalSeen=true;if(msg&&(out.at(-1)?.text!==msg||out.at(-1)?.kind!==kind))out.push({role:p.role,kind,text:msg})}
   }
  }else if(x.sessionId===s.id&&!x.isSidechain){
   cwd=x.cwd||cwd;
   if(['user','assistant'].includes(x.type)){
    const msg=x.type==='user'?userText(text(x.message?.content)):text(x.message?.content);
    if(msg){out.push({role:x.type,kind:x.type==='user'?'user':'assistant',text:msg});if(x.type==='assistant')last=x.uuid||x.timestamp||last}
   }
  }
  if(out.length>200)out.splice(0,out.length-200);
 }
 return {firstUser,messages:out.slice(-200).map(m=>({...m,text:m.text.slice(0,32000)})),last,cwd,busy:s.tool==='codex'&&!!lastStarted&&lastStarted!==lastEnd};
}
function readCodexTitles(){
 const titles=new Map();let data;try{data=fs.readFileSync(path.join(codexHome(),'session_index.jsonl'),'utf8')}catch{return titles}
 const lines=data.split('\n');lines.pop();
 for(const line of lines){const x=json(line);if(!x||!ID.test(x.id||'')||typeof x.thread_name!=='string'||!x.thread_name.trim())continue;const t=Date.parse(x.updated_at),prev=titles.get(x.id);if(!prev||!Number.isFinite(t)||!Number.isFinite(prev.time)||t>=prev.time)titles.set(x.id,{name:x.thread_name.trim(),time:t})}
 return titles;
}
const summaryCache=new Map();
function list(){
 const result=[],seen=new Set();const titles=readCodexTitles();
 for(const tool of ['codex','claude']){
  const candidates=[];
  for(const file of files(root(tool))){
   if(tool==='claude'&&path.basename(path.dirname(file))==='subagents')continue;
   const id=path.basename(file).match(/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\.jsonl$/i)?.[1];
   if(!id||(tool==='codex'&&!path.basename(file).startsWith('rollout-')))continue;
   try{candidates.push({id,tool,file,time:fs.statSync(file).mtimeMs})}catch{}
  }
  for(const s of candidates.sort((a,b)=>b.time-a.time)){
   seen.add(s.file);
   try{
    const st=fs.statSync(s.file), stamp=st.mtimeMs+':'+st.size;
    let cached=summaryCache.get(s.file);
    if(!cached||cached.stamp!==stamp){
     const h=history(s); if(!h.cwd||!h.messages.length){summaryCache.set(s.file,{stamp,invalid:true});continue;}
     const raw=(s.tool==='codex'?h.firstUser:h.messages.find(m=>m.role==='user')?.text||'')?.replace(/\s+/g,' ').trim()||'';
     cached={stamp,cwd:h.cwd,fallback:raw.slice(0,80),description:raw.slice(80,220),last:h.last,busy:h.busy};summaryCache.set(s.file,cached);
    }
    if(cached.invalid)continue;
    result.push({...s,...cached,title:(s.tool==='codex'&&titles.get(s.id)?.name)||cached.fallback||path.win32.basename(cached.cwd)||'未命名對話'});
   }catch{}
  }
 }
 for(const file of summaryCache.keys())if(!seen.has(file))summaryCache.delete(file);
 return result.sort((a,b)=>b.time-a.time);
}
function codexFinish(event,id,turn){
 if(!turn||event?.threadId!==id||event.turn?.id!==turn)return null;
 return event.turn.status==='completed';
}
function claudeFinish(event,id,exit){
 return exit===0&&event?.type==='result'&&event.session_id===id&&event.subtype==='success'&&event.is_error===false;
}
function codexWorkspacePolicy(cwd){return {type:'workspaceWrite',writableRoots:[cwd],networkAccess:false}}
function claudeArgs(id,prompt,options={}){return ['--resume',id,'--print','--verbose','--output-format','stream-json','--tools','Read,Edit,Write','--permission-mode','acceptEdits','--permission-prompts','none',...(options.model?['--model',options.model]:[]),'--',prompt]}
function codex(s,prompt,options={}){
 return new Promise((resolve,reject)=>{
  const p=spawn(resolveCodexExe(),['app-server','-c','sandbox_mode="workspace-write"','-c','approval_policy="never"'],{cwd:s.cwd,stdio:['pipe','pipe','ignore'],windowsHide:true});
  let turn,done=false;
  const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);p.kill();error?reject(error instanceof Error?error:new Error(error)):resolve({turn})};
  const timer=setTimeout(()=>finish('等候逾時，請查看原聊天室確認狀態。'),20*60*1000);
  p.on('error',error=>finish(codexSpawnError(error)));
  p.stdin.on('error',()=>finish('無法連到 Codex。'));
  p.on('exit',()=>finish('Codex 連線在任務完成前結束。'));
  const send=(method,params,id)=>p.stdin.write(JSON.stringify({jsonrpc:'2.0',method,params,id})+'\n');
  const lines=readline.createInterface({input:p.stdout});
  lines.on('line',line=>{
   if(done)return;const x=json(line);if(!x)return;
   if(x.error&&[1,2,3].includes(x.id)){const error=new Error(codexRpcError(x.id,x.error));if(writerConflict(x.id,x.error))error.code='CODEX_WRITER_CONFLICT';return finish(error)}
   if(x.id===1){send('initialized',{});send('thread/resume',{threadId:s.id,sandbox:'workspace-write',cwd:s.cwd,approvalPolicy:'never'},2)}
   if(x.id===2){
    if(x.result?.thread?.id!==s.id)return finish('Codex 回傳了不同聊天室，已停止。');
    if(x.result.thread.status?.type==='active')return finish('原聊天室仍在執行，請稍後。');
    send('turn/start',{threadId:s.id,input:[{type:'text',text:prompt}],cwd:s.cwd,sandboxPolicy:codexWorkspacePolicy(s.cwd),approvalPolicy:'never',...options},3);
   }
   if(x.id===3){turn=x.result?.turn?.id;if(!turn)return finish('Codex 沒有回傳任務 ID。')}
   if(x.method==='turn/completed'){
    const ok=codexFinish(x.params,s.id,turn);
    if(ok!==null)finish(ok?null:'Codex 任務失敗或中斷。');
   }
   if(x.method&&x.id!==undefined&&!([1,2,3].includes(x.id)&&x.result)){
    p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:x.id,error:{code:-32601,message:'Interactive requests unavailable'}})+'\n');
   }
  });
  send('initialize',{clientInfo:{name:'maxagent',version:'0.1.0'}},1);
 });
}
function claude(s,prompt,exe,options={}){
 return new Promise((resolve,reject)=>{
  const p=spawn(exe,claudeArgs(s.id,prompt,options),{cwd:s.cwd,windowsHide:true,stdio:['ignore','pipe','ignore']});
  let result,done=false;
  const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);if(error){p.kill();reject(new Error(error))}else resolve({result:result.result})};
  const timer=setTimeout(()=>finish('等候逾時，請查看原聊天室確認狀態。'),20*60*1000);
  p.on('error',()=>finish('找不到 Claude Code CLI。請在工作台點「設定 Claude CLI」選擇 claude.exe，或設定 MAXAGENT_CLAUDE_CLI；也請確認工作目錄存在。'));
  readline.createInterface({input:p.stdout}).on('line',line=>{const x=json(line);if(x?.type==='result')result=x});
  p.on('close',code=>finish(claudeFinish(result,s.id,code)?null:'Claude Code 未成功完成。請檢查 CLI、登入及原聊天室。'));
 });
}
module.exports={ID,list,history,codex,claude,codexFinish,claudeFinish,codexWorkspacePolicy,claudeArgs};

