const fs=require('node:fs');
function findResult(tool,data,id,receipt){let turn=null,final=false;const candidates=[];for(const line of data.split('\n').slice(0,-1)){let x;try{x=JSON.parse(line)}catch{continue}const p=x.payload||{};if(tool==='codex'){if(x.type==='event_msg'&&p.type==='task_started'){turn=p.turn_id;final=false}if(turn===receipt.turn&&x.type==='response_item'&&p.type==='message'&&p.role==='assistant'&&p.phase==='final_answer'&&p.content?.some(v=>v.text?.trim()))final=true;if(turn===receipt.turn&&x.type==='event_msg'&&p.type==='task_complete'&&p.turn_id===receipt.turn&&(final||typeof p.last_agent_message==='string'&&p.last_agent_message.trim()))return {marker:x.timestamp,turn:receipt.turn};}else if(x.sessionId===id&&!x.isSidechain&&!x.isApiErrorMessage&&!x.error&&x.type==='assistant'&&x.uuid&&x.message?.stop_reason==='end_turn'&&(receipt.messageId||typeof receipt.result==='string'&&receipt.result.trim())){const t=Array.isArray(x.message?.content)?x.message.content.filter(v=>v.type==='text').map(v=>v.text||'').join('\n'):'';if(t.trim()&&(!receipt.result||t.trim()===receipt.result.trim())&&(!receipt.messageId||x.message.id===receipt.messageId))candidates.push({marker:x.uuid,turn:x.uuid})}}return candidates.length===1?candidates[0]:null}
function readResult(s,offset,receipt){
 const fd=fs.openSync(s.file,'r');
 try{
  const {size}=fs.fstatSync(fd);
  if(!Number.isSafeInteger(offset)||offset<0||size<offset)throw Error('原對話紀錄已變更，無法確認本輪結果。');
  const buffer=Buffer.alloc(size-offset);
  const n=fs.readSync(fd,buffer,0,buffer.length,offset);
  return findResult(s.tool,buffer.subarray(0,n).toString('utf8'),s.id,receipt);
 }finally{fs.closeSync(fd)}
}
async function waitResult(s,offset,receipt,timeout=15000){const deadline=Date.now()+timeout;while(Date.now()<deadline){try{const r=readResult(s,offset,receipt);if(r)return r}catch(e){if(e.code!=='ENOENT')throw e}await new Promise(r=>setTimeout(r,250))}throw Error('工具已回報完成，但未能在原對話確認本輪結果。請查看原工具，勿重送。')}
module.exports={findResult,readResult,waitResult};
