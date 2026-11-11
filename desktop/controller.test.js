const {test}=require('node:test');const assert=require('node:assert/strict');
const {createController}=require('./controller');
test('選定原聊天室派工並在使用者查看後才標記已讀',async()=>{
 const calls=[];let last='old';const api={list:async()=>[],history:async k=>({messages:[],last,busy:false}),read:async(...x)=>calls.push(['read',...x]),send:async(...x)=>calls.push(['send',...x])};
 const c=createController(api);await c.open('claude:original');calls.length=0;await c.send('test');last='new';await c.refresh();assert.deepEqual(calls,[['send','claude:original','test']]);await c.open('claude:original');assert.deepEqual(calls[1],['read','claude:original','new']);
});
test('切換聊天室時舊歷史不能覆蓋新的選擇',async()=>{
 let resolve;const api={history:k=>k==='old'?new Promise(r=>resolve=r):Promise.resolve({messages:[],last:'b'}),read:async()=>{}};const c=createController(api);const pending=c.open('old');await c.open('new');resolve({messages:[],last:'a'});await pending;assert.equal(c.current,'new');assert.equal(c.history.last,'b');
});
for(const tool of ['codex','claude'])test(`${tool} 派工失敗時不自動重送或另開聊天室`,async()=>{
 const calls=[];const api={history:async()=>({messages:[],last:'old'}),read:async()=>{},send:async(k,p)=>{calls.push([k,p]);throw Error('模擬中斷')}};
 const c=createController(api);await c.open(tool+':existing');await assert.rejects(c.send('只讀測試'),/模擬中斷/);assert.deepEqual(calls,[[tool+':existing','只讀測試']]);
});
