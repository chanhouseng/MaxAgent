const {app}=require('electron'), fs=require('fs'),os=require('os'),path=require('path');
app.setName('MaxAgent-history-validation');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'maxagent-history-')));
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn){for(let i=0;i<300;i++){if(await fn())return;await delay(100)}throw Error('history UI timeout')}
app.on('browser-window-created',(_e,win)=>win.webContents.once('did-finish-load',async()=>{try{
 const run=js=>win.webContents.executeJavaScript(js);
 for(const [tool,filter] of [['Codex','codex'],['Claude Code','claude']]){
 await run(`document.querySelector('[data-filter="${filter}"]').click()`);await until(async()=>await run("document.querySelectorAll('.entry').length>0"));
 await run("document.querySelector('.entry').click()");await until(async()=>await run(`document.querySelector('#badge').textContent===${JSON.stringify(tool)} && document.querySelectorAll('#history .message').length>0`));
 const count=await run("document.querySelectorAll('#history .message').length");console.log(tool+': history messages rendered='+count);
 }
 app.exit(0);
 }catch(e){console.error(e.message);app.exit(1)}}));
require('./main.js');
