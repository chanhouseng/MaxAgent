const {test}=require('node:test'),assert=require('node:assert/strict');
const {resolveCodexExe}=require('./codex-cli');
test('resolve Codex from configured path, PATH, then registered Windows app',()=>{
 const exists=x=>['C:\\valid\\codex.exe','C:\\Apps\\Codex\\app\\resources\\codex.exe'].includes(x);
 assert.equal(resolveCodexExe({configured:'C:\\valid\\codex.exe',findPath:()=>null,findInstalled:()=>null,exists}),'C:\\valid\\codex.exe');
 assert.equal(resolveCodexExe({configured:'',findPath:()=>null,findInstalled:()=>['C:\\Apps\\Codex'],exists}),'C:\\Apps\\Codex\\app\\resources\\codex.exe');
 assert.throws(()=>resolveCodexExe({configured:'C:\\missing\\codex.exe',findPath:()=>null,findInstalled:()=>[],exists}),/找不到/);
});
