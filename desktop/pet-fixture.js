const electron=require('electron'),Module=require('module'),fs=require('fs'),os=require('os'),path=require('path'),assert=require('node:assert/strict');
const app=electron.app,dir=process.env.MAXAGENT_PET_FIXTURE_DIR,stage=process.env.MAXAGENT_PET_FIXTURE_STAGE;
if(!dir||!stage)throw Error('fixture directory and stage required');app.setName('MaxAgent-pet-fixture');app.setPath('userData',dir);
const records=['a','b','c','d'].map((id,i)=>({tool:i%2?'claude':'codex',id,title:'本機模擬 '+id,cwd:dir,file:path.join(dir,id+'.jsonl'),last:'old',busy:false}));records.forEach(s=>fs.writeFileSync(s.file,''));
const pending=new Map();const fake={list:()=>records,history:()=>({messages:[],last:'old',busy:false}),codex:s=>new Promise((resolve,reject)=>pending.set(s.id,{resolve,reject})),claude:s=>new Promise((resolve,reject)=>pending.set(s.id,{resolve,reject}))};
const original=Module._load;Module._load=function(req,parent){if(parent?.filename.endsWith(path.join('desktop','main.js'))){if(req==='./harness')return fake;if(req==='./model-settings')return {codexModels:async()=>[],validateSelection:x=>x};if(req==='./result-evidence')return {waitResult:async(_s,_o,r)=>{if(r.missing)throw Error('本機模擬未確認');return {marker:'new',turn:'fixture'}}}}return original.apply(this,arguments)};
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn){for(let i=0;i<120;i++){if(await fn())return;await pause(50)}throw Error('等待逾時')}
app.on('browser-window-created',(_,main)=>{if(main.getTitle()!=='MaxAgent')return;main.webContents.once('did-finish-load',async()=>{try{
 const run=s=>main.webContents.executeJavaScript(s);await until(()=>run("document.querySelectorAll('.chat-card').length===4"));
 if(stage==='first'){
 assert.equal(await run('window.maxagent.getPreferences().then(p=>p.desktopPet)'),false);assert.equal(electron.BrowserWindow.getAllWindows().length,1);
 main.focus();await run("document.querySelector('#search').focus()");const focusedBefore=main.isFocused();await run("window.maxagent.setPreference('desktopPet',true)");await until(()=>electron.BrowserWindow.getAllWindows().length===2);await pause(400);assert.equal(await run("document.activeElement.id"),'search');console.log('main focused before pet:',focusedBefore,'after:',main.isFocused());if(focusedBefore)assert.equal(main.isFocused(),true);
 await run("window.maxagent.setPreference('desktopPet',true)");assert.equal(electron.BrowserWindow.getAllWindows().length,2);
 const pet=electron.BrowserWindow.getAllWindows().find(x=>x!==main);await until(()=>!pet.webContents.isLoadingMainFrame());
 await run("window.maxagent.send('codex:a','fixture')");await run("window.maxagent.send('claude:b','fixture')");await until(()=>pending.size===2);await until(()=>pet.webContents.executeJavaScript("document.querySelectorAll('#running li').length===2"));
 pending.get('a').resolve({});pending.get('b').reject(Error('本機模擬失敗'));await until(()=>pet.webContents.executeJavaScript("document.querySelector('#recent').textContent.includes('本機模擬 a')"));assert.equal(await pet.webContents.executeJavaScript("document.querySelector('#recent').textContent.includes('本機模擬 b')"),false);
 await run("window.maxagent.send('codex:c','fixture')");await until(()=>pending.has('c'));pending.get('c').resolve({missing:true});await until(()=>run("window.maxagent.list().then(x=>x.find(y=>y.key==='codex:c').job.status==='result_unavailable')"));assert.equal(await pet.webContents.executeJavaScript("document.querySelector('#recent').textContent.includes('本機模擬 c')"),false);
 assert.equal(await run('window.maxagent.getPreferences().then(p=>p.windowsNotifications)'),false);await run("window.maxagent.setPreference('windowsNotifications',true)");assert.equal(await run('window.maxagent.getPreferences().then(p=>p.desktopPet)'),true);
 console.log('FIRST: default off, single window, focus, two running, confirmed success, failure, missing result, notification independent, persisted on');app.exit(0);
 }else{
 assert.equal(await run('window.maxagent.getPreferences().then(p=>p.desktopPet)'),true);await until(()=>electron.BrowserWindow.getAllWindows().length===2);const pet=electron.BrowserWindow.getAllWindows().find(x=>x!==main);pet.close();await until(()=>run('window.maxagent.getPreferences().then(p=>!p.desktopPet)'));await until(()=>run("document.querySelector('#desktop-pet').checked===false"));assert.equal(electron.BrowserWindow.getAllWindows().length,1);assert.equal(await run('window.maxagent.getPreferences().then(p=>p.windowsNotifications)'),true);console.log('SECOND: restart restored, manual close persisted and checkbox synchronized, notification independent');app.exit(0);
 }
 }catch(e){console.error(e.stack);app.exit(1)}})});require('./main.js');

