'use strict';
const {randomUUID,createHash}=require('node:crypto');
const hash=text=>createHash('sha256').update(text).digest('hex');
// Older versions persisted this exact message only after a successful queue deletion.
function queueRemoved(attempt){return !!attempt?.queue?.cancelRequested&&(attempt.queue.cancelDeleted===true||(attempt.queue.cancelDeleted===undefined&&attempt.error==='已要求取消排隊；仍需確認任務是否已被原對話取走，請勿重送。'))}
function hasUnresolvedPeer(attempts){return attempts.some(a=>!!a.peer?.ticket&&!a.acknowledged)}
function canAcknowledge(attempt){return attempt?.status==='result_unavailable'&&!attempt.acknowledged&&(!attempt.queue?.clientId||queueRemoved(attempt))}
function createDispatchStore(state,save){
 function mutate(fn){const before=JSON.stringify({drafts:state.drafts,attempts:state.attempts});try{const value=fn();save();return value}catch(e){const prev=JSON.parse(before);state.drafts=prev.drafts;state.attempts=prev.attempts;throw e}}
 function draft(k){return state.drafts?.[k]||{text:'',version:0}}
 function latest(k){return state.attempts?.[k]?.at(-1)||null}
 function unresolved(k){return (state.attempts?.[k]||[]).filter(x=>['running','queued','confirming','result_unavailable'].includes(x.status))}
 function resendCandidate(k){const value=draft(k).text.trim();return value?unresolved(k).filter(a=>queueRemoved(a)&&!a.resendApproved&&!a.resendBlocked&&a.hash===hash(value)).at(-1)||null:null}
 function write(k,text){if(typeof text!=='string'||text.length>12000)throw Error('草稿超過長度限制。');const old=draft(k);if(old.text===text)return old;return mutate(()=>{state.drafts??={};return state.drafts[k]={text,version:old.version+1}})}
 function begin(k,offset,text){const d=draft(k);if(d.text.trim()!==text||!text)throw Error('草稿尚未保存，請再試一次。');if((state.attempts?.[k]||[]).some(x=>x.hash===hash(text)&&(x.resendBlocked||(['running','queued','confirming','result_unavailable'].includes(x.status)&&!x.resendApproved))))throw Error('這筆任務可能已送出，結果未確認。請勿重送。');return mutate(()=>{state.attempts??={};state.attempts[k]??=[];const a={id:randomUUID(),status:'result_unavailable',time:Date.now(),offset,version:d.version,hash:hash(text),phase:'prepared'};state.attempts[k].push(a);return a})}
 function mark(k,id,changes){return mutate(()=>{const a=(state.attempts?.[k]||[]).find(x=>x.id===id);if(!a)throw Error('找不到派工紀錄。');Object.assign(a,changes);return a})}
 function acknowledge(k,id){const a=unresolved(k).find(x=>x.id===id);if(!canAcknowledge(a))throw Error('目前無法隱藏此任務提示。');return mark(k,id,{acknowledged:true})}
 function approveResend(k,id){const a=unresolved(k).find(x=>x.id===id);if(!a||!queueRemoved(a)||a.resendBlocked||a.resendApproved||a.hash!==hash(draft(k).text.trim()))throw Error('無法解除限制：請確認原任務仍在草稿中，且已從排隊清單移除。');return mark(k,id,{resendApproved:true})}
 function complete(k,id,evidence){return mutate(()=>{const a=(state.attempts?.[k]||[]).find(x=>x.id===id);if(!a)throw Error('找不到派工紀錄。');Object.assign(a,{status:'completed',marker:evidence.marker,turn:evidence.turn,time:Date.now()});const d=draft(k);if(!a.resendApproved&&d.version===a.version&&hash(d.text.trim())===a.hash){state.drafts[k]={text:'',version:d.version+1}}return a})}
 return {draft,write,begin,mark,acknowledge,approveResend,resendCandidate,complete,latest,unresolved};
}
module.exports={createDispatchStore,queueRemoved,hasUnresolvedPeer,canAcknowledge};
