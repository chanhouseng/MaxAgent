const test=require('node:test');
const assert=require('node:assert/strict');
const {projectPetState}=require('./pet-state');
test('pet shows running and confirmed completion, never failed or unconfirmed',()=>{
 const sessions=new Map([['codex:a',{tool:'codex',title:'甲'}],['claude:b',{tool:'claude',title:'乙'}],['codex:c',{tool:'codex',title:'丙'}],['claude:d',{tool:'claude',title:'丁'}]]);
 const jobs=new Map([['codex:a',{status:'running',time:1}],['claude:b',{status:'confirming',time:2}],['codex:c',{status:'failed',time:3}],['claude:d',{status:'result_unavailable',time:4}]]);
 let x=projectPetState(sessions,jobs);assert.equal(x.running.length,2);assert.equal(x.recent.length,0);
 jobs.get('codex:a').status='completed'; x=projectPetState(sessions,jobs,[{key:'codex:a',tool:'codex',title:'甲',status:'completed',time:5}]);assert.equal(x.recent.length,1);assert.equal(x.recent[0].key,'codex:a');assert.deepEqual(Object.keys(x.recent[0]).sort(),['key','status','time','title','tool']);
});
