// Read-only check against existing OpenCode records; no tool is started.
const {app}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const assert=require('node:assert/strict');
const {createOpenCodeAdapter}=require('./adapters/opencode');
const adapter=createOpenCodeAdapter(),existing=adapter.list();
assert(existing.length>0,'No existing OpenCode chats found');
const original=Module._load;
Module._load=function(request,parent){
 if(request==='./model-settings'&&parent?.filename===path.join(__dirname,'main.js'))return {...original.apply(this,arguments),codexModels:async()=>[]};
 return original.apply(this,arguments);
};
app.setName('MaxAgent-opencode-check');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'maxagent-opencode-')));
async function until(fn){
 for(let i=0;i<200;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,50))}
 throw Error('Timed out waiting for OpenCode history');
}
app.on('browser-window-created',(_event,win)=>{
 if(win.getTitle()!=='MaxAgent')return;
 win.webContents.once('did-finish-load',async()=>{
  try{
   const run=code=>win.webContents.executeJavaScript(code);
   await until(()=>run("document.querySelectorAll('.chat-card').length>0"));
   await run("document.querySelector('[data-filter=opencode]').click()");
   await until(async()=>await run("document.querySelectorAll('.chat-card').length")===existing.length);
   const keys=await run("Array.from(document.querySelectorAll('.chat-card'),c=>c.dataset.key)");
   assert.deepEqual(keys.sort(),existing.map(s=>'opencode:'+s.id).sort());
   let count=0;
   for(const s of existing){
    const selector=JSON.stringify('[data-key="opencode:'+s.id+'"]');
    await run(`document.querySelector(${selector}).click()`);
    await until(()=>run("!document.querySelector('#history').hidden"));
    const expected=adapter.history(s);
    const data=await run(`window.maxagent.history(${JSON.stringify('opencode:'+s.id)})`);
    assert.deepEqual(data.messages,expected.messages.slice(-2),'Latest page must match the original OpenCode chat');
    assert.equal(await run("document.querySelectorAll('#history article').length"),data.messages.length);
    assert.equal(await run("document.querySelector('#composer').hidden"),true);
    assert.equal(await run("document.querySelector('#badge').textContent"),'OpenCode');
    if(data.cursor){
     const earlier=await run(`window.maxagent.history(${JSON.stringify('opencode:'+s.id)},${data.cursor})`);
     assert.deepEqual(earlier.messages,expected.messages.slice(Math.max(0,data.cursor-2),data.cursor));
    }
    count+=expected.messages.length;
    await run("document.querySelector('#back').click()");
    await until(()=>run("!document.querySelector('#overview').hidden"));
   }
   console.log(`OpenCode desktop: ${existing.length} original chats, ${count} text messages; filter, history, pagination and read-only UI verified`);
   app.exit(0);
  }catch(error){console.error(error.message);app.exit(1)}
 });
});
require('./main');
