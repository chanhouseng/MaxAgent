const test=require('node:test'), a=require('node:assert/strict');
const {codexFinish,claudeFinish}=require('./harness');
test('Codex ignores a completion for another turn; interruption cannot succeed',()=>{
 const event={threadId:'same',turn:{id:'else',status:'completed'}};
 a.equal(codexFinish(event,'same','ours'),null);
 a.equal(codexFinish({threadId:'same',turn:{id:'ours',status:'interrupted'}},'same','ours'),false);
 a.equal(codexFinish({threadId:'same',turn:{id:'ours',status:'completed'}},'same','ours'),true);
});
test('Claude cannot report success for a different conversation or an error',()=>{
 const r={type:'result',session_id:'ours',subtype:'success',is_error:false};
 a.equal(claudeFinish(r,'other',0),false);
 a.equal(claudeFinish({...r,is_error:true},'ours',0),false);
 a.equal(claudeFinish(r,'ours',0),true);
});
test('派工參數使用原工作目錄並開放編輯工具',()=>{const {codexWorkspacePolicy,claudeArgs}=require('./harness');const policy=codexWorkspacePolicy('C:\\work');a.equal(policy.type,'workspaceWrite');a.deepEqual(policy.writableRoots,['C:\\work']);const args=claudeArgs('old-id','hi');a.equal(args[args.indexOf('--resume')+1],'old-id');a.notEqual(args[args.indexOf('--tools')+1],'');a.equal(args[args.indexOf('--permission-mode')+1],'acceptEdits')});
