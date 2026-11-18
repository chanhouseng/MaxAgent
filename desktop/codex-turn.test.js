const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {history}=require('./harness');
test('Codex 摘要只配對原聊天室同一輪的開始及結束',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maxagent-turn-')),file=path.join(dir,'sample.jsonl'),id='11111111-1111-1111-1111-111111111111';
 const event=(type,turn_id)=>JSON.stringify({type:'event_msg',payload:{type,turn_id}})+'\n';
 try{fs.writeFileSync(file,JSON.stringify({type:'session_meta',payload:{id,cwd:dir}})+'\n'+event('task_started','one'));
 assert.deepEqual(history({tool:'codex',id,file}).codexTurn,{id:'one',status:'running'});
 fs.appendFileSync(file,event('task_complete','other'));assert.equal(history({tool:'codex',id,file}).codexTurn,null);
 fs.appendFileSync(file,event('task_started','two')+event('turn_aborted','two'));assert.deepEqual(history({tool:'codex',id,file}).codexTurn,{id:'two',status:'aborted'});
 fs.appendFileSync(file,event('task_started','three')+event('task_complete','three'));assert.deepEqual(history({tool:'codex',id,file}).codexTurn,{id:'three',status:'completed'});
 assert.equal(history({tool:'codex',id:'different',file}).codexTurn,null);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
