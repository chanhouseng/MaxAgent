const test=require('node:test');
const assert=require('node:assert/strict');
const {projectPetState}=require('./pet-state');
test('同一聊天室多輪完成只留最新一筆，不合併不同工具或聊天室',()=>{
 const {recordPetCompletion}=require('./pet-state'),recent=[];const item=(key,time,source)=>({key,tool:key.split(':')[0],title:'同名',status:'completed',time,source});
 recordPetCompletion(recent,item('codex:a',1,'codex-record'));recordPetCompletion(recent,item('claude:a',2,'claude-hook'));recordPetCompletion(recent,item('codex:b',3,'codex-record'));recordPetCompletion(recent,item('codex:a',4,'maxagent'));
 assert.deepEqual(recent.map(x=>x.key),['codex:a','codex:b','claude:a']);assert.equal(recent[0].time,4);assert.equal(recent[0].source,'maxagent');
});
test('pet shows running and confirmed completion, never failed or unconfirmed',()=>{
 const sessions=new Map([['codex:a',{tool:'codex',title:'甲'}],['claude:b',{tool:'claude',title:'乙'}],['codex:c',{tool:'codex',title:'丙'}],['claude:d',{tool:'claude',title:'丁'}]]);
 const jobs=new Map([['codex:a',{status:'running',time:1}],['claude:b',{status:'confirming',time:2}],['codex:c',{status:'failed',time:3}],['claude:d',{status:'result_unavailable',time:4}]]);
 let x=projectPetState(sessions,jobs);assert.equal(x.running.length,2);assert.equal(x.recent.length,0);
 jobs.get('codex:a').status='completed'; x=projectPetState(sessions,jobs,[{key:'codex:a',tool:'codex',title:'甲',status:'completed',time:5}]);assert.equal(x.recent.length,1);assert.equal(x.recent[0].key,'codex:a');assert.deepEqual(Object.keys(x.recent[0]).sort(),['key','status','time','title','tool']);
});
test('新一輪開始後清除同一聊天室的舊完成，不影響同名其他聊天室',()=>{const {clearPetCompletionsForRunning}=require('./pet-state');const sessions=new Map([['codex:a',{tool:'codex',title:'同名'}],['codex:b',{tool:'codex',title:'同名'}]]),jobs=new Map([['codex:a',{status:'running'}]]),recent=[{key:'codex:a',time:1},{key:'codex:b',time:2}],external=[{key:'codex:a',tool:'codex',title:'同名',status:'running'}];let state=projectPetState(sessions,jobs,recent,external);assert.deepEqual(state.running.map(x=>x.key),['codex:a']);assert.deepEqual(state.recent.map(x=>x.key),['codex:b']);clearPetCompletionsForRunning(recent,state.running);jobs.clear();state=projectPetState(sessions,jobs,recent);assert.deepEqual(state.recent.map(x=>x.key),['codex:b']);});
