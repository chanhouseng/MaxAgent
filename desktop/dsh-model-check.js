'use strict';
// Isolated Electron UI and restart check; the DSH Agent and tasks are local substitutes.
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'maxagent-dsh-model-check-'));
async function run(restart){
 return new Promise((resolve,reject)=>{
  let output='';
  const child=spawn(require('electron'),[path.join(__dirname,'dsh-dispatch-fixture.js')],{
   windowsHide:true,stdio:['ignore','pipe','pipe'],
   env:{...process.env,MAXAGENT_DSH_FIXTURE_ROOT:root,MAXAGENT_DSH_VERIFY_RESTART:restart?'1':''}
  });
  for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output+=data;process.stdout.write(data)});
  child.on('error',reject);
  child.on('exit',code=>code===0&&output.includes(restart?'choices restored after process restart':'queue, matched reply')?resolve():reject(Error('DSH isolated check did not reach verified completion')));
 });
}
(async()=>{await run(false);await run(true)})().catch(e=>{console.error(e.message);process.exitCode=1});
