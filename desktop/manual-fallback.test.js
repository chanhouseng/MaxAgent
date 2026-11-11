const {test}=require('node:test'),assert=require('node:assert/strict');const {writerConflict}=require('./codex-error');
test('只有恢復時 active writer 才能提供手動備案',()=>{const err={code:-32600,message:'thread x already has an active writer'};assert.equal(writerConflict(2,err),true);assert.equal(writerConflict(3,err),false);assert.equal(writerConflict(2,{code:-32600,message:'unknown'}),false)});
