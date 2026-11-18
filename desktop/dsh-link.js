'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const configFile=()=>path.join(process.env.LOCALAPPDATA||os.homedir(),'MaxAgent','dsh-link.json');
const idPattern=/^session-[0-9a-f-]{16,64}$/i,requestPattern=/^[0-9a-f-]{36}$/i;
const MAX_FRAME=192*1024, MAX_EVENTS=4096;
function readConfig(file){const c=JSON.parse(fs.readFileSync(file,'utf8'));if(!/^[0-9a-f]{64}$/.test(c.key)||! /^[0-9a-f]{32}$/.test(c.socket))throw Error('DSH 本機連線設定無效。');return c}
const address=c=>process.platform==='win32'?'\\\\.\\pipe\\LOCAL\\maxagent-dsh-'+c.socket:path.join(os.tmpdir(),'maxagent-dsh-'+c.socket+'.sock');
function seal(key,value,role){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
 cipher.setAAD(Buffer.from('maxagent-dsh-v1/'+role));
 return Buffer.concat([iv,cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]).toString('base64')+'\n';
}
function unseal(key,line,role){
 const p=Buffer.from(line,'base64');if(p.length<29)throw Error('invalid frame');
 const d=crypto.createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),p.subarray(0,12));d.setAAD(Buffer.from('maxagent-dsh-v1/'+role));d.setAuthTag(p.subarray(-16));
 return JSON.parse(Buffer.concat([d.update(p.subarray(12,-16)),d.final()]).toString('utf8'));
}
function readFrame(socket,handle){
 let data='';
 socket.setEncoding('ascii');socket.on('data',function onData(chunk){
  data+=chunk;if(data.length>MAX_FRAME){socket.destroy();return}
  const end=data.indexOf('\n');if(end<0)return;
  socket.removeListener('data',onData);handle(data.slice(0,end));
 });
}
const sourceMatches=(m,id)=>m?.source?.kind==='user'&&m.source.rpcId===id;
function foldResult(events,id){
 let active=null,matched=null,answer=null,queued=false,other=false;
 for(const e of events){
  const d=e.data||{};
  if(e.type==='agent/inbox/spliced'&&d.inserted?.some(m=>sourceMatches(m,id)))queued=true;
  if(e.type==='turn/start'){active=d.turn;matched=null;answer=null;other=false}
  if(e.type==='user/message'&&active!==null&&d.source?.kind==='user'){
   if(sourceMatches(d,id))matched=active;else other=true;
  }
  if(e.type==='assistant/message'&&matched!==null&&d.turn===matched&&!d.interrupted&&
      d.message?.content?.some(x=>x.type==='text'&&x.text?.trim())&&!d.message.content.some(x=>x.type==='tool-call'))answer=e.seq;
  if(e.type==='turn/end'&&d.turn===active){
   if(matched!==null&&d.turn===matched){
    if(other)return {state:'unknown'};
    if(d.reason?.kind!=='completed')return {state:'failed',turn:String(d.turn)};
    return answer===null?{state:'unknown'}:{state:'completed',marker:String(answer),turn:String(d.turn)};
   }
   active=null;
  }
 }
 return matched!==null?{state:'running',turn:String(matched)}:{state:queued?'queued':'unknown'};
}
function samePath(a,b){return typeof a==='string'&&typeof b==='string'&&path.isAbsolute(a)&&path.isAbsolute(b)&&(process.platform==='win32'?path.normalize(a).toLowerCase()===path.normalize(b).toLowerCase():path.normalize(a)===path.normalize(b))}
function createServer(file,host){
 const pairing=readConfig(file),owner=crypto.randomUUID(),active=new Map(),sockets=new Set();
 const server=net.createServer(socket=>{
  if(sockets.size>=32){socket.destroy();return}
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.setTimeout(8000,()=>socket.destroy());
  readFrame(socket,async line=>{
   let q;try{const c=readConfig(file);if(c.key!==pairing.key||c.socket!==pairing.socket)return socket.destroy();q=unseal(pairing.key,line,'request')}catch{return socket.destroy()}
   const reply=value=>{if(!socket.destroyed)socket.end(seal(pairing.key,{nonce:q?.nonce,...value},'reply'))};
   try{
    if(q?.op==='ping')return reply({ok:true,owner});
    if(!idPattern.test(q?.id||''))return reply({ok:false,reason:'target'});
    const session=host.get(q.id);
    if(!session||session.id!==q.id||!samePath(session.cwd,q.cwd))return reply({ok:false,reason:'target'});
    if(q.op==='models')return reply({ok:true,id:q.id,...await host.models(q.id)});
    if(q.op==='probe')return reply({ok:true,id:q.id,seq:session.seq,owner});
    if(q.op==='history'){
     const end=q.cursor===null?session.seq:q.cursor;
     if(!Number.isSafeInteger(end)||end<0||end>session.seq)return reply({ok:false,reason:'request'});
     const start=Math.max(0,end-MAX_EVENTS),events=session.events(start,end),messages=[];
     let cursor=start||null;
     for(let i=events.length-1;i>=0;i--){
      const e=events[i],role=e.type==='user/message'&&e.data?.source?.kind==='user'?'user':e.type==='assistant/message'&&!e.data?.interrupted?'assistant':null;
      if(!role)continue;
      const content=role==='user'?e.data.content:e.data.message?.content;
      const text=Array.isArray(content)?content.filter(x=>x?.type==='text'&&typeof x.text==='string').map(x=>x.text).join('\n').trim().slice(0,16000):'';
      if(!text)continue;
      messages.unshift({role,kind:role,text});
      if(messages.length===2){cursor=e.seq||null;break}
     }
     return reply({ok:true,id:q.id,messages,cursor,live:true});
    }
    if(!requestPattern.test(q.requestId||'')||!Number.isSafeInteger(q.seq)||q.seq<0||q.seq>session.seq)return reply({ok:false,reason:'request'});
    const read=()=>session.seq-q.seq>MAX_EVENTS?{state:'unknown'}:foldResult(session.events(q.seq,session.seq),q.requestId);
    if(q.op==='result')return reply({ok:true,id:q.id,...read()});
    if(q.op!=='send'||q.owner!==owner||typeof q.text!=='string'||!q.text.trim()||q.text.length>12000)return reply({ok:false,reason:'request'});
    const pendingKey=q.id+':'+q.requestId;
    if(read().state!=='unknown')return reply({ok:true,id:q.id,accepted:true});
    let submission=active.get(pendingKey);
    if(!submission){
     submission=Promise.resolve().then(()=>host.send(q.id,q.text,q.requestId,q.options));
     active.set(pendingKey,submission);
    }
    try{const r=await submission;return reply({ok:r?.accepted===true,id:q.id,accepted:r?.accepted===true,reason:'uncertain'})}
    finally{if(active.get(pendingKey)===submission)active.delete(pendingKey)}
   }catch(e){return reply({ok:false,reason:e?.sendPhase==='not_sent'?(['model_busy','model_stale'].includes(e.reason)?e.reason:'model'):q?.op==='send'?'uncertain':'unavailable'})}
  });
 });
 const ready=new Promise((resolve,reject)=>{server.on('error',reject);server.listen(address(pairing),resolve)});
 return {ready,close:()=>new Promise(resolve=>{for(const s of sockets)s.destroy();server.close(()=>resolve())})};
}
function createClient(file=configFile()){
 function call(body){
  return new Promise((resolve,reject)=>{
   let socket,submitted=false,done=false,nonce;
   const finish=(error,result)=>{if(done)return;done=true;socket?.destroy();if(error){error.sendPhase=submitted?'possibly_sent':'not_sent';reject(error)}else resolve(result)};
   try{
    const c=readConfig(file);nonce=crypto.randomUUID();
    const message=seal(c.key,{...body,nonce},'request');
    socket=net.connect(address(c));
    socket.setTimeout(4000,()=>finish(Error('無法確認 DSH 本機連線的回覆。')));
    socket.on('error',()=>finish(Error('無法連到 DSH 桌面。請確認已配對並重開 DSH。')));
    socket.on('close',()=>finish(Error('DSH 本機連線中斷。')));
    readFrame(socket,line=>{
     try{const r=unseal(c.key,line,'reply');if(r.nonce!==nonce)throw Error('nonce');finish(null,r)}catch{finish(Error('無法驗證 DSH 本機連線。'))}
    });
    socket.once('connect',()=>{submitted=body.op==='send';try{socket.write(message)}catch{finish(Error('DSH 本機連線中斷。'))}});
   }catch{finish(Error('無法讀取 DSH 配對設定。'))}
  });
 }
 async function request(op,s,extra={}){
  const r=await call({op,id:s?.id,cwd:s?.cwd,...extra});
  if(r.ok&&(op==='ping'||r.id===s.id))return r;
  const message={model_busy:'DSH 原對話正在工作或已有排隊任務，目前不能換模型；任務未送出，草稿已保留。',model_stale:'DSH 供應商、模型或推理選項已變更；請重新取得並選擇，任務未送出。',model:'DSH 未能確認所選模型或連線可用，任務未送出。',target:'DSH 尚未載入這個原對話，或工作目錄與 MaxAgent 不符。請先在 DSH 打開同一個舊對話。',request:'DSH 本機連線已變更或拒絕此請求。',unavailable:'無法取得 DSH 原對話狀態。',uncertain:'無法確認 DSH 是否接收本輪任務，請勿重送。'}[r.reason]||'無法核對 DSH 原對話。';
  throw Object.assign(Error(message),{sendPhase:op==='send'&&!['target','request','model','model_busy','model_stale'].includes(r.reason)?'possibly_sent':'not_sent'});
 }
 return {configured:()=>{try{readConfig(file);return true}catch{return false}},ping:()=>request('ping'),probe:s=>request('probe',s),models:s=>request('models',s),
  send:(s,requestId,seq,text,owner,options)=>request('send',s,{requestId,seq,text,owner,options}),
  result:(s,requestId,seq)=>request('result',s,{requestId,seq}),history:(s,cursor)=>request('history',s,{cursor})};
}
module.exports={configFile,createClient,createServer,foldResult};
