'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {supportsDesktop,sendSelected}=require('./codex-desktop');
const [id,owner,clientId,turn]=[1,2,3,4].map(n=>'00000000-0000-0000-0000-00000000000'+n);
const exe='C:/Program Files/WindowsApps/OpenAI.Codex_26.1111.2228.0_x64__2p2nqsd0c76g0/app/resources/codex.exe';
test('only the tested Desktop build on Windows 11 x64 is eligible',()=>{
 assert.equal(supportsDesktop('win32','x64','10.0.26300',exe),true);
 assert.equal(supportsDesktop('win32','x64','10.0.19045',exe),false);
 assert.equal(supportsDesktop('win32','arm64','10.0.26300',exe),false);
 assert.equal(supportsDesktop('win32','x64','10.0.26300',exe.replace('2228','2229')),false);
});
function fixture({wrongOwner=false,drop=false,preflightError=false}={}){
 const events=[];
 const args={id,clientId,options:{model:'luna',effort:'low'},prompt:'fixture',sandboxPolicy:{type:'workspaceWrite',networkAccess:false},beforeSend(){events.push('persist');if(preflightError)throw Error('busy')}};
 const deps={available:()=>true,connect:()=>({initialize:async()=>{},close:()=>events.push('close'),async request(method,params,version,target){
  events.push(method);
  if(method==='thread-owner-discovery')return {resultType:'success',handledByClientId:owner};
  assert.equal(target,owner);
  if(method==='thread-follower-read-model-settings')return {resultType:'success',handledByClientId:wrongOwner?id:owner,result:{settings:{resumeState:'resumed',modelProvider:'openai'}}};
  assert.equal(version,2);
  assert.equal(params.conversationId,id);
  assert.deepEqual(params.turnStart.request,{threadId:id,clientUserMessageId:clientId,model:'luna',effort:'low',input:[{type:'text',text:'fixture',text_elements:[]}],sandboxPolicy:args.sandboxPolicy,approvalPolicy:'never'});
  if(drop)throw Error('lost response');
  return {resultType:'success',handledByClientId:owner,result:{result:{turn:{id:turn}}}};
 }})};
 return {events,run:()=>sendSelected(args,deps)};
}
test('one request carries task and model to the original owner after saving the client ID',async()=>{
 const f=fixture();assert.deepEqual(await f.run(),{turn});
 assert.deepEqual(f.events,['thread-owner-discovery','thread-follower-read-model-settings','persist','thread-follower-start-turn','close']);
});
test('owner mismatch, failed preflight and lost response never cause another send',async()=>{
 for(const options of [{wrongOwner:true},{preflightError:true},{drop:true}]){
  const f=fixture(options);await assert.rejects(f.run(),e=>options.drop?e.sendPhase==='possibly_sent':e.sendPhase===undefined);
  assert.equal(f.events.filter(e=>e==='thread-follower-start-turn').length,options.drop?1:0);
 }
});
