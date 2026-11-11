const {app,BrowserWindow,ipcMain,Notification,dialog,clipboard}=require('electron');
const {execFile}=require('node:child_process');
const path=require('node:path'), fs=require('node:fs');
const h=require('./harness');
const {waitResult}=require('./result-evidence');
const {projectPetState}=require('./pet-state');
const {codexModels,validateSelection,claudeModels,validateClaudeSelection}=require('./model-settings');
const validating=new Set();

const {createNotifier}=require('./notifications');
let win, petWindow, quitting=false, suppressPetClose=false, petLast="", stateFile, state={read:{},settings:{}}, sessions=new Map(), listedAt=0;
const jobs=new Map(),petCompleted=[];
const key=(tool,id)=>tool+':'+id;
const claudeExe=()=>state.settings.claudeExe||process.env.MAXAGENT_CLAUDE_CLI||(fs.existsSync(path.join(__dirname,'..','runtime','claude','claude.exe'))?path.join(__dirname,'..','runtime','claude','claude.exe'):'claude.exe');
function save(){fs.writeFileSync(stateFile+'.tmp',JSON.stringify(state),'utf8');fs.renameSync(stateFile+'.tmp',stateFile)}
function load(){try{const v=JSON.parse(fs.readFileSync(stateFile,'utf8'));state={read:v.read||{},settings:v.settings||{}}}catch{}}
function refresh(){sessions=new Map(h.list().map(s=>[key(s.tool,s.id),s]));listedAt=Date.now();updatePet()}
function get(k){if(typeof k!=='string'||!sessions.has(k))throw Error('找不到這個聊天室，請重新整理。');return sessions.get(k)}
function preferences(){return {theme:state.settings.theme==='dark'?'dark':'light',windowsNotifications:state.settings.windowsNotifications===true,desktopPet:state.settings.desktopPet===true}}
function updatePet(force=false){
 if(!petWindow||petWindow.isDestroyed()||petWindow.webContents.isLoadingMainFrame())return;
 const data=projectPetState(sessions,jobs,petCompleted),serialized=JSON.stringify(data);
 if(force||serialized!==petLast){petLast=serialized;petWindow.webContents.send('pet:state',data)}
}
function setPetVisible(enabled){
 if(!enabled){if(petWindow&&!petWindow.isDestroyed()){suppressPetClose=true;petWindow.destroy();suppressPetClose=false;petWindow=null}petLast='';return}
 if(petWindow&&!petWindow.isDestroyed())return;
 const pet=new BrowserWindow({width:330,height:440,minWidth:280,minHeight:300,title:'MaxAgent 桌面寵物',show:false,alwaysOnTop:true,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'pet-preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false}});petWindow=pet;
 pet.webContents.setWindowOpenHandler(()=>({action:'deny'}));pet.webContents.on('will-navigate',e=>e.preventDefault());
 pet.webContents.on('did-finish-load',()=>{if(petWindow===pet)updatePet(true)});
 pet.once('ready-to-show',()=>{if(!pet.isDestroyed())pet.showInactive()});
 pet.on('closed',()=>{if(petWindow===pet)petWindow=null;petLast='';if(!quitting&&!suppressPetClose){const old=state.settings.desktopPet;state.settings.desktopPet=false;try{save()}catch(e){state.settings.desktopPet=old;setPetVisible(true);if(win&&!win.isDestroyed())win.webContents.send('agent:preferenceError','無法保存桌面寵物設定：'+e.message)}if(win&&!win.isDestroyed())win.webContents.send('agent:preferencesChanged',preferences())}});
 pet.loadFile(path.join(__dirname,'pet.html'));
}
const notify=createNotifier(tool=>{if(!Notification.isSupported())return;const n=new Notification({title:'MaxAgent：任務完成',body:tool==='codex'?'Codex 有新結果':'Claude Code 有新結果'});n.show()});
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
  app.setAppUserModelId('MaxAgent.Desktop');
  stateFile=path.join(app.getPath('userData'),'maxagent-state.json');load();
  void codexModels().catch(()=>{});
  win=new BrowserWindow({width:1200,height:790,minWidth:670,minHeight:470,title:'MaxAgent',backgroundColor:'#f8f7f2',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  bind('list',(force=false)=>{
   if(force===true||Date.now()-listedAt>14000)refresh();
   return [...sessions].map(([k,s])=>({key:k,tool:s.tool,title:s.title,description:s.description,cwd:s.cwd,time:s.time,busy:s.busy,unread:!!s.last&&state.read[k]!==s.last,job:jobs.get(k)||null}));
  });
  bind('history',k=>{
   const s=get(k), x=h.history(s);
   Object.assign(s,{last:x.last,busy:x.busy,cwd:x.cwd||s.cwd});
   return {messages:x.messages,last:x.last,busy:x.busy,job:jobs.get(k)||null};
  });
  bind('read',(k,marker)=>{
   const s=get(k);if(typeof marker==='string'&&s.last===marker&&state.read[k]!==marker){state.read[k]=marker;save()}
  });
  bind('getPreferences',preferences);
  bind('setPreference',(name,value)=>{if(!((name==='theme'&&['light','dark'].includes(value))||(['windowsNotifications','desktopPet'].includes(name)&&typeof value==='boolean')))throw Error('無效的介面設定。');const old=state.settings[name];state.settings[name]=value;try{save()}catch(e){state.settings[name]=old;throw e}if(name==='desktopPet')setPetVisible(value);return preferences()});
  bind('getChatModel',async k=>{const s=get(k),selection={...(state.settings.chatModels?.[k]||{})};if(s.tool==='claude'){const data=claudeModels(s.cwd);const changed=selection.model&&state.settings.chatModelContexts?.[k]!==data.context;return {selection,models:data.models,reason:changed?'連線或供應商已變更，請重新選擇模型。 '+data.reason:data.reason}}if(s.tool!=='codex')return {selection:{},models:[],reason:'此工具尚未支援模型選擇。'};try{const models=await codexModels();return {selection,models,reason:models.length?'選項由目前 Codex 提供；實際使用權限以派工結果為準。':'Codex 沒有回傳可選模型。'}}catch(e){return {selection,models:[],reason:(e.message||'無法取得 Codex 模型清單。')+' 可按重新取得，或沿用原工具設定。'}}});
  bind('setChatModel',async(k,value)=>{const s=get(k);let candidate,context;if(s.tool==='claude'){const data=claudeModels(s.cwd);candidate=validateClaudeSelection(value,value?.model?data.models:[],data.context,data.context);context=data.context}else if(s.tool==='codex')candidate=validateSelection(value,value?.model?await codexModels():[]);else throw Error('此工具目前只支援沿用原設定。');const previous=state.settings.chatModels,previousContexts=state.settings.chatModelContexts;state.settings.chatModels={...previous,[k]:candidate};if(s.tool==='claude')state.settings.chatModelContexts={...previousContexts,[k]:candidate.model?context:null};try{save()}catch(e){state.settings.chatModels=previous;state.settings.chatModelContexts=previousContexts;throw e}return candidate});
  bind('manualCodexFallback',async(k,draft)=>{
   const session=get(k),job=jobs.get(k);if(session.tool!=='codex'||job?.status!=='failed'||job.reason!=='codex_writer_conflict')throw Error('目前狀態不適用此備案。');
   if(typeof draft!=='string'||!draft.trim()||draft.length>12000)throw Error('請先輸入要複製的任務。');
   try{clipboard.writeText(draft)}catch{throw Error('複製失敗，草稿仍保留；沒有開啟 Codex。')}
   const explorer=path.join(process.env.SystemRoot||'C:\\Windows','explorer.exe');
   try{await new Promise((resolve,reject)=>execFile(explorer,['shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App'],{windowsHide:true},e=>e?reject(e):resolve()))}catch{return {copied:true,opened:false}}
   return {copied:true,opened:true};
  });
  bind('chooseClaude',async()=>{
   const r=await dialog.showOpenDialog(win,{title:'選擇 Claude Code 的 claude.exe',properties:['openFile'],filters:[{name:'Claude Code CLI',extensions:['exe']}]});
   if(r.canceled)return false;
   const exe=r.filePaths[0];if(path.basename(exe).toLowerCase()!=='claude.exe')throw Error('請選擇 claude.exe。');
   state.settings.claudeExe=exe;save();return true;
  });
  bind('send',async(k,value)=>{
   const s=get(k), prompt=typeof value==='string'?value.trim():'';
   if(!prompt||prompt.length>12000)throw Error('請輸入 1 至 12,000 字。');
   if(validating.has(k)||['running','confirming'].includes(jobs.get(k)?.status)||h.history(s).busy)throw Error('聊天室仍有任務在執行。');
   if(!fs.existsSync(s.cwd))throw Error('原工作目錄不存在。');
   const selected={...(state.settings.chatModels?.[k]||{})};let options={};validating.add(k);
   try{if(s.tool==='codex'&&Object.keys(selected).length)options=validateSelection(selected,selected.model?await codexModels():[]);else if(s.tool==='claude'&&Object.keys(selected).length){const data=claudeModels(s.cwd);options=validateClaudeSelection(selected,data.models,state.settings.chatModelContexts?.[k],data.context)}else if(s.tool!=='codex'&&s.tool!=='claude'&&Object.keys(selected).length)throw Error('此工具目前只支援沿用原設定。');if(h.history(s).busy)throw Error('聊天室仍有任務在執行。')}finally{validating.delete(k)}
   const offset=fs.statSync(s.file).size;
   const job={status:'running',time:Date.now()};jobs.set(k,job);updatePet();
   setImmediate(async()=>{
    try{
     const receipt=await (s.tool==='codex'?h.codex(s,prompt,options):h.claude(s,prompt,claudeExe(),options));
     job.status='confirming';job.time=Date.now();updatePet();if(!win.isDestroyed())win.webContents.send('agent:changed',k);
     const evidence=await waitResult(s,offset,receipt);job.status='completed';job.time=Date.now();job.marker=evidence.marker;job.turn=evidence.turn;
     petCompleted.unshift({key:k,tool:s.tool,title:s.title||'未命名對話',status:'completed',time:job.time});if(petCompleted.length>5)petCompleted.length=5;
     notify(state.settings.windowsNotifications===true,k,evidence.turn,s.tool);
    }catch(e){job.status=job.status==='confirming'?'result_unavailable':'failed';job.error=e.message;if(s.tool==='codex'&&job.status==='failed'&&e.code==='CODEX_WRITER_CONFLICT')job.reason='codex_writer_conflict'}
    job.time=Date.now();updatePet();if(!win.isDestroyed())win.webContents.send('agent:changed',k);
   });
   return true;
  });
  win.on('close',e=>{if([...jobs.values()].some(j=>['running','confirming'].includes(j.status))){e.preventDefault();dialog.showMessageBox(win,{type:'info',message:'有任務正在執行，完成後才能關閉 MaxAgent。'}).catch(()=>{})}});
  win.on('closed',()=>{quitting=true;setPetVisible(false);app.quit()});
  win.loadFile(path.join(__dirname,'index.html'));
  if(state.settings.desktopPet===true)setPetVisible(true);
 });
 app.on('before-quit',()=>{quitting=true});
 app.on('window-all-closed',()=>app.quit());
}
