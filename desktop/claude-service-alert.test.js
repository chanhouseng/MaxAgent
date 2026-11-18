const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {watchClaudeService}=require('./harness');

test('Claude alert follows this prompt only and hides provider payload',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maxagent-claude-alert-')),file=path.join(dir,'chat.jsonl'),id='fixture';
 t.after(()=>{fs.unlinkSync(file);fs.rmdirSync(dir)});
 const row=value=>JSON.stringify({sessionId:id,...value})+'\n';
 const user=content=>row({type:'user',message:{content}});
 const error=row({type:'system',subtype:'api_error',error:{status:429,message:'AccountQuotaExceeded weekly usage quota reset at 2026-11-16 00:00:00 +0800 payload-not-for-ui'}});
 fs.writeFileSync(file,user('previous')+error);
 const alerts=[],stop=watchClaudeService({id,file},'new prompt',fs.statSync(file).size,x=>alerts.push(x));
 fs.appendFileSync(file,error+user('new prompt')+error+error+user('different prompt')+row({type:'system',subtype:'api_error',error:{status:403}}));stop();
 assert.deepEqual(alerts,['Claude Code 目前連線的每週用量已用完。服務回報於 2026-11-16 00:00:00（UTC+8）重設。']);
});
test('Claude server errors after this prompt are shown without exposing provider details',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maxagent-claude-server-')),file=path.join(dir,'chat.jsonl'),id='fixture';t.after(()=>{fs.unlinkSync(file);fs.rmdirSync(dir)});fs.writeFileSync(file,'');const row=value=>JSON.stringify({sessionId:id,...value})+'\n',alerts=[],stop=watchClaudeService({id,file},'new prompt',0,x=>alerts.push(x));
 fs.appendFileSync(file,row({type:'user',message:{content:'new prompt'}})+row({type:'assistant',isApiErrorMessage:true,error:'server_error',message:{content:[{type:'text',text:'private provider detail'}]}})+row({type:'system',subtype:'api_error',error:{status:502,message:'private detail'}}));stop();
 assert.deepEqual(alerts,['Claude Code 連線的服務回報伺服器錯誤，尚未取得本輪回覆。']);
});
