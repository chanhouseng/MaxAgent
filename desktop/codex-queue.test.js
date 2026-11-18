'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {findQueuedTurn}=require('./codex-queue');
const {createDispatchStore}=require('./dispatch-store');
const line=payload=>JSON.stringify({type:'event_msg',timestamp:'now',payload})+'\n';
test('desktop dispatch confirms the model and effort only from the matching completed turn',()=>{
 const input=line({type:'task_started',turn_id:'t'})+JSON.stringify({type:'turn_context',payload:{turn_id:'t',model:'luna',effort:'low'}})+'\n'+line({type:'item_completed',turn_id:'t',item:{type:'UserMessage',client_id:'mine'}})+line({type:'task_complete',turn_id:'t',last_agent_message:'reply'});
 assert.equal(findQueuedTurn(input,'mine',{model:'luna',effort:'low'}).state,'completed');
 assert.equal(findQueuedTurn(input,'mine',{model:'luna',effort:'high'}).state,'model_unconfirmed');
 assert.equal(findQueuedTurn(input,'other',{model:'luna'}),null);
});
test('only the matching client message and completed turn count as a result',()=>{
 const input=line({type:'task_started',turn_id:'t1'})+line({type:'item_completed',turn_id:'t1',item:{type:'UserMessage',client_id:'other'}})+line({type:'task_complete',turn_id:'t1',last_agent_message:'old'})+line({type:'task_started',turn_id:'t2'})+line({type:'item_completed',turn_id:'t2',item:{type:'UserMessage',client_id:'mine'}})+line({type:'task_complete',turn_id:'t2',last_agent_message:'new'});
 assert.deepEqual(findQueuedTurn(input,'mine'),{state:'completed',turn:'t2',marker:'now'});
 assert.equal(findQueuedTurn(input,'missing'),null);
});
test('an accepted message without normal completion is not success',()=>{
 const input=line({type:'task_started',turn_id:'t'})+line({type:'item_completed',turn_id:'t',item:{type:'UserMessage',client_id:'mine'}})+line({type:'turn_aborted',turn_id:'t'});
 assert.deepEqual(findQueuedTurn(input,'mine'),{state:'received',turn:'t'});
});
test('completion for a different turn or an incomplete log line is never success',()=>{
 const input=line({type:'task_started',turn_id:'t1'})+line({type:'item_completed',turn_id:'t1',item:{type:'UserMessage',client_id:'mine'}})+line({type:'task_started',turn_id:'t2'})+line({type:'task_complete',turn_id:'t2',last_agent_message:'different'});
 assert.deepEqual(findQueuedTurn(input,'mine'),{state:'received',turn:'t1'});
 assert.deepEqual(findQueuedTurn(input+JSON.stringify({type:'event_msg',payload:{type:'task_complete',turn_id:'t1',last_agent_message:'unfinished'}}),'mine'),{state:'received',turn:'t1'});
});
test('queued task survives restart and the same draft cannot be sent again',()=>{
 const state={};const store=createDispatchStore(state,()=>{});store.write('codex:a','test');const attempt=store.begin('codex:a',0,'test');store.mark('codex:a',attempt.id,{status:'queued',queue:{clientId:'one',id:'queue-one'}});
 const reopened=createDispatchStore(JSON.parse(JSON.stringify(state)),()=>{});assert.equal(reopened.unresolved('codex:a')[0].queue.id,'queue-one');assert.throws(()=>reopened.begin('codex:a',0,'test'),/勿重送/);
});
