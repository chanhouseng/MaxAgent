'use strict';
// Generate an isolated --settings file; this never edits Claude's settings.
const path=require('node:path');
const fs=require('node:fs');
const node=process.execPath.replace(/\\/g,'/'),hook=path.join(__dirname,'claude-pet-hook.js').replace(/\\/g,'/');
const command='"'+node+'" "'+hook+'"';
const entry=()=>[{hooks:[{type:'command',command,timeout:2}]}];
const config=JSON.stringify({hooks:{UserPromptSubmit:entry(),Stop:entry(),StopFailure:entry(),SessionEnd:entry(),Notification:[{matcher:'idle_prompt',hooks:[{type:'command',command,timeout:2}]}]}},null,2)+'\n';
if(process.argv[2]==='--write'&&process.argv[3]){fs.writeFileSync(process.argv[3],config,{encoding:'utf8',flag:'wx'});process.stdout.write('已建立獨立 Claude Hook 設定檔。\n')}else process.stdout.write(config);
