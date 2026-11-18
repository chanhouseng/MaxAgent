const {app,BrowserWindow,ipcMain,Notification,dialog,clipboard,shell,screen}=require('electron');
const path=require('node:path'), fs=require('node:fs');
const h=require('./harness');
const openCodeDesktop=require('./adapters/opencode').createDesktopService();
const {readResult,waitResult}=require('./result-evidence');
const codexQueue=require('./codex-queue');
const codexDesktop=require('./codex-desktop');
const dshLink=require('./dsh-link').createClient();
const {configure:configureDshLink}=require('./dsh-link-setup');
const {projectPetState,createCodexPetTracker,recordPetCompletion,clearPetCompletionsForRunning}=require('./pet-state');
const {createClaudePetTracker}=require('./claude-pet-events');
const {createDispatchStore,queueRemoved,hasUnresolvedPeer,canAcknowledge}=require('./dispatch-store');
const {getClaudeHook,setClaudeHook}=require('./claude-hook-settings');
const {getCodexHook,setCodexHook}=require('./codex-hook-settings');
const {createCodexWatch}=require('./codex-watch');
const crypto=require('node:crypto');
const {ensureShortcut}=require('./windows-shortcut');
const net=require('node:net'),claudePetPipe=require('./claude-pet-pipe');
const os=require('node:os');
const {createRefreshGate}=require('./refresh-gate');
const {codexModels,validateSelection,claudeModels,validateClaudeSelection}=require('./model-settings');
const {readDesktopModel,resolveDesktopModel}=require('./claude-desktop-model');
const claudePeer=require('./claude-peer');
const {readPage}=require('./history-pages');
const {openClaudeChat}=require('./claude-open');
const {locales,setLanguage,t}=require('./i18n');
require('./i18n-messages');
const validating=new Set();

const {createCompletionRouter,createNativeNotifications}=require('./notifications');
let win, petWindow, petTracker, claudePetTracker, claudePetServer, codexStopServer, claudeServerClosing=false, claudeHookActive=false, trackingTimer, dispatchStore, stateReadFailure=false, quitting=false, closingReady=false, suppressPetClose=false, petLast="", petRevision=0, petLayout=null, stateFile, state={read:{},settings:{}}, sessions=new Map();
let shortcutStatus={ok:false,error:'尚未核對開始選單捷徑。'};
const jobs=new Map(),petCompleted=[];
const peerEvidenceCache=new WeakMap();
function readClaudeReceipt(session,attempt){
 const stat=fs.statSync(session.file,{bigint:true}),stamp=[session.file,stat.ino,stat.size,stat.mtimeNs].join(':');
 const cached=peerEvidenceCache.get(attempt);
 if(cached?.stamp===stamp)return cached.evidence;
 const evidence=claudePeer.readPeerEvidence(session,attempt.offset,attempt.peer.ticket);
 peerEvidenceCache.set(attempt,{stamp,evidence});
 return evidence;
}
function showDispatchAlert(session,message,reason){
 if(!win||win.isDestroyed())return;
 const tool={claude:'Claude Code',codex:'Codex',dsh:'DSH'}[session.tool];
 void dialog.showMessageBox(win,{type:'warning',title:'MaxAgent · '+tool,message:t(message),
  detail:[session.title||t('未命名對話'),t(reason)].join('\n\n'),buttons:[t('確定')],noLink:true}).catch(()=>{});
}
const key=(tool,id)=>tool+':'+id;
const canResume=tool=>tool==='codex'||tool==='claude';
const supportsSession=(s,dshPaired)=>canResume(s.tool)||(s.tool==='opencode'&&s.source==='desktop')||(s.tool==='dsh'&&(dshPaired??dshLink.configured()));
const supportsDraft=s=>s.tool==='dsh'||supportsSession(s);
const claudeExe=()=>state.settings.claudeExe||process.env.MAXAGENT_CLAUDE_CLI||(fs.existsSync(path.join(__dirname,'..','runtime','claude','claude.exe'))?path.join(__dirname,'..','runtime','claude','claude.exe'):'claude.exe');
const claudeSettings=()=>path.join(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'),'settings.json');
const claudeHookCommand=()=>`powershell.exe -NoProfile -NonInteractive -File "${path.join(__dirname,'claude-pet-hook.ps1').replace(/\\/g,'/')}"`;
const codexHookFile=()=>path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'hooks.json');
const codexHookCommand=()=>`powershell.exe -NoProfile -NonInteractive -File "${path.join(__dirname,'codex-stop-hook.ps1').replace(/\\/g,'/')}"`;
function save(){if(stateReadFailure)throw Error('本機設定無法讀取，為保護資料暫停保存及派工。');fs.writeFileSync(stateFile+'.tmp',JSON.stringify(state),'utf8');fs.renameSync(stateFile+'.tmp',stateFile)}
function load(){try{const v=JSON.parse(fs.readFileSync(stateFile,'utf8'));state={...v,read:v.read||{},settings:v.settings||{}}}catch(e){if(e.code!=='ENOENT')stateReadFailure=true}dispatchStore=createDispatchStore(state,save);for(const [k,attempts] of Object.entries(state.attempts||{})){const a=attempts.at(-1);if(a)jobs.set(k,{...a,turn:a.turn||a.receipt?.turn,status:['running','confirming'].includes(a.status)?'result_unavailable':a.status})}}
const quickTracker=createCodexPetTracker();
function observePet(sessions,partial=false){const finished=petTracker.observe(sessions,jobs,partial);clearPetCompletionsForRunning(petCompleted,petTracker.takeStarted().map(key=>({key})));return finished}
const codexWatch=createCodexWatch(k=>{const s=sessions.get(k);if(!s||s.tool!=='codex')return;const one=new Map([[k,s]]),finished=quickTracker.observe(one,jobs,true),running=quickTracker.running(one).length>0,changed=!!s.observedRunning!==running;quickTracker.takeStarted();s.observedRunning=running;if(petTracker)for(const item of observePet(one,true))completed(item);updatePet();if(finished.length){const item=finished.at(-1);s.busy=false;s.codexTurn={id:item.turn,status:'completed'};if(item.marker)s.last=item.marker}if((finished.length||changed)&&win&&!win.isDestroyed())win.webContents.send('agent:sessionUpdated',{key:k,tool:s.tool,title:s.title,description:s.description,cwd:s.cwd,time:s.time,busy:s.busy,observedRunning:running,unread:!!s.last&&state.read[k]!==s.last,job:jobFor(k),canResume:true,readHistory:true,canDetectCompletion:true})});
function refresh(){sessions=new Map(h.list().map(s=>[key(s.tool,s.id),s]));quickTracker.observe(sessions,jobs);quickTracker.takeStarted();const running=new Set(quickTracker.running(sessions).map(x=>x.key));for(const [k,s] of sessions)s.observedRunning=running.has(k);if(petTracker)for(const item of observePet(sessions))completed(item);codexWatch.sync(sessions);syncTracking();updatePet()}
const refreshGate=createRefreshGate(refresh);
function get(k){if(typeof k!=='string'||!sessions.has(k))throw Error('找不到這個聊天室，請重新整理。');return sessions.get(k)}
async function openCodexChat(k){const session=sessions.get(k);if(session?.tool!=='codex'||!(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i).test(session.id))return false;try{await shell.openExternal('codex://threads/'+session.id);return true}catch{return false}}
function jobFor(k){const job=jobs.get(k),all=dispatchStore.unresolved(k),pending=all.filter(a=>!a.acknowledged),count=pending.length,active=['running','confirming'].includes(job?.status)?job.id:null,pendingCount=pending.filter(a=>a.id!==active).length,canReviewResend=pending.some(a=>queueRemoved(a)&&!a.resendApproved&&!a.resendBlocked),canAcknowledgePending=pending.some(a=>a.id!==active&&canAcknowledge(a)),current=all.find(a=>a.id===job?.id),reviewed=current?.acknowledged&&job?.status==='result_unavailable';return job?{...job,...(reviewed?{status:'reviewed_unknown',serviceAlert:null}:{}),queueRemoved:queueRemoved(job),resendApproved:current?.resendApproved===true,resendBlocked:current?.resendBlocked===true,canReviewResend,canAcknowledgePending,unresolvedCount:count,pendingCount}:count?{status:'result_unavailable',canReviewResend,canAcknowledgePending,unresolvedCount:count,pendingCount}:null}
const dshTracking=new Set();
function publishDsh(k){if(win&&!win.isDestroyed())win.webContents.send('agent:changed',k)}
async function reconcileDsh(k,s){
 if(dshTracking.has(k)||!dshLink.configured())return;
 const attempts=dispatchStore.unresolved(k).filter(a=>a.dsh&&!a.dsh.terminal);
 if(!attempts.length)return;
 dshTracking.add(k);
 try{
  for(const a of attempts){
   const job=jobs.get(k);
   // Never race the submission with transcript verification.
   if(job?.id===a.id&&job.status==='running')continue;
   let r;try{r=await dshLink.result(s,a.id,a.dsh.seq)}catch{r={state:'unknown'}}
   let updated;
   if(r.state==='completed'){
    updated=dispatchStore.complete(k,a.id,r);
   }else if(r.state==='failed'){
    updated=dispatchStore.mark(k,a.id,{status:'result_unavailable',phase:'accepted',turn:r.turn,dsh:{...a.dsh,terminal:true},error:'DSH 已收到任務，但這一輪失敗或中斷，沒有標為完成。'});
    if(job?.id===a.id)showDispatchAlert(s,'DSH 任務沒有完成',updated.error);
   }else if(r.state==='running'&&a.phase!=='accepted'){
    updated=dispatchStore.mark(k,a.id,{status:'confirming',phase:'accepted',turn:r.turn,error:null});
   }else if(r.state==='queued'&&a.phase==='possibly_sent'){
    updated=dispatchStore.mark(k,a.id,{status:'queued',phase:'queued',error:null});
   }else if(['queued','confirming'].includes(a.status)&&Date.now()-a.time>20*60*1000){
    updated=dispatchStore.mark(k,a.id,{status:'result_unavailable',error:'DSH 已接收，但尚未確認本輪結果。請查看 DSH 原對話，勿重送。'});
    if(job?.id===a.id)showDispatchAlert(s,'DSH 結果尚未確認',updated.error);
   }
   if(updated){if(job?.id===a.id)jobs.set(k,updated);publishDsh(k)}
  }
 }finally{dshTracking.delete(k)}
}
async function sendDsh(k,s,prompt){
 if(validating.has(k)||dispatchStore.unresolved(k).some(a=>a.dsh&&!a.dsh.terminal))throw Error('這個 DSH 對話有一筆未結束的派工。請先查看原對話及本輪狀態，勿重送。');
 validating.add(k);
 let start,attempt,options;
 try{
  const selected={...(state.settings.chatModels?.[k]||{})};
  if(selected.model){const data=await dshLink.models(s);if(!data.context||state.settings.chatModelContexts?.[k]!==data.context)throw Error('DSH 供應商或模型清單已變更，請重新選擇；任務未送出。');options=validateSelection(selected,data.models);options.context=data.context}

  start=await dshLink.probe(s);
  attempt=dispatchStore.begin(k,0,prompt);
  dispatchStore.mark(k,attempt.id,{dsh:{seq:start.seq},phase:'possibly_sent'});
 }finally{validating.delete(k)}
 const job={...attempt,status:'running'};jobs.set(k,job);publishDsh(k);
 setImmediate(async()=>{
  let changes;
  try{await dshLink.send(s,attempt.id,start.seq,prompt,start.owner,options);changes={status:'queued',phase:'queued'}}
  catch(e){changes={status:e.sendPhase==='not_sent'?'failed':'result_unavailable',phase:e.sendPhase==='not_sent'?'not_sent':'possibly_sent',error:e.message}}
  try{dispatchStore.mark(k,attempt.id,changes)}catch{changes={status:'result_unavailable',phase:'possibly_sent',error:'無法保存 DSH 派工狀態，請勿重送。'}}
  Object.assign(job,changes);publishDsh(k);
  if(changes.error)showDispatchAlert(s,changes.status==='failed'?'DSH 沒有收到本次任務':'無法確認 DSH 是否收到本次任務',changes.error);
  else void reconcileDsh(k,s).catch(()=>{});
 });
 return true;
}
function reconcileResults(k,session){
 const job=jobs.get(k);
 for(const attempt of dispatchStore.unresolved(k)){
  if(attempt.peer?.ticket){
   if(['running','confirming'].includes(job?.status)&&job.id===attempt.id)continue;
   try{
    const evidence=readClaudeReceipt(session,attempt);
    if(evidence?.result){
     const confirmed=dispatchStore.complete(k,attempt.id,evidence.result);
     if(job?.id===attempt.id)jobs.set(k,confirmed);
    }else if(evidence?.received&&!attempt.receipt?.turn){
     const updated=dispatchStore.mark(k,attempt.id,{phase:'accepted',receipt:{turn:evidence.received},error:'Claude 原對話已收到本輪任務，尚未確認結果。'});
     if(job?.id===attempt.id)Object.assign(job,updated,{turn:evidence.received});
    }
   }catch{/* Preserve the unresolved attempt while its original record is unavailable. */}
   continue;
  }
  if(attempt.desktopClientId){
   if(job?.id===attempt.id&&job.status==='running')continue;
   try{
    const evidence=codexQueue.readQueuedTurn(session,attempt.offset,attempt.desktopClientId,attempt.desktopSelection);
    if(evidence?.state==='completed'&&(!attempt.receipt?.turn||attempt.receipt.turn===evidence.turn)){
     const confirmed=dispatchStore.complete(k,attempt.id,evidence);
     if(job?.id===attempt.id)jobs.set(k,confirmed);
     completed({key:k,tool:'codex',title:session.title||'未命名對話',status:'completed',time:Date.now(),turn:evidence.turn,source:'maxagent'});
    }else if(attempt.status!=='result_unavailable'||!attempt.error){
     const error=evidence?.turn&&attempt.receipt?.turn&&attempt.receipt.turn!==evidence.turn?'Codex 回執與原對話輪次不一致，請勿重送。':evidence?.state==='interrupted'?'Codex 已收到任務，但本輪中斷。':evidence?.state==='model_unconfirmed'?'Codex 已回覆，但無法確認同一輪使用所選模型或推理強度。':job?.id===attempt.id&&job.status==='confirming'&&Date.now()-job.time>=120000?'Codex 已接收；尚未確認結果，MaxAgent 會繼續追蹤。':null;
     if(error){const updated=dispatchStore.mark(k,attempt.id,{status:'result_unavailable',error});if(job?.id===attempt.id)jobs.set(k,{...updated,phase:job.phase})}
    }else if(evidence?.turn&&!attempt.receipt?.turn){
     const updated=dispatchStore.mark(k,attempt.id,{phase:'accepted',receipt:{turn:evidence.turn},error:'Codex 原對話已有本輪任務，尚未確認結果。'});
     if(job?.id===attempt.id)Object.assign(job,updated,{turn:evidence.turn});
    }
   }catch{/* Keep tracking if the original record is temporarily unavailable. */}
   continue;
  }
  if(attempt.queue?.clientId){
   try{const evidence=codexQueue.readQueuedTurn(session,attempt.offset,attempt.queue.clientId);if(evidence&&attempt.resendApproved&&!attempt.resendBlocked)dispatchStore.mark(k,attempt.id,{resendBlocked:true});if(evidence?.state==='completed'){const confirmed=dispatchStore.complete(k,attempt.id,evidence);if(job?.id===attempt.id)jobs.set(k,confirmed);completed({key:k,tool:'codex',title:session.title||'未命名對話',status:'completed',time:Date.now(),turn:evidence.turn,source:'maxagent'})}else if(evidence?.state==='received'&&!attempt.receipt?.turn){const updated=dispatchStore.mark(k,attempt.id,{phase:'accepted',receipt:{turn:evidence.turn},...(attempt.status==='queued'?{status:'confirming'}:!queueRemoved(attempt)?{error:'Codex 原對話已有本輪任務，尚未確認結果。'}:{})});if(job?.id===attempt.id)Object.assign(job,updated,{turn:evidence.turn})}}catch{};
   continue;
  }
  if(['running','confirming'].includes(job?.status))continue;
  if(!attempt.receipt?.turn&&!attempt.receipt?.messageId)continue;
  try{
   const evidence=readResult(session,attempt.offset,attempt.receipt);
   if(!evidence)continue;
   const confirmed=dispatchStore.complete(k,attempt.id,evidence);
   if(job?.id===attempt.id)jobs.set(k,confirmed);
  }catch{/* Keep the result unconfirmed if the evidence or state is unavailable. */}
 }
}
function publishClaude(k){const s=sessions.get(k);if(!s||s.tool!=='claude'||!win||win.isDestroyed())return;const running=claudePetTracker?.running(sessions,jobs).includes(k)||false;win.webContents.send('agent:sessionUpdated',{key:k,tool:s.tool,title:s.title,description:s.description,cwd:s.cwd,time:s.time,busy:s.busy,observedRunning:running,unread:!!s.last&&state.read[k]!==s.last,job:jobFor(k),canResume:true,readHistory:true,canDetectCompletion:true})}
function preferences(){return {language:locales.includes(state.settings.language)?state.settings.language:'zh-Hant',theme:state.settings.theme==='dark'?'dark':'light',windowsNotifications:state.settings.windowsNotifications===true,desktopPet:state.settings.desktopPet===true,petMovable:state.settings.petMovable===true}}
function petCorner(pet){const area=screen.getDisplayMatching(win.getBounds()).workArea,bounds=pet.getContentBounds();pet.setContentBounds({...bounds,x:Math.max(area.x,area.x+area.width-bounds.width-12),y:area.y+12})}
const PET_DOT=64;
function resizePet(pet,expanded){
 const bounds=pet.getContentBounds(),previous=petLayout||{};
 const dot={x:bounds.x+(previous.right?bounds.width-PET_DOT:0),y:bounds.y+(previous.bottom?bounds.height-PET_DOT:0),width:PET_DOT,height:PET_DOT};
 const area=screen.getDisplayMatching(dot).workArea;
 const width=expanded?Math.min(312,area.width):PET_DOT,height=expanded?Math.min(356,area.height):PET_DOT;
 const right=expanded&&dot.x+width>area.x+area.width;
 const bottom=expanded&&dot.y+height>area.y+area.height;
 const clamp=(v,start,span,size)=>Math.max(start,Math.min(v,start+span-size));
 pet.setContentBounds({x:clamp(dot.x-(right?width-PET_DOT:0),area.x,area.width,width),y:clamp(dot.y-(bottom?height-PET_DOT:0),area.y,area.height,height),width,height});
 return petLayout={expanded,right,bottom};
}
function updatePet(force=false){
 if(!petWindow||petWindow.isDestroyed()||petWindow.webContents.isLoadingMainFrame())return;
 const {theme,petMovable,language}=preferences();
 const data={...projectPetState(sessions,jobs,petCompleted,petTracker?.running(sessions)||[]),theme,movable:petMovable,language,revision:petRevision};clearPetCompletionsForRunning(petCompleted,data.running);const serialized=JSON.stringify(data);
 if(force||serialized!==petLast){petLast=serialized;petWindow.webContents.send('pet:state',data)}
}
function setPetVisible(enabled){
 if(!enabled){if(petWindow&&!petWindow.isDestroyed()){suppressPetClose=true;petWindow.destroy();suppressPetClose=false;petWindow=null}petCompleted.length=0;petLast='';syncTracking();return}
 if(petWindow&&!petWindow.isDestroyed())return;
 syncTracking();
 const pet=new BrowserWindow({width:PET_DOT,height:PET_DOT,useContentSize:true,title:t('MaxAgent 桌面寵物'),show:false,alwaysOnTop:true,frame:false,transparent:true,skipTaskbar:true,resizable:false,movable:state.settings.petMovable===true,webPreferences:{preload:path.join(__dirname,'pet-preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false}});petWindow=pet;petLayout=null;petRevision=0;petCorner(pet);
 pet.webContents.setWindowOpenHandler(()=>({action:'deny'}));pet.webContents.on('will-navigate',e=>e.preventDefault());
 pet.webContents.on('did-finish-load',()=>{if(petWindow===pet)updatePet(true)});
 pet.webContents.on('did-stop-loading',()=>{if(petWindow===pet)updatePet(true)});
 pet.once('ready-to-show',()=>{if(!pet.isDestroyed())pet.showInactive()});
 pet.on('closed',()=>{if(petWindow===pet)petWindow=null;petCompleted.length=0;petLast='';if(!quitting&&!suppressPetClose){const old=state.settings.desktopPet;state.settings.desktopPet=false;try{save()}catch(e){state.settings.desktopPet=old;setPetVisible(true);if(win&&!win.isDestroyed())win.webContents.send('agent:preferenceError','無法保存桌面寵物設定：'+e.message)}syncTracking();if(win&&!win.isDestroyed())win.webContents.send('agent:preferencesChanged',preferences())}});
 pet.loadFile(path.join(__dirname,'pet.html'));
}
function syncTracking(){
 let enabled=false;if(!quitting)try{enabled=getClaudeHook(claudeSettings(),claudeHookCommand())==='enabled'}catch{}const hadHook=claudeHookActive;claudeHookActive=enabled;const needPet=!quitting&&(state.settings.desktopPet===true||state.settings.windowsNotifications===true);
 if(!needPet)petTracker=null;else if(!petTracker){petTracker=createCodexPetTracker();petTracker.observe(sessions,jobs)}
 if(!enabled){const previous=claudePetTracker?.running(sessions,jobs)||[];claudePetTracker=null;if(hadHook)for(const k of previous)publishClaude(k);if(claudePetServer){const server=claudePetServer;claudePetServer=null;claudeServerClosing=true;server.close(()=>{claudeServerClosing=false;if(claudeHookActive&&!quitting)startClaudeServer()})}}
 else {if(!claudePetTracker)claudePetTracker=createClaudePetTracker();startClaudeServer()}
 if(!needPet&&!enabled){if(trackingTimer){clearInterval(trackingTimer);trackingTimer=null}return}
 if(!trackingTimer){trackingTimer=setInterval(()=>{for(const k of claudePetTracker?.expire(Date.now())||[])publishClaude(k);refreshGate(false).catch(()=>{})},15000);trackingTimer.unref?.()}
}
function startClaudeServer(){
 if(claudePetServer||claudeServerClosing||!claudePetTracker||!claudeHookActive)return;
 claudePetServer=net.createServer(socket=>{let input='';socket.setEncoding('utf8');socket.on('data',chunk=>{input+=chunk;if(input.length>2048)socket.destroy()});socket.on('error',()=>{});socket.on('end',()=>{try{const e=JSON.parse(input);if(!claudePetTracker||!claudeHookActive||!h.ID.test(e.session||''))return;const k=key('claude',e.session),received=Date.now();const handle=()=>{if(!claudePetTracker||!claudeHookActive||!sessions.has(k))return;for(const expired of claudePetTracker.expire(received))publishClaude(expired);const was=claudePetTracker.running(sessions,jobs,received).includes(k),item=claudePetTracker.event({...e,time:received},sessions,jobs),now=claudePetTracker.running(sessions,jobs,received).includes(k);if(item){const s=sessions.get(k);s.last=item.turn;completed(item)}if(item||was!==now)publishClaude(k)};if(sessions.has(k))handle();else refreshGate(true).then(handle).catch(()=>{})}catch{}})});claudePetServer.on('error',()=>{});claudePetServer.listen(claudePetPipe);
}
const requestNotification=createNativeNotifications(Notification,message=>{if(win&&!win.isDestroyed())win.webContents.send('agent:notificationFailure',message)});
const routeCompletion=createCompletionRouter(item=>{requestNotification({title:t('MaxAgent：任務完成'),body:item.tool==='codex'?t('Codex 有新結果'):t('Claude Code 有新結果')})},item=>{recordPetCompletion(petCompleted,item);petRevision++;updatePet()});
function completed(item){routeCompletion(item,{windows:state.settings.windowsNotifications===true,pet:state.settings.desktopPet===true})}
function bind(name,fn){
 ipcMain.handle('agent:'+name,(e,...args)=>{
  if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame)throw Error('Invalid origin');
  return fn(...args);
 });
}
if(!app.requestSingleInstanceLock())app.quit();
else {
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus()}});
 app.whenReady().then(()=>{
  const pipe='\\\\.\\pipe\\maxagent-codex-stop-'+crypto.createHash('sha256').update(os.homedir().toLowerCase()).digest('hex').slice(0,20);
  codexStopServer=net.createServer(socket=>{let input='';socket.setEncoding('utf8');socket.on('data',c=>{input+=c;if(input.length>512)socket.destroy()});socket.on('error',()=>{});socket.on('end',()=>{try{const e=JSON.parse(input);if(!h.ID.test(e.session||'')||typeof e.turn!=='string'||!/^[-a-z0-9._]{1,128}$/i.test(e.turn))return;const k=key('codex',e.session);if(sessions.has(k))codexWatch.wake(k);else refreshGate(true).then(()=>{if(sessions.has(k))codexWatch.wake(k)}).catch(()=>{})}catch{}})});codexStopServer.on('error',()=>{});if(process.platform==='win32')codexStopServer.listen(pipe);
  ipcMain.handle('pet:setExpanded',(e,expanded)=>{
   if(!petWindow||petWindow.isDestroyed()||e.sender!==petWindow.webContents||e.senderFrame!==petWindow.webContents.mainFrame||typeof expanded!=='boolean')throw Error('Invalid pet request');
   return resizePet(petWindow,expanded);
  });
  ipcMain.handle('pet:openChat',async(e,k)=>{
   if(!petWindow||petWindow.isDestroyed()||e.sender!==petWindow.webContents||e.senderFrame!==petWindow.webContents.mainFrame)throw Error('Invalid origin');
   const session=sessions.get(k);
   if(session?.tool==='codex')return openCodexChat(k);
   return openClaudeChat(session,claudeExe());
  });
  app.setAppUserModelId('MaxAgent.Desktop');
  if(process.platform==='win32'&&!app.isPackaged&&app.getName().toLowerCase()==='maxagent'){const programs=path.join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs');shortcutStatus=ensureShortcut({shell,exists:fs.existsSync,shortcut:path.join(programs,'MaxAgent.lnk'),exe:process.execPath,root:path.join(__dirname,'..'),appId:'MaxAgent.Desktop'})}
  stateFile=path.join(app.getPath('userData'),'maxagent-state.json');load();setLanguage(preferences().language);
  void codexModels().catch(()=>{});
  win=new BrowserWindow({width:1200,height:790,minWidth:670,minHeight:470,title:'MaxAgent',backgroundColor:'#f8f7f2',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  bind('list',async(force=false)=>{
   await refreshGate(force);
   try{for(const s of await openCodeDesktop.list())sessions.set(key(s.tool,s.id),s)}catch{}
   const dshPaired=dshLink.configured();const running=new Set([...quickTracker.running(sessions).map(x=>x.key),...(claudePetTracker?.running(sessions,jobs)||[])]);return [...sessions].map(([k,s])=>({key:k,tool:s.tool,title:s.title,description:s.description,cwd:s.cwd,time:s.time,busy:s.busy,observedRunning:running.has(k),unread:canResume(s.tool)&&!!s.last&&state.read[k]!==s.last,job:jobFor(k),canResume:supportsSession(s,dshPaired),readHistory:s.tool==='dsh'?null:true,canDetectCompletion:supportsSession(s,dshPaired)}));
  });
  bind('history',async(k,cursor=null)=>{
   const s=get(k),liveCursor=s.tool==='dsh'&&Number.isSafeInteger(cursor?.dsh)&&cursor.dsh>0;
   if(cursor!==null&&!liveCursor&&(!Number.isSafeInteger(cursor)||cursor<0))throw Error('無效的歷史位置。');
   if(s.tool==='opencode'&&s.source==='desktop'){if(cursor===null&&!['running','confirming'].includes(jobs.get(k)?.status)){for(const attempt of dispatchStore.unresolved(k)){if(!attempt.receipt?.messageId)continue;try{const result=await openCodeDesktop.result(s,attempt.receipt.messageId);if(result){dispatchStore.complete(k,attempt.id,result);if(jobs.get(k)?.id===attempt.id)Object.assign(jobs.get(k),{status:'completed',...result})}}catch{}}}const x=await openCodeDesktop.history(s),end=cursor===null?x.messages.length:Math.min(cursor,x.messages.length),start=Math.max(0,end-2);return {messages:x.messages.slice(start,end),cursor:start||null,last:null,busy:false,historyUnavailable:x.historyUnavailable,job:jobFor(k)}}
   if(s.tool==='dsh'&&dshLink.configured()&&(cursor===null||liveCursor)){
    if(cursor===null)await reconcileDsh(k,s).catch(()=>{});
    try{const x=await dshLink.history(s,cursor===null?null:cursor.dsh);return {messages:x.messages,cursor:x.cursor===null?null:{dsh:x.cursor},last:null,busy:false,job:jobFor(k)}}catch(e){
     // A live pagination cursor is never treated as a disk history offset.
     if(cursor?.dsh!==undefined)throw e;
    }
   }
   if(liveCursor)throw Error('DSH 桌面已離線，請重新打開對話。');
   if(!canResume(s.tool)){const x=h.history(s),end=cursor===null?x.messages.length:Math.min(cursor,x.messages.length),start=Math.max(0,end-2);return {messages:x.messages.slice(start,end),cursor:start||null,last:x.last,busy:x.busy,historyUnavailable:x.historyUnavailable===true,job:jobFor(k)}}
   if(cursor===null){
    reconcileResults(k,s);
    const current=h.summarize(s);
    if(!current.invalid){s.last=current.last;s.busy=current.busy;s.modelEvidence=current.modelEvidence}
   }
   const x=readPage(s,cursor,2);return {...x,last:s.last,busy:s.busy,modelEvidence:s.modelEvidence,job:jobFor(k)};
  });
  bind('read',(k,marker)=>{
   const s=get(k);if(typeof marker==='string'&&s.last===marker&&state.read[k]!==marker){state.read[k]=marker;save()}
  });
  bind('getDraft',k=>{const s=get(k);if(!supportsDraft(s))throw Error('此工具不支援草稿。');return dispatchStore.draft(k)});
  bind('acknowledgePending',async k=>{
   const s=get(k);reconcileResults(k,s);const active=jobs.get(k),candidate=dispatchStore.unresolved(k).filter(a=>canAcknowledge(a)&&!(a.id===active?.id&&['running','confirming'].includes(active.status))).at(-1);
   if(!candidate)throw Error('目前沒有可隱藏的未確認提示，請先重新讀取對話。');
   const choice=await dialog.showMessageBox(win,{type:'warning',title:t('隱藏未確認提示'),message:t('請先到原對話查看這筆任務。'),detail:t('隱藏提示不會取消任務；它仍可能稍後執行。MaxAgent 會保留記錄和草稿，不會自動重送，相同任務仍受重送保護。'),buttons:[t('取消'),t('已了解，隱藏提示')],defaultId:0,cancelId:0,noLink:true});
   if(choice.response!==1)return false;
   reconcileResults(k,s);const now=jobs.get(k);if(now?.id===candidate.id&&['running','confirming'].includes(now.status))throw Error('任務仍在處理中，不能隱藏提示。');
   dispatchStore.acknowledge(k,candidate.id);if(now?.id===candidate.id)jobs.set(k,{...now,acknowledged:true});if(!win.isDestroyed())win.webContents.send('agent:changed',k);return true;
  });
  bind('cancelCodexQueue',async k=>{const s=get(k),job=jobs.get(k);if(s.tool!=='codex'||!job?.queue?.clientId||!['queued','result_unavailable'].includes(job.status))throw Error('目前沒有可取消的排隊任務。');let id=job.queue.id;if(!id){const matches=(await codexQueue.list(s)).filter(x=>x.clientUserMessageId===job.queue.clientId);if(matches.length!==1)throw Error('無法確認佇列項目，請查看原對話，勿重送。');id=matches[0].id}const deleted=await codexQueue.cancel(s,id);reconcileResults(k,s);if(jobs.get(k)?.id!==job.id||jobs.get(k)?.status==='completed')return {deleted};const msg=deleted?'已從排隊清單移除；原任務仍可能已被取走，請勿重送。可發送其他任務。':'未能取消，任務可能已被原對話取走；請勿重送。';const queue={...job.queue,cancelRequested:true,cancelDeleted:deleted};dispatchStore.mark(k,job.id,{status:'result_unavailable',error:msg,phase:'possibly_sent',queue});Object.assign(job,{status:'result_unavailable',error:msg,queue});if(!win.isDestroyed())win.webContents.send('agent:changed',k);return {deleted}});
  bind('setDraft',(k,text)=>{const s=get(k);if(!supportsDraft(s))throw Error('此工具不支援草稿。');return dispatchStore.write(k,text)});
  bind('copyDshDraft',k=>{
   if(get(k).tool!=='dsh')throw Error('此操作僅適用於 DSH 原對話。');
   if(dispatchStore.unresolved(k).some(a=>a.dsh))throw Error('這個 DSH 對話有已送出或未確認的任務，請先查看原對話，勿重送。');
   const text=dispatchStore.draft(k).text;
   if(!text.trim())throw Error('請先輸入要複製的任務。');
   clipboard.writeText(text);
  });
  async function dshLinkStatus(){
   const paired=dshLink.configured();
   const connected=paired&&await dshLink.ping().then(()=>true,()=>false);
   return {paired,connected};
  }
  bind('getDshLink',dshLinkStatus);
  bind('setDshLink',async enabled=>{await configureDshLink(enabled);return dshLinkStatus()});
  bind('openCodexForResend',async k=>{const s=get(k);if(s.tool!=='codex'||!dispatchStore.unresolved(k).some(a=>queueRemoved(a)))throw Error('目前沒有已取消的排隊任務。');return {opened:await openCodexChat(k)}});
  bind('reviewCodexResend',async k=>{
   const s=get(k),a=dispatchStore.resendCandidate(k);if(s.tool!=='codex'||!a?.queue?.clientId)throw Error('請先把已取消的原任務放回草稿，再解除限制。');
   const check=async()=>{if(codexQueue.readQueuedTurn(s,a.offset,a.queue.clientId))throw Error('原對話已收到這筆任務，不能解除限制。');const items=await codexQueue.list(s);if(items.some(x=>x.id===a.queue.id||x.clientUserMessageId===a.queue.clientId))throw Error('原任務仍在排隊，不能解除限制。');if(codexQueue.readQueuedTurn(s,a.offset,a.queue.clientId))throw Error('原對話已收到這筆任務，不能解除限制。')};
   await check();const answer=await dialog.showMessageBox(win,{type:'warning',title:'解除原任務的重送限制',message:'請先在 Codex 原對話確認沒有收到這筆任務。',detail:'即使目前查不到，Codex 仍可能稍後寫入先前已接收的任務。解除後再次發送，有重複執行的風險。此操作不會自動發送。',buttons:['取消','我已查看，解除限制'],defaultId:0,cancelId:0,noLink:true});if(answer.response!==1)return {approved:false};await check();dispatchStore.approveResend(k,a.id);if(!win.isDestroyed())win.webContents.send('agent:changed',k);return {approved:true};
  });
  bind('getPreferences',preferences);
  bind('testNotification',()=>({...requestNotification({title:t('MaxAgent：測試通知'),body:t('這是一條 Windows 測試通知。')}),shortcut:shortcutStatus}));
  bind('closeReady',()=>{if([...jobs.values()].some(j=>['running','confirming'].includes(j.status)))throw Error('有任務正在執行，完成後才能關閉 MaxAgent。');closingReady=true;win.close()});
  bind('getClaudePetHook',()=>getClaudeHook(claudeSettings(),claudeHookCommand()));
  bind('getCodexStopHook',()=>getCodexHook(codexHookFile(),codexHookCommand()));
  bind('setCodexStopHook',enabled=>{setCodexHook(codexHookFile(),codexHookCommand(),enabled);return getCodexHook(codexHookFile(),codexHookCommand())});
  bind('setClaudePetHook',enabled=>{setClaudeHook(claudeSettings(),claudeHookCommand(),enabled);syncTracking();return getClaudeHook(claudeSettings(),claudeHookCommand())});
  bind('setPreference',(name,value)=>{if(!((name==='language'&&locales.includes(value))||(name==='theme'&&['light','dark'].includes(value))||(['windowsNotifications','desktopPet','petMovable'].includes(name)&&typeof value==='boolean')))throw Error('無效的介面設定。');const old=state.settings[name];state.settings[name]=value;try{save()}catch(e){state.settings[name]=old;throw e}if(name==='language'){setLanguage(value);petWindow?.setTitle(t('MaxAgent 桌面寵物'));updatePet()}if(name==='theme')updatePet();if(name==='desktopPet')setPetVisible(value);if(name==='petMovable'&&petWindow&&!petWindow.isDestroyed()){petWindow.setMovable(value);if(!value)petCorner(petWindow);updatePet()}if(name==='windowsNotifications')syncTracking();return preferences()});
  bind('getChatModel',async k=>{const s=get(k),selection={...(state.settings.chatModels?.[k]||{})};if(s.tool==='dsh'){try{const data=await dshLink.models(s);return {selection,models:data.models,reason:'清單來自 DSH 目前的供應商。發送時切換此原對話，後續沿用；不修改全域預設。換模須原對話空閒，實際模型仍以原工具回報為準。'}}catch(e){return {selection,models:[],reason:e.message+' 請確認已配對並重開 DSH。'}}}if(s.tool==='opencode'&&s.source==='desktop'){try{const models=await openCodeDesktop.models(s);return {selection,models,reason:'清單來自 OpenCode；發送時會切換此原聊天室的模型，之後繼續沿用。實際使用權限以供應商回覆為準。'}}catch{return {selection,models:[],reason:'無法取得 OpenCode 模型清單。'}}}if(s.tool==='claude'){const {models,context,reason,provider,defaultModel}=claudeModels(s.cwd);const desktop=readDesktopModel(s.id),desktopModel=desktop.status==='ok'?resolveDesktopModel(desktop.model,models):null;const selectionChanged=!!selection.model&&(!context||state.settings.chatModelContexts?.[k]!==context||!models.some(m=>m.id===selection.model));return {selection,models,provider,defaultModel:desktop.status==='ok'?desktopModel:defaultModel,desktopStatus:desktop.status,desktopSelected:desktop.model||null,selectionChanged,reason:selectionChanged?t('無法沿用先前選的模型，請重新選擇。')+' '+t(reason):t(reason)}}if(s.tool!=='codex')return {selection:{},models:[],reason:t('此工具尚未支援模型選擇。')};try{const models=await codexModels();return {selection,models,reason:models.length?t('選項由目前 Codex 提供；實際使用權限以派工結果為準。'):t('Codex 沒有回傳可選模型。')}}catch(e){return {selection,models:[],reason:t(e.message||'無法取得 Codex 模型清單。')+' '+t('可按重新取得，或沿用原工具設定。')}}});
  bind('setChatModel',async(k,value)=>{const s=get(k);let candidate,context;if(s.tool==='dsh'){const data=value?.model?await dshLink.models(s):{models:[]};candidate=validateSelection(value,data.models);context=data.context}else if(s.tool==='opencode'&&s.source==='desktop')candidate=validateSelection(value,value?.model?await openCodeDesktop.models(s):[]);else if(s.tool==='claude'){const data=claudeModels(s.cwd);candidate=validateClaudeSelection(value,value?.model?data.models:[],data.context,data.context);context=data.context}else if(s.tool==='codex')candidate=validateSelection(value,value?.model?await codexModels():[]);else throw Error('此工具目前只支援沿用原設定。');const previous=state.settings.chatModels,previousContexts=state.settings.chatModelContexts;state.settings.chatModels={...previous,[k]:candidate};if(s.tool==='claude'||s.tool==='dsh')state.settings.chatModelContexts={...previousContexts,[k]:candidate.model?context:null};try{save()}catch(e){state.settings.chatModels=previous;state.settings.chatModelContexts=previousContexts;throw e}return candidate});
  bind('manualCodexFallback',async(k,draft)=>{
   const session=get(k),job=jobs.get(k);if(session.tool!=='codex'||job?.status!=='failed'||job.reason!=='codex_writer_conflict'||dispatchStore.unresolved(k).length)throw Error('目前狀態不適用此備案。');
   if(typeof draft!=='string'||!draft.trim()||draft.length>12000)throw Error('請先輸入要複製的任務。');
   try{clipboard.writeText(draft)}catch{throw Error('複製失敗，草稿仍保留；沒有開啟 Codex。')}
   return {copied:true,opened:await openCodexChat(k)};
  });
  bind('chooseClaude',async()=>{
   const r=await dialog.showOpenDialog(win,{title:t('選擇 Claude Code 的 claude.exe'),properties:['openFile'],filters:[{name:'Claude Code CLI',extensions:['exe']}]});
   if(r.canceled)return false;
   const exe=r.filePaths[0];if(path.basename(exe).toLowerCase()!=='claude.exe')throw Error('請選擇 claude.exe。');
   state.settings.claudeExe=exe;save();return true;
  });
  bind('send',async(k,value)=>{
   const s=get(k), prompt=typeof value==='string'?value.trim():'';
   try{
   if(!supportsSession(s))throw Error('此工具目前僅供唯讀，不能派工。');
   if(!prompt||prompt.length>12000)throw Error('請輸入 1 至 12,000 字。');
   if(s.tool==='dsh')return await sendDsh(k,s,prompt);
   if(s.tool==='opencode'){
    if(validating.has(k)||['running','confirming'].includes(jobs.get(k)?.status))throw Error('聊天室仍有任務在執行。');
    validating.add(k);let attempt;const messageId='msg_'+crypto.randomBytes(16).toString('hex');
    let chosenModel=null;try{await openCodeDesktop.history(s);const selected={...(state.settings.chatModels?.[k]||{})};if(selected.model){const available=await openCodeDesktop.models(s);const valid=validateSelection(selected,available);chosenModel=available.find(x=>x.id===valid.model)?.ref;if(!chosenModel)throw Error('OpenCode 模型不可用，任務未送出。')}attempt=dispatchStore.begin(k,0,prompt);dispatchStore.mark(k,attempt.id,{receipt:{messageId},phase:'prepared'})}finally{validating.delete(k)}
    const job={...attempt,status:'running',time:Date.now()};jobs.set(k,job);if(!win.isDestroyed())win.webContents.send('agent:changed',k);
    setImmediate(async()=>{try{if(chosenModel){try{await openCodeDesktop.switchModel(s,chosenModel)}catch{const error=Error('OpenCode 模型切換失敗或結果未確認；任務未送出。請在原對話確認目前模型。');error.sendPhase='not_sent';throw error}}dispatchStore.mark(k,attempt.id,{phase:'possibly_sent'});job.phase='possibly_sent';await openCodeDesktop.send(s,messageId,prompt);job.status='confirming';if(!win.isDestroyed())win.webContents.send('agent:changed',k);let result=null;for(let i=0;i<150&&!result;i++){await new Promise(r=>setTimeout(r,2000));result=await openCodeDesktop.result(s,messageId)}if(!result)throw Error('尚未確認本輪結果，請勿重送。');dispatchStore.complete(k,attempt.id,result);Object.assign(job,{status:'completed',...result})}catch(e){job.status=e.sendPhase==='not_sent'?'failed':'result_unavailable';job.error=e.message;try{dispatchStore.mark(k,attempt.id,{status:job.status,error:job.error,phase:e.sendPhase||'possibly_sent'})}catch{job.status='result_unavailable';job.error='無法保存派工狀態，請勿重送。'}}job.time=Date.now();if(!win.isDestroyed())win.webContents.send('agent:changed',k)});return true;
   }
   if(s.tool==='codex'&&jobs.get(k)?.status==='queued')throw Error('前一筆任務仍在排隊。請等原對話接收，或在 MaxAgent 嘗試取消排隊。');
   if(validating.has(k)||['running','queued','confirming'].includes(jobs.get(k)?.status)||(s.tool!=='codex'&&h.history(s).busy))throw Error('聊天室仍有任務在執行。');
   if(s.tool==='codex'&&dispatchStore.unresolved(k).some(a=>a.queue&&!queueRemoved(a)||a.desktopClientId&&!a.acknowledged))throw Error('前一筆任務尚未確認。請查看 Codex 原對話及 MaxAgent 的派工狀態，勿重送。');
   if(s.tool==='codex')for(const a of dispatchStore.unresolved(k).filter(x=>x.resendApproved&&x.queue?.clientId)){const evidence=codexQueue.readQueuedTurn(s,a.offset,a.queue.clientId);if(evidence){dispatchStore.mark(k,a.id,{resendBlocked:true});throw Error('原對話已收到先前的任務，為避免重複，已停止發送。')}}
   if(!fs.existsSync(s.cwd))throw Error('原工作目錄不存在。');
   const selected={...(state.settings.chatModels?.[k]||{})};let options={};validating.add(k);
   try{if(s.tool==='codex'&&Object.keys(selected).length)options=validateSelection(selected,selected.model?await codexModels():[]);else if(s.tool==='claude'&&Object.keys(selected).length){const data=claudeModels(s.cwd);options=validateClaudeSelection(selected,data.models,state.settings.chatModelContexts?.[k],data.context)}else if(s.tool==='claude'){const desktop=readDesktopModel(s.id);if(desktop.status!=='absent'){const data=claudeModels(s.cwd),model=desktop.status==='ok'&&resolveDesktopModel(desktop.model,data.models);if(!model||!data.context)throw Error('無法確認 Claude 桌面此對話所選模型，任務未送出；請在 MaxAgent 手動選擇模型。');options=validateClaudeSelection({model:model.id},data.models,data.context,data.context)}}else if(s.tool!=='codex'&&s.tool!=='claude'&&Object.keys(selected).length)throw Error('此工具目前只支援沿用原設定。');if(s.tool!=='codex'&&h.history(s).busy)throw Error('聊天室仍有任務在執行。')}finally{validating.delete(k)}
   let peerTarget=null,verifyPeerModel;
   if(s.tool==='claude'){
    const desktop=readDesktopModel(s.id);
    if(desktop.status!=='absent'){
     if(desktop.status!=='ok')throw Error('無法確認 Claude 桌面原對話及模型，任務未送出。');
     if(hasUnresolvedPeer(dispatchStore.unresolved(k)))throw Error('此對話有透過本機通道送出的任務尚未確認；請先查看原對話，勿重送。');
     const data=claudeModels(s.cwd),desktopChoice=resolveDesktopModel(desktop.model,data.models);
     if(!desktopChoice||!data.context)throw Error('無法確認 Claude 桌面模型，任務未送出。');
     if(options.model&&options.model!==desktopChoice.id)throw Error('MaxAgent 所選模型與 Claude 原對話不同；請先在 Claude 桌面切換模型或在 MaxAgent 選擇跟隨，任務未送出。');
     peerTarget=claudePeer.discover(s.id,desktop.host);
     verifyPeerModel=()=>{
      const current=readDesktopModel(s.id),models=claudeModels(s.cwd);
      if(current.status!=='ok'||current.host!==desktop.host||models.context!==data.context||resolveDesktopModel(current.model,models.models)?.id!==desktopChoice.id)throw Error('Claude 原對話的模型或供應商已變更，任務未送出。請重新確認模型。');
     };
    }
   }
   const offset=fs.statSync(s.file).size;
   const attempt=dispatchStore.begin(k,offset,prompt);const job={...attempt,status:'running',time:Date.now()};jobs.set(k,job);if(petTracker)petTracker.observe(sessions,jobs);claudePetTracker?.clear(k);updatePet();
   setImmediate(async()=>{
    try{
     const phase=info=>{if(info.alert){job.serviceAlert=info.alert;if(!win.isDestroyed())win.webContents.send('agent:changed',k);return}if(info.turn)job.turn=info.turn;if(info.phase)job.phase=info.phase;if(!win.isDestroyed())win.webContents.send('agent:changed',k);try{dispatchStore.mark(k,attempt.id,{phase:info.phase,...(info.turn?{receipt:{turn:info.turn}}:{})})}catch{}};
     if(peerTarget){
      const ticket=crypto.randomUUID();
      await claudePeer.send(peerTarget,prompt,ticket,()=>{
       verifyPeerModel();
       dispatchStore.mark(k,attempt.id,{status:'result_unavailable',phase:'possibly_sent',peer:{ticket}});
       Object.assign(job,{peer:{ticket},phase:'possibly_sent'});
       if(!win.isDestroyed())win.webContents.send('agent:changed',k);
      });
      const receiveBy=Date.now()+30000,finishBy=Date.now()+120000;
      let evidence;
      while(Date.now()<(job.phase==='accepted'?finishBy:receiveBy)){
       let current;try{current=readClaudeReceipt(s,attempt)}catch{/* Retry while the original log is temporarily unavailable. */}
       if(current?.received&&job.phase!=='accepted'){
        dispatchStore.mark(k,attempt.id,{status:'confirming',phase:'accepted',receipt:{turn:current.received}});
        Object.assign(job,{status:'confirming',phase:'accepted',turn:current.received});
        if(!win.isDestroyed())win.webContents.send('agent:changed',k);
       }
       if(current?.result){evidence=current.result;break}
       await new Promise(r=>setTimeout(r,500));
      }
      if(!evidence)throw Error(job.phase==='accepted'?'Claude 原對話已收到本輪任務，尚未確認結果。':'未在 Claude 原對話看到本輪任務，無法確認是否收到。請勿重送。');
      dispatchStore.complete(k,attempt.id,evidence);Object.assign(job,{status:'completed',time:Date.now(),marker:evidence.marker,turn:evidence.turn});completed({key:k,tool:s.tool,title:s.title||'未命名對話',status:'completed',time:job.time,turn:evidence.turn,source:'maxagent'});job.time=Date.now();updatePet();if(!win.isDestroyed())win.webContents.send('agent:changed',k);return;
     }
     let receipt;try{receipt=await (s.tool==='codex'?h.codex(s,prompt,options,phase):h.claude(s,prompt,claudeExe(),options,phase,offset))}catch(e){
      if(s.tool!=='codex'||e.code!=='CODEX_WRITER_CONFLICT'||e.sendPhase!=='not_sent')throw e;
      if(options.model||options.effort){
       const clientId=crypto.randomUUID();
       try{
        receipt=await codexDesktop.sendSelected({id:s.id,prompt,options,clientId,sandboxPolicy:h.codexWorkspacePolicy(s.cwd),beforeSend:async()=>{
         const check=()=>{const current=h.summarize(s);if(current.invalid||current.busy||current.codexTurn?.status!=='completed')throw Error('原對話正在處理任務，或無法確認已空閒。')};
         check();
         if((await codexQueue.list(s)).length)throw Error('原對話已有排隊任務，請等它們結束。');
         const {response}=await dialog.showMessageBox(win,{type:'question',buttons:['取消','換模型並送出'],defaultId:0,cancelId:0,message:'使用所選模型送到 Codex 原對話？',detail:'Codex 也可能將此模型和推理強度保留給同一對話之後的任務。'});
         if(response!==1){const cancelled=Error('已取消換模型派工。');cancelled.userCancelled=true;throw cancelled}
         if((await codexQueue.list(s)).length)throw Error('原對話已有排隊任務，請等它們結束。');
         check();
         dispatchStore.mark(k,attempt.id,{desktopClientId:clientId,desktopSelection:options,status:'running',phase:'possibly_sent'});
         Object.assign(job,{desktopClientId:clientId,phase:'possibly_sent'});
        }});
        phase({phase:'accepted',turn:receipt.turn});
       }catch(error){if(error.sendPhase==='possibly_sent')throw error;e.message=error.message;e.userCancelled=error.userCancelled;throw e}
      }else{
      const clientId=crypto.randomUUID(),queue={clientId};dispatchStore.mark(k,attempt.id,{status:'result_unavailable',phase:'possibly_sent',queue});Object.assign(job,{status:'result_unavailable',queue});
      const id=await codexQueue.add(s,prompt,clientId);queue.id=id;dispatchStore.mark(k,attempt.id,{status:'queued',phase:'possibly_sent',queue});Object.assign(job,{status:'queued',queue});
      job.time=Date.now();updatePet();if(!win.isDestroyed())win.webContents.send('agent:changed',k);
      setTimeout(()=>{
       if(jobs.get(k)!==job||job.status!=='queued')return;
       reconcileResults(k,s);
       if(jobs.get(k)===job&&job.status==='queued')showDispatchAlert(s,'Codex 尚未確認接收任務','任務仍在排隊追蹤中。請勿重送；可在 MaxAgent 查看或嘗試取消排隊。');
       else{updatePet();if(!win.isDestroyed())win.webContents.send('agent:changed',k)}
      },30000).unref();
      return;
      }
     }
     delete job.serviceAlert;
     const savedReceipt=s.tool==='codex'?{turn:receipt.turn}:receipt.messageId?{messageId:receipt.messageId}:null;if(savedReceipt)dispatchStore.mark(k,attempt.id,{receipt:savedReceipt});
     job.status='confirming';job.time=Date.now();updatePet();if(!win.isDestroyed())win.webContents.send('agent:changed',k);
     if(job.desktopClientId){dispatchStore.mark(k,attempt.id,{status:'confirming'});return}
     const evidence=await waitResult(s,offset,receipt);dispatchStore.complete(k,attempt.id,evidence);job.status='completed';job.time=Date.now();job.marker=evidence.marker;job.turn=evidence.turn;
     completed({key:k,tool:s.tool,title:s.title||'未命名對話',status:'completed',time:job.time,turn:evidence.turn,source:'maxagent'});
    }catch(e){
     job.status=e.sendPhase==='not_sent'?'failed':'result_unavailable';job.error=e.message;
     if(s.tool==='codex'&&job.status==='failed'&&e.code==='CODEX_WRITER_CONFLICT'&&!e.userCancelled)job.reason='codex_writer_conflict';
     try{dispatchStore.mark(k,attempt.id,{status:job.status,error:job.error,serviceAlert:job.serviceAlert||null,reason:job.reason||null,phase:job.phase==='accepted'?'accepted':e.sendPhase||'possibly_sent'})}catch{job.status='result_unavailable';job.error='無法保存派工狀態。請勿重送，並到原工具查看結果。'}
     if(s.tool==='codex'&&!e.userCancelled){
      const message=job.status==='failed'?'Codex 沒有收到本次任務':job.phase==='accepted'?'Codex 已接收，結果未確認':'無法確認 Codex 是否收到本次任務';
      const next=job.status==='failed'?'草稿已保留。請查看原因後再決定是否送出。':'請先查看 Codex 原對話，勿重送。';
      showDispatchAlert(s,message,job.error+'\n\n'+t(next));
     }
     if(peerTarget)showDispatchAlert(s,job.status==='failed'?'Claude 沒有收到本次任務':job.phase==='accepted'?'Claude 已接收，結果未確認':'無法確認 Claude 是否收到本次任務',job.error);
    }
    job.time=Date.now();updatePet();if(!win.isDestroyed())win.webContents.send('agent:changed',k);
   });
   return true;
   }catch(e){
    if(s.tool==='codex'||s.tool==='claude'||s.tool==='dsh')showDispatchAlert(s,'本次未開始派工',e.message);
    throw e;
   }
  });
  const tracked=a=>a.queue?.clientId||a.desktopClientId||a.peer?.ticket;
  const trackingStamp=attempts=>attempts.map(a=>[a.id,a.status,a.phase,!!a.resendBlocked].join(':')).join('|');
  const queueTimer=setInterval(()=>{for(const [k,s] of sessions){const attempts=dispatchStore.unresolved(k).filter(tracked);if(!attempts.length)continue;const before=trackingStamp(attempts);reconcileResults(k,s);if(before!==trackingStamp(dispatchStore.unresolved(k).filter(tracked))){updatePet();if(!win.isDestroyed())win.webContents.send('agent:changed',k)}}},3000);queueTimer.unref();
  const dshTimer=setInterval(()=>{for(const [k,s] of sessions)if(s.tool==='dsh'&&dispatchStore.unresolved(k).some(a=>a.dsh&&!a.dsh.terminal))void reconcileDsh(k,s).catch(()=>{});},3000);dshTimer.unref();
  win.on('close',e=>{if([...jobs.values()].some(j=>['running','confirming'].includes(j.status))){e.preventDefault();dialog.showMessageBox(win,{type:'info',message:'有任務正在執行，完成後才能關閉 MaxAgent。'}).catch(()=>{});return}if(!closingReady){e.preventDefault();win.webContents.send('agent:beforeClose')}});
  win.on('closed',()=>{quitting=true;setPetVisible(false);app.quit()});
  win.loadFile(path.join(__dirname,'index.html'));
  syncTracking();
  if(state.settings.desktopPet===true)setPetVisible(true);
 });
 app.on('before-quit',()=>{quitting=true;codexWatch.close();codexStopServer?.close()});
 app.on('window-all-closed',()=>app.quit());
}
