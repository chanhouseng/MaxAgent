const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
test('索引指定的檔案與檔內身分一致才可用，同 ID 不合併',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maxagent-index-')),old=process.env.CODEX_HOME,claude=process.env.CLAUDE_CONFIG_DIR;process.env.CODEX_HOME=dir;process.env.CLAUDE_CONFIG_DIR=path.join(dir,'none');
 const a='11111111-1111-1111-1111-111111111111',b='22222222-2222-2222-2222-222222222222',c='33333333-3333-3333-3333-333333333333',folder=path.join(dir,'sessions');fs.mkdirSync(folder);
 const write=(f,id)=>fs.writeFileSync(f,[{type:'session_meta',payload:{id,cwd:dir}},{type:'event_msg',payload:{type:'user_message',message:'fixture'}}].map(JSON.stringify).join('\n')+'\n');
 const chosen=path.join(folder,'rollout-'+b+'.jsonl'),duplicate=path.join(folder,'rollout-'+a+'.jsonl'),bad=path.join(folder,'rollout-'+c+'.jsonl');write(chosen,a);write(duplicate,a);write(bad,b);
 const db=new DatabaseSync(path.join(dir,'state_5.sqlite'));db.exec('create table threads(id text primary key,rollout_path text)');const ins=db.prepare('insert into threads values (?,?)');ins.run(a,process.platform==='win32'?'\\\\?\\'+chosen:chosen);ins.run(c,bad);db.close();
 try{const found=require('./harness').list().filter(x=>x.tool==='codex');assert.equal(found.filter(x=>x.id===a).length,1);assert.equal(found.find(x=>x.id===a).file,chosen);assert.equal(found.some(x=>x.id===c),false);assert.equal(found.some(x=>x.id===b),false)}finally{process.env.CODEX_HOME=old;process.env.CLAUDE_CONFIG_DIR=claude;fs.rmSync(dir,{recursive:true,force:true})}
});
