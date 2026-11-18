const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {history}=require('./harness');
function read(tool,events){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maxagent-model-'));try{const file=path.join(dir,'history.jsonl');fs.writeFileSync(file,events.map(x=>JSON.stringify(x)).join('\n'));return history({tool,id:'session',file}).modelEvidence}finally{fs.rmSync(dir,{recursive:true,force:true})}}
const meta={type:'session_meta',payload:{id:'session'}};
const start=id=>({type:'event_msg',payload:{type:'task_started',turn_id:id}});
const context=(id,model)=>({type:'turn_context',payload:{turn_id:id,model}});
const final=id=>({type:'response_item',payload:{type:'message',id,role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'answer'}]}});
const end=id=>({type:'event_msg',payload:{type:'task_complete',turn_id:id}});
const claude=(id,model,extra={})=>({type:'assistant',sessionId:'session',uuid:id,message:{model,stop_reason:'end_turn',content:[{type:'text',text:'answer'}]},...extra});
test('Codex 只把同輪完成的上下文顯示為設定，最新回覆不借用舊模型',()=>{
 let e=read('codex',[meta,start('a'),context('a','gpt-example'),final('one'),end('a')]);assert.equal(e.status,'configured');assert.equal(e.model,'gpt-example');assert.equal(e.turnId,'a');
 e=read('codex',[meta,start('a'),context('a','gpt-example'),final('one'),end('a'),start('b'),context('a','wrong'),final('two'),end('b')]);assert.equal(e.status,'unknown');assert.equal(e.replyId,'two');
 e=read('codex',[meta,start('a'),context('a','gpt-example'),final('one'),end('other')]);assert.equal(e.status,'unknown');
});
test('Claude 只讀主線正式回覆，缺值和代理別名保持未確認',()=>{
 let e=read('claude',[claude('one','claude-sonnet-4-5-20250929')]);assert.equal(e.status,'reported');assert.equal(e.model,'claude-sonnet-4-5-20250929');
 e=read('claude',[claude('one','claude-sonnet-4-5-20250929'),claude('two',undefined)]);assert.equal(e.status,'unknown');assert.equal(e.replyId,'two');
 e=read('claude',[claude('one','ccs-sonnet')]);assert.equal(e.status,'alias');assert.equal(e.model,'ccs-sonnet');
 e=read('claude',[claude('one','claude-sonnet-4-5-20250929'),claude('bad','other',{isApiErrorMessage:true}),claude('sub','other',{isSidechain:true}),{type:'assistant',sessionId:'session',message:{model:'other',stop_reason:'tool_use',content:[{type:'text',text:'intermediate'}]}}]);assert.equal(e.replyId,'one');
});
