const test=require('node:test'),a=require('node:assert/strict'),Module=require('node:module'),{EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
function fakeHarness(mode){const child=new EventEmitter();child.stdout=new PassThrough();child.kill=()=>{};child.stdin=new Writable({write(chunk,_enc,done){const x=JSON.parse(chunk.toString());if(x.method==='initialize')setImmediate(()=>child.stdout.write(JSON.stringify({id:1,result:{}})+'\n'));if(x.method==='thread/resume')setImmediate(()=>child.stdout.write(JSON.stringify(mode==='reject'?{id:2,error:{code:-32600,message:'active writer'}}:{id:2,result:{thread:{id:'same'}}})+'\n'));if(x.method==='turn/start')setImmediate(()=>{if(mode==='no-receipt')return;if(mode==='invalid-params'){child.stdout.write(JSON.stringify({id:3,error:{code:-32602,message:'invalid params'}})+'\n');return}if(mode==='accepted')child.stdout.write(JSON.stringify({id:3,result:{turn:{id:'turn-1'}}})+'\n');setImmediate(()=>child.emit('exit',1))});done()}});const old=Module._load;Module._load=function(req,parent){if(parent?.filename.endsWith('harness.js')&&req==='node:child_process')return {spawn:()=>child};if(parent?.filename.endsWith('harness.js')&&req==='./codex-cli')return {resolveCodexExe:()=> 'fixture'};return old.apply(this,arguments)};try{delete require.cache[require.resolve('./harness')];return {h:require('./harness'),child}}finally{Module._load=old}}
test('Codex 恢復拒絕在發送前，發送後斷線必須待確認',async()=>{const pre=fakeHarness('reject');await a.rejects(pre.h.codex({id:'same',cwd:'.'},'fixture'),e=>e.sendPhase==='not_sent');const post=fakeHarness('disconnect');await a.rejects(post.h.codex({id:'same',cwd:'.'},'fixture'),e=>e.sendPhase==='possibly_sent')});
test('Claude 啟動後斷線不能視為未送出',async()=>{const x=fakeHarness('claude');const promise=x.h.claude({id:'same',cwd:'.'},'fixture','fixture');x.child.emit('spawn');x.child.emit('close',1);await a.rejects(promise,e=>e.sendPhase==='possibly_sent')});

test('Codex 只有獲本輪回執才標記已接收，斷線保留該回執',async()=>{const x=fakeHarness('accepted'),phases=[];await a.rejects(x.h.codex({id:'same',cwd:'.'},'fixture',{},p=>phases.push(p)),e=>e.sendPhase==='possibly_sent'&&e.turn==='turn-1');a.deepEqual(phases,[{phase:'possibly_sent'},{phase:'accepted',turn:'turn-1'}])});

test('Codex 沒有接收回執會提早結束等待，但不能視為未送出',async()=>{
 const {h}=fakeHarness('no-receipt'),phases=[];
 await a.rejects(h.codex({id:'same',cwd:'.'},'fixture',{},p=>phases.push(p),40),e=>e.sendPhase==='possibly_sent'&&/未回傳本輪接收確認/.test(e.message));
 a.deepEqual(phases,[{phase:'possibly_sent'}]);
});
test('Codex 拒絕無效派工參數時可確認未送出',async()=>{
 const {h}=fakeHarness('invalid-params');
 await a.rejects(h.codex({id:'same',cwd:'.'},'fixture'),e=>e.sendPhase==='not_sent'&&/invalid params/.test(e.message));
});
