const {test}=require('node:test'),assert=require('node:assert/strict');const {createNotifier}=require('./notifications');
test('只通知已確認的新輪次，關閉與失敗均不補發',()=>{const calls=[];const n=createNotifier((...a)=>calls.push(a));n(false,'codex:a','t1','codex');n(true,'codex:a','t1','codex');n(true,'codex:a','t2','codex');n(true,'codex:a','t2','codex');assert.deepEqual(calls,[['codex']]);});
test('通知故障不向派工傳出例外',()=>{const n=createNotifier(()=>{throw Error('失敗')});assert.doesNotThrow(()=>n(true,'claude:a','t','claude'))});
