const electron=require('electron'),Module=require('module'),fs=require('fs'),os=require('os'),path=require('path'),assert=require('node:assert/strict');
const app=electron.app,dir=process.env.MAXAGENT_PET_FIXTURE_DIR,stage=process.env.MAXAGENT_PET_FIXTURE_STAGE;
if(!dir||!stage)throw Error('fixture directory and stage required');app.setName('MaxAgent-pet-fixture');app.setPath('userData',dir);
process.env.CLAUDE_CONFIG_DIR=path.join(dir,'fixture-claude-settings');fs.mkdirSync(process.env.CLAUDE_CONFIG_DIR,{recursive:true});const settingsFile=path.join(process.env.CLAUDE_CONFIG_DIR,'settings.json');if(!fs.existsSync(settingsFile))fs.writeFileSync(settingsFile,JSON.stringify({model:'fixture-model',hooks:{Stop:[{hooks:[{type:'command',command:'fixture-existing'}]}]}}));
const chatId='11111111-2222-4333-8444-555555555555';
const claudeId='22222222-2222-4333-8444-555555555555';
const records=['a','b','c',claudeId,chatId].map((id,i)=>({tool:i%2?'claude':'codex',id,title:'本機模擬 '+id,cwd:dir,file:path.join(dir,id+'.jsonl'),last:'old',busy:false}));records.forEach(s=>fs.writeFileSync(s.file,''));
const opened=[],claudeOpened=[];let rejectLink=false,rejectClaude=false;electron.shell.openExternal=async url=>{if(rejectLink)throw Error('fixture: no protocol handler');opened.push(url)};
const pending=new Map();const fake={list:()=>records,history:()=>({messages:[],last:'old',busy:false}),codex:s=>new Promise((resolve,reject)=>pending.set(s.id,{resolve,reject})),claude:s=>new Promise((resolve,reject)=>pending.set(s.id,{resolve,reject}))};
const original=Module._load;Module._load=function(req,parent){if(parent?.filename.endsWith(path.join('desktop','main.js'))){if(req==='electron')return {...electron,Notification:class {static isSupported(){return true} on(){} show(){}}};if(req==='./harness')return fake;if(req==='./adapters/opencode')return {createDesktopService:()=>({list:async()=>[]})};if(req==='./claude-open')return {openClaudeChat:async(s,exe)=>{if(s?.tool!=='claude'||rejectClaude)return false;claudeOpened.push({id:s.id,cwd:s.cwd,exe});return true}};if(req==='./model-settings')return {codexModels:async()=>[],validateSelection:x=>x,claudeModels:()=>({models:[],context:null,reason:'目前 Claude 設定沒有可辨識的模型映射，沿用原工具設定。'})};if(req==='./result-evidence')return {waitResult:async(_s,_o,r)=>{if(r.missing)throw Error('本機模擬未確認');return {marker:'new',turn:'fixture'}}}}return original.apply(this,arguments)};
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn){for(let i=0;i<120;i++){if(await fn())return;await pause(50)}throw Error('等待逾時')}
app.on('browser-window-created',(_,main)=>{if(main.getTitle()!=='MaxAgent')return;main.webContents.once('did-finish-load',async()=>{try{
 const run=s=>main.webContents.executeJavaScript(s);await until(()=>run("document.querySelectorAll('.chat-card').length===5"));
 if(stage==='first'){
 await run("document.querySelector('#settings').click()");await until(()=>run("!document.querySelector('#claude-pet-hook').disabled"));await run("document.querySelector('#claude-pet-hook').click()");await until(()=>run("document.querySelector('#claude-pet-hook-status').textContent.includes('已加入')"));assert.equal(JSON.parse(fs.readFileSync(settingsFile)).model,'fixture-model');await run("document.querySelector('#claude-pet-hook').click()");await until(()=>run("document.querySelector('#claude-pet-hook-status').textContent.includes('已移除')"));assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile)),{model:'fixture-model',hooks:{Stop:[{hooks:[{type:'command',command:'fixture-existing'}]}]}});await run("document.querySelector('#settings-close').click()");
 assert.equal(await run('window.maxagent.getPreferences().then(p=>p.desktopPet)'),false);assert.equal(electron.BrowserWindow.getAllWindows().length,1);
 main.focus();await run("document.querySelector('#search').focus()");const focusedBefore=main.isFocused();await run("window.maxagent.setPreference('desktopPet',true)");await until(()=>electron.BrowserWindow.getAllWindows().length===2);await pause(400);assert.equal(await run("document.activeElement.id"),'search');console.log('main focused before pet:',focusedBefore,'after:',main.isFocused());if(focusedBefore)assert.equal(main.isFocused(),true);
 await run("window.maxagent.setPreference('desktopPet',true)");assert.equal(electron.BrowserWindow.getAllWindows().length,2);
 const pet=electron.BrowserWindow.getAllWindows().find(x=>x!==main);let petGone=false;pet.on('closed',()=>{petGone=true});pet.webContents.on('render-process-gone',()=>{petGone=true});await until(()=>!pet.webContents.isLoadingMainFrame());
 const area=electron.screen.getDisplayMatching(main.getBounds()).workArea,bounds=pet.getContentBounds();assert.ok(Math.abs(bounds.x-(area.x+area.width-bounds.width-12))<=2);assert.ok(Math.abs(bounds.y-(area.y+12))<=2);assert.equal(pet.isMovable(),false);assert.ok(Math.abs(bounds.width-64)<=2,JSON.stringify(bounds));assert.ok(Math.abs(bounds.height-64)<=2);assert.equal(await pet.webContents.executeJavaScript("document.querySelector('#lists').hidden"),true);await run("window.maxagent.setPreference('petMovable',true)");assert.equal(pet.isMovable(),true);await run("window.maxagent.setPreference('petMovable',false)");assert.equal(pet.isMovable(),false);
 assert.equal(await pet.webContents.executeJavaScript("document.querySelector('#running-section').hidden && document.querySelector('#recent-section').hidden && !document.querySelector('#empty-state').hidden && document.querySelector('#empty-state').textContent==='沒有內容'"),true);
 const ev=(type,payload)=>JSON.stringify({type,payload})+'\n';fs.appendFileSync(records[0].file,ev('event_msg',{type:'task_started',turn_id:'external-one'}));await run('window.maxagent.list(true)');await until(()=>pet.webContents.executeJavaScript("document.querySelector('#running').textContent.includes('Codex 原紀錄')"));assert.equal(await pet.webContents.executeJavaScript("!document.querySelector('#running-section').hidden && document.querySelector('#recent-section').hidden && document.querySelector('#empty-state').hidden"),true);fs.appendFileSync(records[0].file,ev('response_item',{type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'fixture'}]})+ev('event_msg',{type:'task_complete',turn_id:'external-one'}));await run('window.maxagent.list(true)');await until(()=>pet.webContents.executeJavaScript("document.querySelector('#recent').textContent.includes('Codex 原紀錄')"));const view=script=>pet.webContents.executeJavaScript(script);assert.equal(await view("document.querySelector('#running-section').hidden && !document.querySelector('#recent-section').hidden && document.querySelector('#empty-state').hidden"),true);
 await until(()=>view("document.querySelector('#dot').classList.contains('pending')"));
 assert.equal(await view("getComputedStyle(document.querySelector('#dot'),'::before').animationIterationCount"),'infinite');
 await view("document.querySelector('#dot').click()");
 await until(()=>view("!document.querySelector('#lists').hidden"));
 assert.ok(pet.getContentBounds().width>64);
 assert.equal(await view("document.querySelector('#dot').classList.contains('pending')"),false);
 assert.deepEqual(await view("Array.from(document.querySelectorAll('h2'),h=>h.textContent)"),['處理中','剛完成']);
 assert.equal(await view("document.querySelector('header')"),null);
 await view("document.querySelector('#dot').click()");
 await until(()=>view("document.querySelector('#lists').hidden"));
 for(const key of Object.keys(bounds))assert.ok(Math.abs(pet.getContentBounds()[key]-bounds[key])<=2,key);
 fs.appendFileSync(records[0].file,ev('event_msg',{type:'task_started',turn_id:'external-interrupted'}));await run('window.maxagent.list(true)');await until(()=>view("!document.querySelector('#running-section').hidden && document.querySelector('#recent-section').hidden"));fs.appendFileSync(records[0].file,ev('event_msg',{type:'turn_aborted',turn_id:'external-interrupted'}));await run('window.maxagent.list(true)');await until(()=>view("document.querySelector('#running-section').hidden && document.querySelector('#recent-section').hidden"));
 fs.appendFileSync(records[0].file,ev('event_msg',{type:'task_started',turn_id:'external-two'})+ev('response_item',{type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'fixture'}]})+ev('event_msg',{type:'task_complete',turn_id:'external-two'}));await run('window.maxagent.list(true)');await until(()=>pet.webContents.executeJavaScript("document.querySelector('#dot').classList.contains('pending') && document.querySelectorAll('#recent li').length===1")); await view("document.querySelector('#dot').click()");await until(()=>view("!document.querySelector('#lists').hidden"));
 fs.appendFileSync(records[0].file,ev('event_msg',{type:'task_started',turn_id:'fast-abort'})+ev('event_msg',{type:'turn_aborted',turn_id:'fast-abort'}));await run('window.maxagent.list(true)');await until(()=>view("document.querySelector('#running-section').hidden && document.querySelector('#recent-section').hidden"));
 await run("window.maxagent.setDraft('codex:a','fixture').then(()=>window.maxagent.send('codex:a','fixture'))");await run("window.maxagent.setDraft('claude:b','fixture').then(()=>window.maxagent.send('claude:b','fixture'))");await until(()=>pending.size===2);await until(()=>pet.webContents.executeJavaScript("document.querySelectorAll('#running li').length===2"));
 assert.equal(await pet.webContents.executeJavaScript("!document.querySelector('#running-section').hidden && document.querySelector('#recent-section').hidden && document.querySelector('#empty-state').hidden"),true);pending.get('a').resolve({});pending.get('b').reject(Error('本機模擬失敗'));await until(()=>pet.webContents.executeJavaScript("document.querySelector('#recent').textContent.includes('本機模擬 a')"));assert.equal(await pet.webContents.executeJavaScript("document.querySelector('#recent').textContent.includes('本機模擬 b')"),false);
 await run("window.maxagent.setDraft('codex:c','fixture').then(()=>window.maxagent.send('codex:c','fixture'))");await until(()=>pending.has('c'));pending.get('c').resolve({missing:true});await until(()=>run("window.maxagent.list().then(x=>x.find(y=>y.key==='codex:c').job.status==='result_unavailable')"));assert.equal(await pet.webContents.executeJavaScript("document.querySelector('#recent').textContent.includes('本機模擬 c')"),false);
 assert.equal(await run('window.maxagent.getPreferences().then(p=>p.windowsNotifications)'),false);await run("window.maxagent.setPreference('windowsNotifications',true)");await run("window.maxagent.setPreference('petMovable',true)");assert.equal(await run('window.maxagent.getPreferences().then(p=>p.desktopPet)'),true);
 const petRun=s=>pet.webContents.executeJavaScript(s);
 fs.appendFileSync(records[4].file,ev('event_msg',{type:'task_started',turn_id:'link-turn'}));await run('window.maxagent.list(true)');await until(()=>petRun("!!document.querySelector('#running [data-tool=codex]')"));
 await petRun("document.querySelector('#running [data-tool=codex]').click()");await until(()=>opened.length===1);assert.equal(opened[0],'codex://threads/'+chatId);
 fs.appendFileSync(records[4].file,ev('response_item',{type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'fixture'}]})+ev('event_msg',{type:'task_complete',turn_id:'link-turn'}));await run('window.maxagent.list(true)');
 const recentButton='#recent button[aria-label$="'+chatId+'"]';await until(()=>petRun('!!document.querySelector('+JSON.stringify(recentButton)+')'));await petRun('document.querySelector('+JSON.stringify(recentButton)+').click()');await until(()=>opened.length===2);assert.equal(opened[1],opened[0]);
 assert.equal(await petRun("window.pet.openChat('claude:missing')"),false);assert.equal(await petRun("window.pet.openChat('codex:new')"),false);
 rejectLink=true;await petRun('document.querySelector('+JSON.stringify(recentButton)+').click()');await until(()=>petRun("document.querySelector('#open-status').textContent.includes('無法開啟')"));assert.equal(opened.length,2);console.log('Codex chat links: running, completed, invalid targets and launch error');
 await run("window.maxagent.setDraft('claude:"+claudeId+"','fixture').then(()=>window.maxagent.send('claude:"+claudeId+"','fixture'))");await until(()=>pending.has(claudeId));pending.get(claudeId).resolve({});
 const claudeButton='#recent button[data-tool=claude]';
 await until(()=>petRun('!!document.querySelector('+JSON.stringify(claudeButton)+')'));
 await petRun('document.querySelector('+JSON.stringify(claudeButton)+').click()');
 await until(()=>claudeOpened.length===1);
 assert.equal(claudeOpened[0].id,claudeId);assert.equal(claudeOpened[0].cwd,dir);
 rejectClaude=true;
 await petRun('document.querySelector('+JSON.stringify(claudeButton)+').click()');
 await until(()=>petRun("document.querySelector('#open-status').textContent.includes('無法開啟 Claude 桌面版')"));
 console.log('Claude Code completed row: exact original ID, project directory and launch failure');
 await run("document.querySelector('#settings').click()");
 for(const [lang,title,done,search] of [
  ['zh-Hans','所有对话','刚完成','搜索对话或项目'],
  ['en','All conversations','Recently completed','Search conversations or projects'],
  ['zh-Hant','所有對話','剛完成','搜尋對話或專案'],
  ['pt','Todas as conversas','Concluídas recentemente','Buscar conversas ou projetos'],
 ]){
  await run(`{const select=document.querySelector('#language');select.value=${JSON.stringify(lang)};select.dispatchEvent(new Event('change',{bubbles:true}))}`);
  await until(()=>run(`document.documentElement.lang===${JSON.stringify(lang)} && !document.querySelector('#language').disabled`));
  await until(()=>petRun(`document.documentElement.lang===${JSON.stringify(lang)}`));
  assert.equal(await run("document.querySelector('.overview-head h1').textContent"),title);
  assert.equal(await run("document.querySelector('#search').placeholder"),search);
  assert.equal(await petRun("document.querySelectorAll('h2')[1].textContent"),done);
  assert.equal(await petRun("document.querySelector('#recent [data-tool=claude] .chat-name').textContent"),'本機模擬 '+claudeId);
 }
 await run("document.querySelector('#settings-close').click();document.querySelector('[data-key=\"claude:b\"]').click()");
 await until(()=>run("!document.querySelector('#composer').hidden"));
 await until(()=>run("document.querySelector('#model-help').textContent.includes('Nenhum mapeamento')"));
 assert.match(await run("document.querySelector('#send').textContent"),/Enviar tarefa/);
 assert.equal(await run("document.querySelector('#history').getAttribute('aria-label')"),'Histórico da conversa');
 assert.equal(petGone,false);assert.equal(pet.isDestroyed(),false);console.log('FIRST: default off, single window, focus, two running, confirmed success, failure, missing result, notification independent, pet window and renderer remained open');app.exit(0);
 }else{
 await until(()=>run("document.documentElement.lang==='pt'"));
 assert.equal(await run("document.querySelector('#language').value"),'pt');
 assert.equal(await run("document.querySelector('.overview-head h1').textContent"),'Todas as conversas');
 assert.equal(await run('window.maxagent.getPreferences().then(p=>p.desktopPet)'),true);assert.equal(await run('window.maxagent.getPreferences().then(p=>p.petMovable)'),true);await until(()=>electron.BrowserWindow.getAllWindows().length===2);const pet=electron.BrowserWindow.getAllWindows().find(x=>x!==main);assert.equal(pet.isMovable(),true);pet.close();await until(()=>run('window.maxagent.getPreferences().then(p=>!p.desktopPet)'));await until(()=>run("document.querySelector('#desktop-pet').checked===false"));assert.equal(electron.BrowserWindow.getAllWindows().length,1);assert.equal(await run('window.maxagent.getPreferences().then(p=>p.windowsNotifications)'),true);console.log('SECOND: restart restored, manual close persisted and checkbox synchronized, notification independent');app.exit(0);
 }
 }catch(e){console.error(e.stack);app.exit(1)}})});require('./main.js');
