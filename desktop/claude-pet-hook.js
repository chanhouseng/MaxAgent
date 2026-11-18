'use strict';
// Claude passes the prompt and other private fields on stdin. Only forward the
// minimal event metadata; never write or log the input.
const net=require('node:net'),pipe=require('./claude-pet-pipe');let data='',oversize=false;
process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{if(data.length+s.length>1024*1024){oversize=true;data=''}else if(!oversize)data+=s});
process.stdin.on('end',()=>{try{if(oversize)return;const x=JSON.parse(data),type=x.hook_event_name==='Notification'&&x.notification_type==='idle_prompt'?'idle_prompt':x.hook_event_name;if(!['UserPromptSubmit','Stop','StopFailure','SessionEnd','idle_prompt'].includes(type)||x.agent_id||typeof x.session_id!=='string'||!/^[a-f0-9-]{36}$/i.test(x.session_id))return;const event={type,session:x.session_id,...(type==='Stop'?{backgroundClear:Array.isArray(x.background_tasks)&&x.background_tasks.length===0}: {})};const socket=net.connect(pipe,()=>socket.end(JSON.stringify(event)+'\n'));socket.setTimeout(500,()=>socket.destroy());socket.on('error',()=>{});}catch{}});
