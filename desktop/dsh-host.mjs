import path from 'node:path';
import crypto from 'node:crypto';
import link from './dsh-link.js';

export const inject=['sessions','agents','sessionController','llm'];

const notSent=(reason='model')=>Object.assign(Error('DSH 模型或原對話狀態已變更，任務未送出。'),{sendPhase:'not_sent',reason});
export async function modelCatalog(ctx,id){
 const catalog=await ctx.sessionController.modelCatalog();
 const models=[];
 for(const group of catalog.groups||[])for(const model of group.models||[]){
  if(typeof group.id!=='string'||typeof model.id!=='string')continue;
  models.push({id:JSON.stringify([group.id,model.id]),label:String(group.name||group.id)+' · '+String(model.name||model.id),efforts:(model.reasoning?.efforts||[]).map(e=>e.id).filter(e=>typeof e==='string')});
 }
 models.sort((a,b)=>a.id.localeCompare(b.id));
 return {models,context:crypto.createHash('sha256').update(JSON.stringify(models)).digest('hex'),current:ctx.agents.get(id)?.model?.current()};
}

export async function sendSelected(ctx,id,text,requestId,options){
 const agent=ctx.agents.get(id);
 const prompt=()=>ctx.sessionController.prompt({sessionId:id,requestId,mode:'queue',content:[{type:'text',text}]},AbortSignal.timeout(4000));
 if(!options?.model)return prompt();
 let catalog,selected;
 try{
  if(Object.keys(options).some(k=>!['model','effort','context'].includes(k)))throw notSent();
  catalog=await modelCatalog(ctx,id);
  const found=catalog.models.find(m=>m.id===options.model);
  if(!found||options.context!==catalog.context||options.effort&&!found.efforts.includes(options.effort))throw notSent('model_stale');
  const [provider,model]=JSON.parse(found.id);
  selected={provider,model,...options.effort?{reasoningEffort:options.effort}:{}};
  await ctx.llm.resolveCallConfig(selected);
  if(ctx.agents.get(id)!==agent)throw notSent();
  if(agent.status!=='idle'||agent.inbox.nextTurn.length||agent.inbox.nextStep.length)throw notSent('model_busy');
 }catch(e){if(e?.sendPhase==='not_sent')throw e;throw notSent()}
 let started=false;
 try{return await agent.runMaintenance(async()=>{
  if(ctx.agents.get(id)!==agent)throw notSent();
  // Select only this Agent; SessionController.selectModel also saves a global default.
  agent.model.select(selected);
  if(JSON.stringify(agent.model.current())!==JSON.stringify(selected))throw notSent();
  started=true;
  return await prompt();
 })}catch(e){if(!started)throw notSent();throw e}
}

// Runs inside the DSH desktop Host. Never creates or resumes a detached session.
export function apply(ctx,{pairingFile}={}){
 if(typeof pairingFile!=='string'||!path.isAbsolute(pairingFile)||typeof ctx.sessionController?.prompt!=='function')return;
 function target(id){
  const session=ctx.sessions.get(id),agent=ctx.agents.get(id);
  if(!session||agent?.session!==session||session.header?.origin==='subagent'||typeof session.snapshotEvents!=='function')return null;
  return session;
 }
 let bridge;
 try{bridge=link.createServer(pairingFile,{
  get(id){
   const session=target(id);
   if(!session)return null;
   return {id:session.id,cwd:session.header.cwd,seq:session.seq,events:(from,to)=>session.snapshotEvents(from,to)};
  },
  models(id){return modelCatalog(ctx,id)},
  send(id,text,requestId,options){
   if(!target(id))return {accepted:false};
   return sendSelected(ctx,id,text,requestId,options);
  }
 })}catch{return} // A missing or revoked pairing must not prevent DSH from starting.
 bridge.ready.catch(()=>{void bridge.close()});
 ctx.on('dispose',()=>bridge.close());
}
