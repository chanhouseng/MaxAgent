const test=require('node:test');
const assert=require('node:assert/strict');
const {createRefreshGate}=require('./refresh-gate');
test('同一批刷新只掃描一次，強制刷新不遺失',async()=>{
 let scans=0,now=100;const gate=createRefreshGate(()=>{scans++;return scans},()=>now,14000);
 const values=await Promise.all([gate(false),gate(true),gate(false)]);
 assert.deepEqual(values,[1,1,1]);assert.equal(scans,1);
 await gate(false);assert.equal(scans,1);
 await gate(true);assert.equal(scans,2);
 now+=14001;await gate(false);assert.equal(scans,3);
});
test('掃描失敗後可以再刷新',async()=>{
 let calls=0;const gate=createRefreshGate(()=>{if(++calls===1)throw Error('scan failed');return calls},()=>100,14000);
 await assert.rejects(gate(true),/scan failed/);assert.equal(await gate(true),2);
});
