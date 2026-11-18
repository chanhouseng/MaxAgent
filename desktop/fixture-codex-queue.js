'use strict';
// Isolated Electron fixture: no real Codex process, history, or model calls.
const electron=require('electron'),Module=require('node:module'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const app=electron.app;app.setName('MaxAgent queue fixture');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maxagent-queue-fixture-'));app.setPath('userData',dir);
const sessions=['one','two','three','four','five','rejected','no-receipt'].map(id=>({tool:'codex',id,title:'本機替身 '+id,cwd:dir,file:path.join(dir,id+'.jsonl'),busy:false,time:Date.now()}));for(const s of sessions)fs.writeFileSync(s.file,'');
const pending=new Map(),alerts=[];let adds=0,dialogResponse=0;
const actualHarness=require('./harness'),actualQueue=require('./codex-queue'),actualModels=require('./model-settings');
const fakeHarness={...actualHarness,list:()=>sessions,history:()=>({busy:false,messages:[]}),codex:async(s,_prompt,_opts,phase)=>{
 if(s.id==='rejected')throw Object.assign(Error('fixture rejected'),{sendPhase:'not_sent'});
 if(s.id==='no-receipt'){phase({phase:'possibly_sent'});throw Object.assign(Error('fixture lost receipt'),{sendPhase:'possibly_sent'})}
 throw Object.assign(Error('writer conflict'),{code:'CODEX_WRITER_CONFLICT',sendPhase:'not_sent'});
}};
const fakeQueue={...actualQueue,add:async(s,prompt,clientId)=>{adds++;pending.set(s.id,{clientId,prompt});return 'queue-'+s.id},list:async s=>pending.has(s.id)?[{id:'queue-'+s.id,clientUserMessageId:pending.get(s.id).clientId}]:[],cancel:async(s,id)=>{if(s.id==='three'||id!=='queue-'+s.id||!pending.has(s.id))return false;pending.delete(s.id);return true}};
const original=Module._load;Module._load=function(req,parent){if(parent?.filename.endsWith(path.join('desktop','main.js'))){if(req==='electron')return {...electron,dialog:{showMessageBox:async(_win,options)=>{if(options.title==='MaxAgent · Codex')alerts.push(options);return {response:dialogResponse}}}};if(req==='./harness')return fakeHarness;if(req==='./codex-queue')return fakeQueue;if(req==='./model-settings')return {...actualModels,codexModels:async()=>[]}}return original.apply(this,arguments)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,tries=100){for(let i=0;i<tries;i++){if(await fn())return;await sleep(100)}throw Error('等待模擬狀態逾時')}
app.on('browser-window-created',(_,w)=>w.webContents.once('did-finish-load',async()=>{try{
 const run=s=>w.webContents.executeJavaScript(s);await until(()=>run('Boolean(window.maxagent)'));
 await run("window.maxagent.list(true)");
 await run("window.maxagent.setDraft('codex:one','first').then(()=>window.maxagent.send('codex:one','first'))");
 await until(async()=>await run("window.maxagent.history('codex:one').then(x=>x.job?.status)")==='queued');
 const firstClient=pending.get('one').clientId;
 assert.equal(adds,1);let rejected=false;try{await run("window.maxagent.send('codex:one','first')")}catch{rejected=true}assert.equal(rejected,true);assert.equal(adds,1);
 assert.ok(alerts.some(x=>x.message==='本次未開始派工'&&x.detail.includes('排隊')));
 await run("window.maxagent.cancelCodexQueue('codex:one')");assert.equal(pending.has('one'),false);assert.equal(await run("window.maxagent.history('codex:one').then(x=>x.job.status)"),'result_unavailable');
 rejected=false;try{await run("window.maxagent.send('codex:one','first')")}catch{rejected=true}assert.equal(rejected,true);
 await run("window.maxagent.setDraft('codex:one','different').then(()=>window.maxagent.send('codex:one','different'))");await until(async()=>await run("window.maxagent.history('codex:one').then(x=>x.job?.status)")==='queued');assert.equal(adds,2);
 // Simulate the cancelled item being taken just before deletion; its late result
 // must still be reconciled while the newer job remains queued.
 const row=x=>JSON.stringify(x)+'\n';fs.appendFileSync(sessions[0].file,row({type:'event_msg',payload:{type:'task_started',turn_id:'late-turn'}})+row({type:'event_msg',payload:{type:'item_completed',turn_id:'late-turn',item:{type:'UserMessage',client_id:firstClient}}})+row({type:'event_msg',timestamp:'late-done',payload:{type:'task_complete',turn_id:'late-turn',last_agent_message:'完成'}}));
 await until(()=>{const state=JSON.parse(fs.readFileSync(path.join(dir,'maxagent-state.json'),'utf8'));return state.attempts['codex:one'][0].status==='completed'});
 assert.equal(await run("window.maxagent.history('codex:one').then(x=>x.job.status)"),'queued');assert.equal(await run("window.maxagent.getDraft('codex:one').then(x=>x.text)"),'different');
 await run("window.maxagent.setDraft('codex:three','pending').then(()=>window.maxagent.send('codex:three','pending'))");await until(async()=>await run("window.maxagent.history('codex:three').then(x=>x.job?.status)")==='queued');await run("window.maxagent.cancelCodexQueue('codex:three')");assert.equal(await run("window.maxagent.history('codex:three').then(x=>x.job.queueRemoved)"),false);await run("window.maxagent.setDraft('codex:three','new task')");rejected=false;try{await run("window.maxagent.send('codex:three','new task')")}catch{rejected=true}assert.equal(rejected,true);
 await run("window.maxagent.setDraft('codex:four','again').then(()=>window.maxagent.send('codex:four','again'))");await until(()=>pending.has('four'));await run("window.maxagent.cancelCodexQueue('codex:four')");const before=adds;assert.equal(await run("window.maxagent.reviewCodexResend('codex:four').then(x=>x.approved)"),false);assert.equal(adds,before);dialogResponse=1;assert.equal(await run("window.maxagent.reviewCodexResend('codex:four').then(x=>x.approved)"),true);assert.equal(await run("window.maxagent.history('codex:four').then(x=>x.job.resendApproved)"),true);assert.equal(adds,before);await run("window.maxagent.send('codex:four','again')");await until(()=>adds===before+1);
 await run("window.maxagent.setDraft('codex:five','late').then(()=>window.maxagent.send('codex:five','late'))");await until(()=>pending.has('five'));const lateClient=pending.get('five').clientId;await run("window.maxagent.cancelCodexQueue('codex:five')");await run("window.maxagent.reviewCodexResend('codex:five')");fs.appendFileSync(sessions[4].file,row({type:'event_msg',payload:{type:'task_started',turn_id:'late-approved'}})+row({type:'event_msg',payload:{type:'item_completed',turn_id:'late-approved',item:{type:'UserMessage',client_id:lateClient}}}));rejected=false;try{await run("window.maxagent.send('codex:five','late')")}catch{rejected=true}assert.equal(rejected,true);assert.equal(await run("window.maxagent.history('codex:five').then(x=>x.job.resendBlocked)"),true);
 await run("window.maxagent.setDraft('codex:two','second').then(()=>window.maxagent.send('codex:two','second'))");await until(()=>pending.has('two'));const clientId=pending.get('two').clientId;const line=x=>JSON.stringify(x)+'\n';fs.appendFileSync(sessions[1].file,line({type:'event_msg',payload:{type:'task_started',turn_id:'fixture-turn'}})+line({type:'event_msg',payload:{type:'item_completed',turn_id:'fixture-turn',item:{type:'UserMessage',client_id:clientId}}})+line({type:'event_msg',timestamp:'fixture-done',payload:{type:'task_complete',turn_id:'fixture-turn',last_agent_message:'完成'}}));
 await until(async()=>await run("window.maxagent.history('codex:two').then(x=>x.job.status)")==='completed');assert.equal(await run("window.maxagent.getDraft('codex:two').then(x=>x.text)"),'');
 for(const [id,message,status] of [['rejected','Codex 沒有收到本次任務','failed'],['no-receipt','無法確認 Codex 是否收到本次任務','result_unavailable']]){
  await run(`window.maxagent.setDraft('codex:${id}','local fixture').then(()=>window.maxagent.send('codex:${id}','local fixture'))`);
  await until(()=>alerts.some(x=>x.message===message&&x.detail.includes('本機替身 '+id)));
  assert.equal(await run(`window.maxagent.history('codex:${id}').then(x=>x.job.status)`),status);
  assert.equal(await run(`window.maxagent.getDraft('codex:${id}').then(x=>x.text)`),'local fixture');
 }
 const stillQueued=x=>x.message==='Codex 尚未確認接收任務';
 await until(()=>alerts.some(x=>stillQueued(x)&&x.detail.includes('本機替身 one')),360);
 assert.equal(alerts.filter(x=>stillQueued(x)&&x.detail.includes('本機替身 one')).length,1);
 assert.ok(!alerts.some(x=>stillQueued(x)&&x.detail.includes('本機替身 two')));
 assert.equal(await run("window.maxagent.history('codex:one').then(x=>x.job.status)"),'queued');
 console.log('排隊、取消、同輪完成、拒收、接收不明及派工彈窗：通過（本機替身）');app.exit(0);
 }catch(e){console.error(e.stack);app.exit(1)}}));require('./main');
