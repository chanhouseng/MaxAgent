'use strict';
// Isolated Electron flow: fake process/address, real transcript matching, no model.
const electron=require('electron'),Module=require('node:module'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const peer=require('./claude-peer'),desktopModel=require('./claude-desktop-model'),models=require('./model-settings');
const app=electron.app,dir=fs.mkdtempSync(path.join(os.tmpdir(),'maxagent-claude-peer-fixture-'));
app.setName('MaxAgent Claude peer fixture');app.setPath('userData',dir);
const host='local_11111111-1111-4111-8111-111111111111';
const sessions=['success','no-receipt','model-changed'].map((title,i)=>({tool:'claude',title,id:`00000000-0000-4000-8000-00000000000${i+1}`,cwd:dir,file:path.join(dir,title+'.jsonl'),busy:false,time:Date.now()}));
for(const s of sessions)fs.writeFileSync(s.file,'{}\n');
const model={id:'sonnet',label:'Sonnet'},alerts=[],writes=new Map();
let activeModel='sonnet',offset=0,cliCalls=0;
const realNow=Date.now;Date.now=()=>realNow()+offset;
const append=(s,rows)=>fs.appendFileSync(s.file,rows.map(r=>JSON.stringify({sessionId:s.id,...r})).join('\n')+'\n');
function recordReceipt(s){const ticket=writes.get(s.id);append(s,[{type:'user',uuid:'original-input',turnOrigin:'peer',message:{content:'Another Claude session sent a message:\n'+peer.prefix(ticket)+'\nlocal fixture'}}])}
function recordReply(s){append(s,[{type:'assistant',uuid:'original-answer',parentUuid:'original-input',message:{stop_reason:'end_turn',content:[{type:'text',text:'local result'}]}},{type:'system',subtype:'stop_hook_summary',uuid:'done',parentUuid:'original-answer',preventedContinuation:false,stopReason:'',hookErrors:[],hookAdditionalContext:[]}])}
const load=Module._load;
Module._load=function(req,parent){
 if(parent?.filename.endsWith(path.join('desktop','main.js'))){
  if(req==='electron')return {...electron,dialog:{showMessageBox:async(_window,data)=>{alerts.push(data);return {response:0}}}};
  if(req==='./harness')return {...load.apply(this,arguments),list:()=>sessions,history:()=>({messages:[],busy:false}),claude:()=>{cliCalls++;throw Error('unexpected CLI fallback')}};
  if(req==='./claude-desktop-model')return {...desktopModel,readDesktopModel:()=>({status:'ok',model:activeModel,host}),resolveDesktopModel:m=>m==='sonnet'?model:null};
  if(req==='./model-settings')return {...models,claudeModels:()=>({models:[model],context:'fixture'})};
  if(req==='./claude-peer')return {...peer,discover:id=>sessions.find(s=>s.id===id),async send(s,_text,ticket,beforeWrite){
   if(s.title==='model-changed')activeModel='haiku';
   try{beforeWrite()}catch(e){e.sendPhase='not_sent';throw e}
   assert.ok(!writes.has(s.id));writes.set(s.id,ticket);
  }};
 }
 return load.apply(this,arguments);
};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<200;i++){if(await check())return;await pause(50)}throw Error('fixture timed out')}
app.on('browser-window-created',(_,w)=>w.webContents.once('did-finish-load',async()=>{try{
 const run=js=>w.webContents.executeJavaScript(js),key=s=>JSON.stringify('claude:'+s.id);
 const job=s=>run(`window.maxagent.history(${key(s)}).then(x=>x.job)`);
 const draft=s=>run(`window.maxagent.getDraft(${key(s)}).then(x=>x.text)`);
 const send=s=>run(`window.maxagent.setDraft(${key(s)},'local fixture').then(()=>window.maxagent.send(${key(s)},'local fixture'))`);
 await run('window.maxagent.list(true)');
 const [success,lost,changed]=sessions;
 await send(success);await until(()=>writes.has(success.id));
 assert.equal((await job(success)).phase,'possibly_sent');assert.equal(await draft(success),'local fixture');
 recordReceipt(success);await until(async()=>(await job(success)).phase==='accepted');
 assert.equal((await job(success)).status,'confirming');assert.equal(await draft(success),'local fixture');
 recordReply(success);await until(async()=>(await job(success)).status==='completed');
 assert.equal(await draft(success),'');
 await send(lost);await until(()=>writes.has(lost.id));offset+=31000;
 await until(()=>alerts.some(d=>d.message==='無法確認 Claude 是否收到本次任務'));
 assert.equal((await job(lost)).status,'result_unavailable');assert.equal(await draft(lost),'local fixture');
 await assert.rejects(()=>send(lost),/勿重送/);
 recordReceipt(lost);await until(async()=>(await job(lost)).phase==='accepted');
 recordReply(lost);await until(async()=>(await job(lost)).status==='completed');
 await send(changed);await until(()=>alerts.some(d=>d.message==='Claude 沒有收到本次任務'&&d.detail.includes('模型或供應商已變更')));
 assert.equal((await job(changed)).status,'failed');assert.equal(await draft(changed),'local fixture');
 assert.equal(writes.size,2);assert.equal(cliCalls,0);
 console.log('Claude desktop receipt, original reply, timeout, late recovery, model change and no retry: passed (local fixture)');app.exit(0);
}catch(e){console.error(e.stack);app.exit(1)}}));
require('./main');
