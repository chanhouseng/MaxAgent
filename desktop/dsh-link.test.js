'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createServer,createClient,foldResult}=require('./dsh-link');
const {changePatch}=require('./dsh-link-setup');
const id='session-11111111111111111111111111111111',requestId=crypto.randomUUID();
const event=(seq,type,data)=>({seq,type,data});
test('DSH requires an original input, formal response and normal completion for the same turn',()=>{
 const input=event(1,'user/message',{source:{kind:'user',rpcId:requestId}});
 const start=event(0,'turn/start',{turn:2}),answer=event(2,'assistant/message',{turn:2,message:{content:[{type:'text',text:'fixture'}]}});
 const end=event(3,'turn/end',{turn:2,reason:{kind:'completed'}});
 assert.deepEqual(foldResult([start,input,answer,end],requestId),{state:'completed',marker:'2',turn:'2'});
 assert.equal(foldResult([start,input,answer],requestId).state,'running');
 assert.equal(foldResult([start,input,answer,{...end,data:{...end.data,reason:{kind:'aborted'}}}],requestId).state,'failed');
 assert.equal(foldResult([start,input,answer,end],crypto.randomUUID()).state,'unknown');
 assert.equal(foldResult([start,input,event(2,'user/message',{source:{kind:'user',rpcId:crypto.randomUUID()}}),answer,end],requestId).state,'unknown');
});
test('DSH pairing edits only its own entry and can move with the MaxAgent folder',()=>{
 const original='- id: existing\r\n  config: {}\r\n',pairing=path.join(os.tmpdir(),'pairing.json'),host=path.join(os.tmpdir(),'desktop','dsh-host.mjs');
 const paired=changePatch(original,true,host,pairing);
 assert.ok(paired.startsWith(original));assert.equal(changePatch(paired,true,host,pairing),paired);
 const moved=changePatch(paired,true,path.join(os.tmpdir(),'moved','desktop','dsh-host.mjs'),pairing);
 assert.notEqual(moved,paired);
 assert.equal(changePatch(moved,false,host,pairing),original);
 assert.throws(()=>changePatch(paired.replace('owner','something').replace('id: maxagent-local-dispatch','id: other'),false,host,pairing),/修改/);
});
test('DSH bridge authenticates both sides and never dispatches the same request twice',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maxagent-dsh-test-')),config=path.join(dir,'paired.json');
 const link={key:crypto.randomBytes(32).toString('hex'),socket:crypto.randomBytes(16).toString('hex')};
 fs.writeFileSync(config,JSON.stringify(link));
 let sends=0,log=[];
 const server=createServer(config,{get:i=>i===id?{id,cwd:dir,seq:log.length,events:(from,to)=>log.slice(from,to)}:null,async send(i,text,ticket){assert.equal(i,id);assert.equal(text,'fixture');sends++;await new Promise(r=>setTimeout(r,25));log=[event(0,'agent/inbox/spliced',{inserted:[{source:{kind:'user',rpcId:ticket}}]})];return {accepted:true}}});
 await server.ready;
 try{
  const client=createClient(config),session={id,cwd:dir};
  const {seq,owner}=await client.probe(session);
  await assert.rejects(client.send({...session,cwd:dir+'-wrong'},requestId,seq,'fixture',owner),e=>e.sendPhase==='not_sent');
  assert.equal(sends,0);
  await Promise.all([client.send(session,requestId,seq,'fixture',owner),client.send(session,requestId,seq,'fixture',owner)]);
  assert.equal(sends,1);
  assert.equal((await client.result(session,requestId,seq)).state,'queued');
  fs.writeFileSync(config,JSON.stringify({...link,key:crypto.randomBytes(32).toString('hex')}));
  await assert.rejects(client.send(session,crypto.randomUUID(),0,'fixture',owner));
  assert.equal(sends,1);
 }finally{await server.close();fs.rmSync(dir,{recursive:true,force:true})}
});

test('DSH model catalog refresh and per-chat settings reach only selected original target',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-model-')),file=path.join(dir,'pair.json');
 fs.writeFileSync(file,JSON.stringify({key:crypto.randomBytes(32).toString('hex'),socket:crypto.randomBytes(16).toString('hex')}));
 let received;
 const server=createServer(file,{get:i=>({id:i,cwd:dir,seq:0,events:()=>[]}),models:async()=>({models:[{id:'route/model',label:'Route · Model',efforts:[]}],context:'live-1'}),send:async(...args)=>{received=args;return {accepted:true}}});
 await server.ready;
 try{
  const c=createClient(file),s={id,cwd:dir},catalog=await c.models(s);
  assert.equal(catalog.context,'live-1');
  const p=await c.probe(s);
  await c.send(s,crypto.randomUUID(),0,'fixture',p.owner,{model:'route/model',context:'live-1'});
  assert.equal(received[0],id);assert.deepEqual(received[3],{model:'route/model',context:'live-1'});
 }finally{await server.close();fs.rmSync(dir,{recursive:true,force:true})}
});

test('DSH session model switches without changing defaults; stale, busy and rejected models send nothing',async()=>{
 const {modelCatalog,sendSelected}=await import('./dsh-host.mjs');
 const selections=new Map(),a='session-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',b='session-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
 let prompts=0,available=true,blocked=false;
 const agents=new Map([a,b].map(id=>[id,{id,status:'idle',inbox:{nextTurn:[],nextStep:[]},model:{current:()=>selections.get(id),select:x=>selections.set(id,x)},runMaintenance:fn=>fn()}]));
 const ctx={agents,agentDefaultModel:{saveSelection(){assert.fail('global defaults must stay untouched')}},
  llm:{resolveCallConfig:async()=>{if(blocked)throw Error('invalid route')}},
  sessionController:{modelCatalog:async()=>({groups:[{id:'provider',name:'Provider',models:available?[{id:'model-a',name:'Model A',reasoning:{efforts:[{id:'medium'}]}},{id:'model-b',name:'Model B'}]:[]}]}),
   prompt:async q=>{prompts++;assert.ok(agents.has(q.sessionId));return {accepted:true}}}};
 const catalog=await modelCatalog(ctx,a),one={model:JSON.stringify(['provider','model-a']),effort:'medium',context:catalog.context},two={model:JSON.stringify(['provider','model-b']),context:catalog.context};
 await sendSelected(ctx,a,'fixture',crypto.randomUUID(),one);
 await sendSelected(ctx,b,'fixture',crypto.randomUUID(),two);
 assert.equal(selections.get(a).model,'model-a');assert.equal(selections.get(b).model,'model-b');assert.equal(prompts,2);
 for(const opt of [{...one,context:'stale'},{...one,effort:'invalid'}])await assert.rejects(sendSelected(ctx,a,'fixture',crypto.randomUUID(),opt),e=>e.sendPhase==='not_sent');
 agents.get(a).status='running';await assert.rejects(sendSelected(ctx,a,'fixture',crypto.randomUUID(),one));agents.get(a).status='idle';
 blocked=true;await assert.rejects(sendSelected(ctx,a,'fixture',crypto.randomUUID(),one));blocked=false;
 available=false;await assert.rejects(sendSelected(ctx,a,'fixture',crypto.randomUUID(),one));
 assert.equal(prompts,2);
});
