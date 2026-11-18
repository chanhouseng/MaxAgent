const test=require('node:test'),assert=require('node:assert/strict');const {categories}=require('./workspace');
test('待處理依未讀、可信執行狀態和待確認分開，舊開始不能當執行中',()=>{
 assert.deepEqual(categories({unread:true,busy:true}),['unread']);
 assert.deepEqual(categories({observedRunning:true,job:{status:'result_unavailable',pendingCount:1}}),['running','pending']);
 assert.deepEqual(categories({job:{status:'running',pendingCount:0}}),['running']);
 assert.deepEqual(categories({job:{status:'completed',pendingCount:1}}),['pending']);
 assert.deepEqual(categories({job:{status:'failed'}}),[]);
});
test('任務狀態只在有本輪回執時顯示已接收',()=>{const {dispatchLabel}=require('./workspace');assert.equal(dispatchLabel({status:'running',phase:'prepared'}),'準備派工');assert.equal(dispatchLabel({status:'running',phase:'possibly_sent'}),'正在送出，尚未確認接收');assert.equal(dispatchLabel({status:'running',phase:'accepted',turn:'t'}),'原對話已接收，處理中');assert.equal(dispatchLabel({status:'result_unavailable',phase:'accepted',turn:'t'}),'原對話已接收，結果未確認');assert.equal(dispatchLabel({status:'result_unavailable'}),'可能已送出，結果未確認');assert.equal(dispatchLabel({status:'queued'}),'排隊中');});
test('未確認接收的程序不列入處理中',()=>{const {categories}=require('./workspace');assert.equal(categories({job:{status:'running',phase:'prepared'}}).includes('running'),false);assert.equal(categories({job:{status:'running',phase:'possibly_sent'}}).includes('running'),false);assert.equal(categories({job:{status:'running',phase:'accepted'}}).includes('running'),true)});
