const {cleanPeerMessage}=require('./claude-peer');
const {codexSpawnError,codexRpcError,writerConflict}=require('./codex-error');
const {resolveCodexExe}=require('./codex-cli');
const dsh=require('./adapters/dsh').createDshAdapter();
const opencode=require('./adapters/opencode').createOpenCodeAdapter();
const readOnlyAdapters=new Map([['dsh',dsh],['opencode',opencode]]);
const fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const {spawn}=require('node:child_process'), readline=require('node:readline'), {StringDecoder}=require('node:string_decoder');
const {createSummaryReader}=require('./session-summary');
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
function modelName(value){return typeof value==='string'&&/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(value)&&!/^(unknown|none|null|default|n\/a|<.*>)$/i.test(value)?value:null}
function history(s){
 if(readOnlyAdapters.has(s.tool))return readOnlyAdapters.get(s.tool).history(s);
 if(!['codex','claude'].includes(s.tool))return {messages:[],last:null,busy:false,historyUnavailable:true};
 const out=[];let lastStarted=null, lastEnd=null, last=null, cwd=null,firstUser=null,finalSeen=false,codexTurn=null,matchingSession=false,wrongSession=false,modelEvidence={status:'unknown'},turnModel=null;
 function addUser(value){const msg=codexUserText(value);if(!msg)return;if(!firstUser)firstUser=msg;if(out.at(-1)?.text!==msg)out.push({role:'user',kind:'user',text:msg})}
 for(const line of fileLines(s.file)){
  const x=json(line);if(!x)continue;
  if(s.tool==='codex'){
   const p=x.payload||{};
   if(x.type==='session_meta'){if(p.id===s.id&&!wrongSession){cwd=p.cwd||cwd;matchingSession=true}else{wrongSession=true;matchingSession=false}}
   if(x.type==='event_msg'){
    if(p.type==='task_started'){lastStarted=p.turn_id;finalSeen=false;turnModel=null;codexTurn=typeof p.turn_id==='string'&&p.turn_id?{id:p.turn_id,status:'running'}:null}
    if(['task_complete','turn_aborted'].includes(p.type)){lastEnd=p.turn_id;if(codexTurn&&p.turn_id===codexTurn.id){if(p.type==='task_complete'&&modelEvidence.turnId===p.turn_id&&turnModel)modelEvidence={...modelEvidence,status:'configured',source:'turn_context',model:turnModel};codexTurn={id:codexTurn.id,status:p.type==='task_complete'?'completed':'aborted'}}else codexTurn=null;if(p.type==='task_complete'&&(finalSeen||(typeof p.last_agent_message==='string'&&p.last_agent_message.trim())))last=x.timestamp||last}
    if(p.type==='user_message'&&typeof p.message==='string')addUser(p.message);
   }
   if(x.type==='turn_context'&&codexTurn&&p.turn_id===codexTurn.id)turnModel=modelName(p.model);
   if(x.type==='response_item'&&p.type==='message'&&['user','assistant'].includes(p.role)){
    if(p.role==='user')addUser(text(p.content));else {const msg=text(p.content),kind=p.phase==='commentary'?'progress':p.phase==='final_answer'?'final':'assistant';if(kind==='final'&&msg){finalSeen=true;modelEvidence={status:'unknown',replyId:typeof p.id==='string'?p.id:null,turnId:codexTurn?.id||null}}if(msg&&(out.at(-1)?.text!==msg||out.at(-1)?.kind!==kind))out.push({role:p.role,kind,text:msg})}
   }
  }else if(x.sessionId===s.id&&!x.isSidechain){
   cwd=x.cwd||cwd;
   if(['user','assistant'].includes(x.type)){
    const msg=x.type==='user'?userText(cleanPeerMessage(text(x.message?.content))):text(x.message?.content);
    if(x.type==='assistant'&&msg&&x.message?.stop_reason==='end_turn'&&!x.isApiErrorMessage&&!x.is_error&&!x.parent_tool_use_id){const model=modelName(x.message?.model);modelEvidence={status:model?(/^claude-(opus|sonnet|haiku)-\d/i.test(model)?'reported':'alias'):'unknown',source:'message.model',replyId:typeof x.uuid==='string'?x.uuid:null,...(model?{model}:{})}}
    if(msg){out.push({role:x.type,kind:x.type==='user'?'user':'assistant',text:msg});if(x.type==='assistant')last=x.uuid||x.timestamp||last}
   }
  }
  if(out.length>200)out.splice(0,out.length-200);
 }
 return {firstUser,messages:out.slice(-200).map(m=>({...m,text:m.text.slice(0,32000)})),last,cwd,busy:s.tool==='codex'&&!!lastStarted&&lastStarted!==lastEnd,matchingSession,codexTurn:matchingSession?codexTurn:null,modelEvidence:s.tool==='codex'&&!matchingSession?{status:'unknown'}:modelEvidence};
}
function readCodexIndex(){
 let names;try{names=fs.readdirSync(codexHome()).filter(n=>/^state_\d+\.sqlite$/.test(n)).sort((a,b)=>Number(b.match(/\d+/)[0])-Number(a.match(/\d+/)[0]))}catch{return new Map()}
 for(const name of names){let db;try{const {DatabaseSync}=require('node:sqlite');db=new DatabaseSync(path.join(codexHome(),name),{readOnly:true});const rows=db.prepare('select id, rollout_path from threads').all(),map=new Map();for(const row of rows)if(ID.test(row.id||'')&&typeof row.rollout_path==='string')map.set(row.id.toLowerCase(),row.rollout_path);return map}catch{}finally{db?.close()}}
 return new Map();
}
function safeSessionPath(file,sessionRoot){try{if(process.platform==='win32'){file=file.replace(/^\\\\\?\\UNC\\/i,'\\\\').replace(/^\\\\\?\\([a-z]:\\)/i,'$1')}const rootReal=fs.realpathSync(sessionRoot),fileReal=fs.realpathSync(file),relative=path.relative(rootReal,fileReal);if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||!fileReal.toLowerCase().endsWith('.jsonl'))return null;return fileReal}catch{return null}}
function readCodexTitles(){
 const titles=new Map();let data;try{data=fs.readFileSync(path.join(codexHome(),'session_index.jsonl'),'utf8')}catch{return titles}
 const lines=data.split('\n');lines.pop();
 for(const line of lines){const x=json(line);if(!x||!ID.test(x.id||'')||typeof x.thread_name!=='string'||!x.thread_name.trim())continue;const t=Date.parse(x.updated_at),prev=titles.get(x.id);if(!prev||!Number.isFinite(t)||!Number.isFinite(prev.time)||t>=prev.time)titles.set(x.id,{name:x.thread_name.trim(),time:t})}
 return titles;
}
const summaryCache=new Map();
const summaryReader=createSummaryReader({text,userText,codexUserText,modelName});
function summarize(s){
 const st=fs.statSync(s.file),stamp=[s.id,st.dev,st.ino,st.birthtimeMs,st.ctimeMs,st.mtimeMs,st.size].join(':');
 let cached=summaryCache.get(s.file);
 if(!cached||cached.stamp!==stamp){const state=summaryReader.update(s,cached?.state);cached={stamp,state,...summaryReader.result(state)};summaryCache.set(s.file,cached)}
 const {state,...summary}=cached;return summary;
}
function list(){
 const result=[],seen=new Set();const titles=readCodexTitles(),index=readCodexIndex();
 for(const tool of ['codex','claude']){
  const candidates=[],claimed=new Set();
  if(tool==='codex')for(const [id,indexPath] of index){const file=safeSessionPath(indexPath,root(tool));if(!file||claimed.has(file.toLowerCase()))continue;try{candidates.push({id,tool,file,time:fs.statSync(file).mtimeMs});claimed.add(file.toLowerCase())}catch{}}
  for(const file of files(root(tool))){
   if(tool==='claude'&&path.basename(path.dirname(file))==='subagents')continue;
   const id=path.basename(file).match(/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\.jsonl$/i)?.[1];
   if(!id||(tool==='codex'&&!path.basename(file).startsWith('rollout-')))continue;
   if(tool==='codex'){const real=safeSessionPath(file,root(tool));if(!real||claimed.has(real.toLowerCase())||index.has(id.toLowerCase()))continue;claimed.add(real.toLowerCase());try{candidates.push({id,tool,file:real,time:fs.statSync(real).mtimeMs})}catch{};continue}
   try{candidates.push({id,tool,file,time:fs.statSync(file).mtimeMs})}catch{}
  }
  for(const s of candidates.sort((a,b)=>b.time-a.time)){
   seen.add(s.file);
   try{
    const summary=summarize(s);
    if(summary.invalid)continue;
    result.push({...s,...summary,title:(s.tool==='codex'&&titles.get(s.id)?.name)||summary.fallback||path.win32.basename(summary.cwd)||'未命名對話'});
   }catch{}
  }
 }
 for(const file of summaryCache.keys())if(!seen.has(file))summaryCache.delete(file);
 for(const adapter of readOnlyAdapters.values())result.push(...adapter.list());
 return result.sort((a,b)=>b.time-a.time);
}
function codexFinish(event,id,turn){
 if(!turn||event?.threadId!==id||event.turn?.id!==turn)return null;
 return event.turn.status==='completed';
}
function claudeFinish(event,id,exit){
 return exit===0&&event?.type==='result'&&event.session_id===id&&event.subtype==='success'&&event.is_error===false&&(event.stop_reason==null||event.stop_reason==='end_turn');
}
function codexWorkspacePolicy(cwd){return {type:'workspaceWrite',writableRoots:[cwd],networkAccess:false}}
function claudeArgs(id,prompt,options={}){return ['--resume',id,'--print','--verbose','--output-format','stream-json','--tools','Read,Edit,Write','--permission-mode','acceptEdits','--permission-prompts','none',...(options.model?['--model',options.model]:[]),'--',prompt]}
function claudeServiceAlert(row){
 if(row?.type==='assistant'&&row.isApiErrorMessage===true&&(row.error==='server_error'||Number(row.apiErrorStatus)>=500&&Number(row.apiErrorStatus)<=599))return 'Claude Code 連線的服務回報伺服器錯誤，尚未取得本輪回覆。';
 if(row?.type!=='system'||row.subtype!=='api_error')return null;
 const reason=String(row.error?.message||row.error?.formatted||'').slice(0,4096),status=row.error?.status;
 if(status===429&&(/\bAccountQuotaExceeded\b/i.test(reason)||/weekly usage quota/i.test(reason))){
  const reset=reason.match(/reset at (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \+0800\b/i)?.[1];
  return 'Claude Code 目前連線的每週用量已用完。'+(reset?'服務回報於 '+reset+'（UTC+8）重設。':'請到原工具查看配額重設時間。');
 }
 if(status===429)return 'Claude Code 目前的連線遇到用量或速率限制（429）。';
 if(status===401||status===403)return 'Claude Code 目前的連線認證或權限被拒絕（'+status+'）。';
 if(Number(status)>=500&&Number(status)<=599)return 'Claude Code 連線的服務回報伺服器錯誤，尚未取得本輪回覆。';
 return null;
}
function watchClaudeService(s,prompt,offset,onAlert){
 let pos=offset,pending=Buffer.alloc(0),matched=false,closed=false,last='',source;
 const poll=()=>{
  if(closed)return;
  let fd;try{
   fd=fs.openSync(s.file,'r');const st=fs.fstatSync(fd),identity=[st.dev,st.ino,st.birthtimeMs].join(':');
   if(st.size<pos||source&&source!==identity){closed=true;return}
   source=identity;if(st.size===pos)return;
   const b=Buffer.alloc(Math.min(st.size-pos,128*1024)),n=fs.readSync(fd,b,0,b.length,pos);if(!n)return;pos+=n;
   let data=Buffer.concat([pending,b.subarray(0,n)]),end;
   while((end=data.indexOf(10))>=0){
    const row=json(data.subarray(0,end).toString('utf8'));data=data.subarray(end+1);
    if(row?.sessionId!==s.id||row.isSidechain)continue;
    if(row.type==='user'&&!row.isMeta&&text(row.message?.content).trim()){
     if(matched){closed=true;break}
     if(text(row.message.content).trim()!==prompt){closed=true;break}
     matched=true;
    }else if(matched){
     if(row.type==='assistant'&&!row.isApiErrorMessage&&row.message?.stop_reason==='end_turn'){closed=true;break}
     const alert=claudeServiceAlert(row);
     if(alert&&alert!==last){last=alert;onAlert(alert)}
    }
   }
   if(data.length>2*1024*1024)closed=true;else pending=data;
  }catch{}finally{if(fd!==undefined)try{fs.closeSync(fd)}catch{}}
 };
 const timer=setInterval(poll,750);timer.unref?.();
 return ()=>{poll();closed=true;clearInterval(timer)};
}
function codex(s,prompt,options={},onPhase=()=>{},receiptTimeoutMs=30000){
 return new Promise((resolve,reject)=>{
  let p;try{p=spawn(resolveCodexExe(),['app-server','-c','sandbox_mode="workspace-write"','-c','approval_policy="never"'],{cwd:s.cwd,stdio:['pipe','pipe','ignore'],windowsHide:true})}catch(e){e.sendPhase='not_sent';return reject(e)}
  let turn,done=false,sent=false;
  const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(receiptTimer);p.kill();if(error){const e=error instanceof Error?error:new Error(error);e.sendPhase||=sent?'possibly_sent':'not_sent';if(turn)e.turn=turn;reject(e)}else resolve({turn})};
  const timer=setTimeout(()=>finish('等候逾時，請查看原聊天室確認狀態。'),20*60*1000);
  const receiptTimer=setTimeout(()=>finish(sent?'Codex 未回傳本輪接收確認。請先查看 Codex 原對話，勿重送。':'等候 Codex 恢復原對話逾時；任務未送出。'),receiptTimeoutMs);
  p.on('error',error=>finish(codexSpawnError(error)));
  p.stdin.on('error',()=>finish('無法連到 Codex。'));
  p.on('exit',()=>finish('Codex 連線在任務完成前結束。'));
  const send=(method,params,id)=>p.stdin.write(JSON.stringify({jsonrpc:'2.0',method,params,id})+'\n');
  const lines=readline.createInterface({input:p.stdout});
  lines.on('line',line=>{
   if(done)return;const x=json(line);if(!x)return;
   if(x.error&&[1,2,3].includes(x.id)){const error=new Error(codexRpcError(x.id,x.error));if(writerConflict(x.id,x.error))error.code='CODEX_WRITER_CONFLICT';if(x.id===3&&x.error.code===-32602&&!turn)error.sendPhase='not_sent';return finish(error)}
   if(x.id===1){send('initialized',{});send('thread/resume',{threadId:s.id,sandbox:'workspace-write',cwd:s.cwd,approvalPolicy:'never'},2)}
   if(x.id===2){
    if(x.result?.thread?.id!==s.id)return finish('Codex 回傳了不同聊天室，已停止。');
    if(x.result.thread.status?.type==='active')return finish('原聊天室仍在執行，請稍後。');
    sent=true;onPhase({phase:'possibly_sent'});send('turn/start',{threadId:s.id,input:[{type:'text',text:prompt}],cwd:s.cwd,sandboxPolicy:codexWorkspacePolicy(s.cwd),approvalPolicy:'never',...options},3);
   }
   if(x.id===3){turn=x.result?.turn?.id;if(!turn)return finish('Codex 沒有回傳任務 ID。');clearTimeout(receiptTimer);onPhase({phase:'accepted',turn})}
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
function claude(s,prompt,exe,options={},onPhase=()=>{},offset){
 return new Promise((resolve,reject)=>{
  let p;try{p=spawn(exe,claudeArgs(s.id,prompt,options),{cwd:s.cwd,windowsHide:true,stdio:['ignore','pipe','ignore']})}catch(e){e.sendPhase='not_sent';return reject(e)}
  let result,done=false,spawned=false,stopWatching,serviceAlert;const messages=[];
  const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);stopWatching?.();if(error){p.kill();const e=new Error(serviceAlert||error);e.sendPhase=spawned?'possibly_sent':'not_sent';reject(e)}else {const matched=messages.filter(m=>m.text===result.result?.trim());const ids=[...new Set(matched.map(m=>m.id).filter(Boolean))];resolve({result:result.result,...(ids.length===1?{messageId:ids[0]}:{})})}};
  const timer=setTimeout(()=>finish('等候逾時，請查看原聊天室確認狀態。'),20*60*1000);
  p.on('error',()=>finish('找不到 Claude Code CLI。請在工作台點「設定 Claude CLI」選擇 claude.exe，或設定 MAXAGENT_CLAUDE_CLI；也請確認工作目錄存在。'));
  p.on('spawn',()=>{spawned=true;onPhase({phase:'possibly_sent'});if(Number.isSafeInteger(offset)&&offset>=0)stopWatching=watchClaudeService(s,prompt,offset,alert=>{serviceAlert=alert;onPhase({alert})})});
  readline.createInterface({input:p.stdout}).on('line',line=>{const x=json(line);if(x?.type==='result')result=x;else if(x?.type==='assistant'&&x.session_id===s.id&&!x.is_error&&!x.parent_tool_use_id&&(x.message?.stop_reason==null||x.message.stop_reason==='end_turn')){const value=text(x.message?.content).trim();if(value)messages.push({id:typeof x.message?.id==='string'?x.message.id:null,text:value})}});
  p.on('close',code=>finish(claudeFinish(result,s.id,code)?null:'Claude Code 未成功完成。請檢查 CLI、登入及原聊天室。'));
 });
}
module.exports={ID,list,history,summarize,codex,claude,codexFinish,claudeFinish,codexWorkspacePolicy,claudeArgs,watchClaudeService};

