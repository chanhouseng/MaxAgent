'use strict';
// Electron and the authenticated pipe are real; only the DSH Agent is replaced.
const electron=require('electron'),Module=require('node:module'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const link=require('./dsh-link'),setup=require('./dsh-link-setup');
const root=process.env.MAXAGENT_DSH_FIXTURE_ROOT||fs.mkdtempSync(path.join(os.tmpdir(),'maxagent-dsh-dispatch-')),config=path.join(root,'pairing.json');
const profile=path.join(root,'profiles','desktop'),app=electron.app;
fs.mkdirSync(profile,{recursive:true});
fs.writeFileSync(path.join(profile,'package.json'),'{}');
fs.writeFileSync(path.join(profile,'cordis.patch.yml'),'# fixture\n');
app.setName('MaxAgent DSH dispatch fixture');app.setPath('userData',root);
const id='session-11111111111111111111111111111111',key='dsh:'+id;
const keyB='dsh:session-22222222222222222222222222222222';
const s={tool:'dsh',id,cwd:root,title:'DSH local fixture',busy:false,time:Date.now()};
let bridge,ticket,sends=0,catalogContext='live-1';const events=[];
function add(type,data){events.push({seq:events.length,type,data})}
const load=Module._load;Module._load=function(req,parent){
 if(parent?.filename.endsWith(path.join('desktop','main.js'))){
  if(req==='./harness')return {...load.apply(this,arguments),list:()=>[s,{...s,id:keyB.slice(4),title:'Second local fixture'}],history:()=>({messages:[],busy:false,historyUnavailable:true})};
  if(req==='./dsh-link')return {...link,createClient:()=>link.createClient(config)};
  if(req==='./dsh-link-setup')return {configure:enabled=>setup.configure(enabled,{file:config,home:root})};
  if(req==='electron')return {...electron,dialog:{showMessageBox:async()=>({response:0})}};
 }
 return load.apply(this,arguments);
};
async function until(fn){for(let i=0;i<200;i++){if(await fn())return;await new Promise(r=>setTimeout(r,40))}throw Error('fixture timeout')}
app.on('browser-window-created',(_,w)=>w.webContents.once('did-finish-load',async()=>{try{
 const run=js=>w.webContents.executeJavaScript(js),api=expr=>run('window.maxagent.'+expr);
 const session=JSON.stringify(key);
 if(process.env.MAXAGENT_DSH_VERIFY_RESTART){await until(()=>run("document.querySelectorAll('.chat-card').length===2"));assert.equal((await api('getChatModel('+session+')')).selection.model,'provider/model-a');assert.equal((await api('getChatModel('+JSON.stringify(keyB)+')')).selection.model,undefined);console.log('DSH model choices restored after process restart; second chat remains independent: passed');app.exit(0);return}
 await until(()=>run("document.querySelectorAll('.chat-card').length===2"));
 assert.deepEqual(await api('getDshLink()'),{paired:false,connected:false});
 await run("document.querySelector('#settings').click();document.querySelector('#dsh-link-enable').click()");
 await until(()=>fs.existsSync(config));
 bridge=link.createServer(config,{get:k=>k===id?{id,cwd:root,seq:events.length,events:(from,to)=>events.slice(from,to)}:null,
  models:async()=>({models:[{id:'provider/model-a',label:'Provider · Model A',efforts:[]}],context:catalogContext}),
  async send(k,text,requestId,options){assert.equal(options.model,'provider/model-a');assert.equal(options.context,'live-1');assert.equal(k,id);assert.equal(text,'local DSH task');sends++;ticket=requestId;add('agent/inbox/spliced',{inserted:[{source:{kind:'user',rpcId:ticket}}]});return {accepted:true}}});
 await bridge.ready;assert.deepEqual(await api('getDshLink()'),{paired:true,connected:true});
 await run("document.querySelector('#settings-close').click();Array.from(document.querySelectorAll('.chat-card')).find(x=>x.dataset.key==='dsh:session-11111111111111111111111111111111').click()");
 await until(()=>run("!document.querySelector('#send').hidden && !document.querySelector('#composer').hidden"));
 assert.equal(await run("document.querySelector('#model-trigger').hidden"),false);
 await until(()=>run("Array.from(document.querySelectorAll('#model-choices button')).some(x=>x.dataset.value==='provider/model-a')"));
 await run("Array.from(document.querySelectorAll('#model-choices button')).find(x=>x.dataset.value==='provider/model-a').click()");
 await until(async()=>((await api('getChatModel('+session+')')).selection.model==='provider/model-a'));
 catalogContext='live-2';
 await assert.rejects(()=>api('send('+session+',"fixture must not send")'),/重新選擇/);assert.equal(sends,0);
 catalogContext='live-1';
 await run("document.querySelector('#prompt').value='local DSH task';document.querySelector('#prompt').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#send').click()");
 await until(()=>run("document.querySelector('#notice').textContent.includes('DSH 已接收並排隊')"));
 await assert.rejects(()=>api(`send(${session},'local DSH task')`),/勿重送/);
 await assert.rejects(()=>api(`copyDshDraft(${session})`),/勿重送/);
 add('turn/start',{turn:7});add('user/message',{source:{kind:'user',rpcId:ticket},content:[{type:'text',text:'local DSH task'}]});
 await until(()=>run("document.querySelector('#status').textContent.includes('確認結果中')"));
 add('assistant/message',{turn:7,message:{content:[{type:'text',text:'same original DSH turn'}]}});
 add('turn/end',{turn:7,reason:{kind:'completed'}});
 await until(()=>run("document.querySelector('#status').textContent.includes('已完成') && document.querySelector('#history').textContent.includes('same original DSH turn')"));
 assert.equal(sends,1);
 assert.equal((await api(`getDraft(${session})`)).text,'');
 await api('setDshLink(false)');assert.deepEqual(await api('getDshLink()'),{paired:false,connected:false});
 assert.equal(fs.readFileSync(path.join(profile,'cordis.patch.yml'),'utf8'),'# fixture\n');
 await bridge.close();

 console.log('DSH pairing, authenticated original dispatch, queue, matched reply, draft and revocation: passed');app.exit(0);
}catch(e){await bridge?.close();console.error(e.stack);app.exit(1)}}));
require('./main');
