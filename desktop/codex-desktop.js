'use strict';
const net=require('node:net'),os=require('node:os'),{randomUUID}=require('node:crypto');
const {resolveCodexExe}=require('./codex-cli');
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const pipe='\\\\.\\pipe\\codex-ipc';
const supportedBuild='26.1111.2228.0';
function supportsDesktop(platform,arch,release,exe){
 return platform==='win32'&&arch==='x64'&&Number(release.split('.')[2])>=22000&&
  new RegExp('[/\\\\]WindowsApps[/\\\\]OpenAI\\.Codex_'+supportedBuild.replaceAll('.','\\.')+'_x64__2p2nqsd0c76g0[/\\\\]app[/\\\\]resources[/\\\\]codex\\.exe$','i').test(exe);
}
function connect(socket=net.connect(pipe)){
 let buffer=Buffer.alloc(0),pending=null,closed=false,client;
 const stop=()=>{closed=true;socket.destroy();pending?.finish(Error('Codex 桌面連線已中斷。'))};
 socket.on('error',stop);socket.on('close',stop);
 socket.on('data',chunk=>{
  buffer=Buffer.concat([buffer,chunk]);
  while(buffer.length>=4){
   const length=buffer.readUInt32LE();
   if(length>16*1024*1024)return stop();
   if(buffer.length<length+4)return;
   let x;try{x=JSON.parse(buffer.subarray(4,length+4))}catch{return stop()}
   buffer=buffer.subarray(length+4);
   if(x?.type==='response'&&x.requestId===pending?.id)pending.finish(null,x);
  }
 });
 function request(method,params,version,targetClientId){
  return new Promise((resolve,reject)=>{
   if(closed||pending)return reject(Error('Codex 桌面連線無法使用。'));
   const id=randomUUID(),data=Buffer.from(JSON.stringify({type:'request',requestId:id,sourceClientId:client||'uninitialized',version,method,params,targetClientId,timeoutMs:4000}));
   const head=Buffer.alloc(4);head.writeUInt32LE(data.length);
   const timer=setTimeout(()=>stop(),5000);
   pending={id,finish(err,value){clearTimeout(timer);pending=null;err?reject(err):resolve(value)}};
   socket.write(Buffer.concat([head,data]));
  });
 }
 return {request,close:stop,async initialize(){
  const response=await request('initialize',{clientType:'maxagent'},0);
  client=response.result?.clientId;
  if(response.resultType!=='success'||!uuid.test(client||''))throw Error('Codex 桌面未接受本機連線。');
 }};
}
async function sendSelected({id,prompt,options,clientId,beforeSend,sandboxPolicy},deps={}){
 const available=deps.available||(()=>supportsDesktop(process.platform,process.arch,os.release(),resolveCodexExe()));
 if(!uuid.test(id)||!uuid.test(clientId)||!options.model||!available())throw Error('這個 Codex 桌面版本尚未驗證支援佔用時換模型。');
 const c=(deps.connect||connect)();
 try{
  await c.initialize();
  const discovery=await c.request('thread-owner-discovery',{hostId:'local',conversationId:id},1);
  const owner=discovery.handledByClientId;
  if(discovery.resultType!=='success'||!uuid.test(owner||''))throw Error('Codex 桌面沒有載入這個原對話。');
  const read=await c.request('thread-follower-read-model-settings',{conversationId:id},1,owner);
  if(read.resultType!=='success'||read.handledByClientId!==owner||read.result?.settings?.resumeState!=='resumed'||read.result?.settings?.modelProvider!=='openai')throw Error('無法核對原對話的桌面連線或模型供應商。');
  // Persist the client ID before the single potentially delivering request.
  await beforeSend();
  try{
   const result=await c.request('thread-follower-start-turn',{conversationId:id,turnStart:{
    request:{threadId:id,input:[{type:'text',text:prompt,text_elements:[]}],clientUserMessageId:clientId,...options,sandboxPolicy,approvalPolicy:'never'},
    context:{inheritThreadSettings:false,useUserMessageAdmission:false}
   }},2,owner);
   const turn=result.result?.result?.turn?.id;
   if(result.resultType!=='success'||result.handledByClientId!==owner||!uuid.test(turn||''))throw Error('Codex 桌面未回報本輪識別碼。');
   return {turn};
  }catch{throw Object.assign(Error('可能已送出，尚未確認 Codex 原對話本輪結果；請勿重送。'),{sendPhase:'possibly_sent'})}
 }finally{c.close()}
}
module.exports={supportsDesktop,sendSelected};
