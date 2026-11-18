const {resolveCodexExe}=require('./codex-cli');
const {spawn}=require('node:child_process'),readline=require('node:readline');
function validateSelection(v,models){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['model','effort'].includes(k)))throw Error('設定無效。');const model=v.model||'',effort=v.effort||'';if(typeof model!=='string'||typeof effort!=='string')throw Error('設定無效。');if(!model){if(effort)throw Error('請先選擇模型。');return {}}const item=models.find(x=>x.id===model);if(!item||effort&&!item.efforts.includes(effort))throw Error('模型或推理強度已不可用，請重新選擇；任務未送出。');return {...(model?{model}:{}),...(effort?{effort}:{})}}
// model/list 回傳工具目錄；帳號或供應商仍可能拒絕所選模型。
function codexModels(){return new Promise((resolve,reject)=>{const p=spawn(resolveCodexExe(),['app-server'],{stdio:['pipe','pipe','ignore'],windowsHide:true});let done=false,models=[];const end=(err)=>{if(done)return;done=true;clearTimeout(timer);p.kill();err?reject(Error('無法取得 Codex 模型清單，請稍後再試。')):resolve(models)};const timer=setTimeout(()=>end(true),12000);p.on('error',()=>end(true));p.on('exit',()=>end(true));p.stdin.on('error',()=>end(true));const send=(id,method,params)=>p.stdin.write(JSON.stringify({id,method,params})+'\n');readline.createInterface({input:p.stdout}).on('line',line=>{let x;try{x=JSON.parse(line)}catch{return}if(x.error&&[1,2].includes(x.id))return end(true);if(x.id===1){p.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');send(2,'model/list',{limit:100})}if(x.id===2){if(!Array.isArray(x.result?.data))return end(true);models.push(...x.result.data.filter(m=>typeof m.model==='string'&&!m.hidden).map(m=>({id:m.model,label:m.displayName||m.model,efforts:(m.supportedReasoningEfforts||[]).map(e=>e.reasoningEffort).filter(x=>typeof x==='string')})));if(x.result.nextCursor)send(2,'model/list',{limit:100,cursor:x.result.nextCursor});else end(false)}});send(1,'initialize',{clientInfo:{name:'maxagent',version:'0.1.0'}})})}
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const MODEL_KEYS=[['ANTHROPIC_DEFAULT_SONNET_MODEL','Sonnet'],['ANTHROPIC_DEFAULT_OPUS_MODEL','Opus'],['ANTHROPIC_DEFAULT_HAIKU_MODEL','Haiku'],['ANTHROPIC_MODEL','目前模型']];
const modelId=value=>typeof value==='string'&&/^[\w./:\[\]-]+(?:\s+\[1m\])?$/i.test(value.trim())&&value.trim().length<=200?value.trim():null;
const displayName=value=>typeof value==='string'&&value.trim().length<=120&&!/[\x00-\x1f\x7f]/.test(value)?value.trim()||null:null;
const withoutContextMarker=value=>value.replace(/\s*\[1m\]$/i,'');
const loopback=host=>['localhost','127.0.0.1','[::1]','::1'].includes(host);
function claudeMappingModels(env){const seen=new Set(),out=[];for(const [key,label] of MODEL_KEYS){const v=env[key];if(typeof v!=='string'||!v.trim()||v.trim().length>200||/[\x00-\x1f]/.test(v)||seen.has(v.trim()))continue;const id=v.trim();seen.add(id);out.push({id,label:label+'（'+id+'）',efforts:[]})}return out}
function validateClaudeSelection(value,models,savedContext,currentContext){const v=validateSelection(value,models);if(v.model&&(!savedContext||!currentContext||savedContext!==currentContext))throw Error('Claude 連線或供應商已變更，請重新選擇模型；任務未送出。');return v}
function ccSwitchRoute(endpoint,env,dbPath){
 let db;
 try{
  const {DatabaseSync}=require('node:sqlite');
  db=new DatabaseSync(dbPath,{readOnly:true});
  if(loopback(endpoint.hostname)){
   const cfg=db.prepare('SELECT listen_address,listen_port,enabled,auto_failover_enabled FROM proxy_config WHERE app_type=?').get('claude');
   if(!cfg?.enabled||cfg.auto_failover_enabled||Number(cfg.listen_port)!==Number(endpoint.port||(endpoint.protocol==='https:'?443:80)))return null;
   if(!loopback(cfg.listen_address)&&!['0.0.0.0','::','[::]'].includes(cfg.listen_address))return null;
   const state=JSON.parse(fs.readFileSync(path.join(path.dirname(dbPath),'live-state.json'),'utf8'));
   const route=state?.version===1&&state.apps?.claude;
   if(route?.mode!=='proxy'||route.attached!==true||typeof route.proxy_route!=='string'||!route.proxy_route)return null;
   const providers=db.prepare('SELECT id,name,settings_config FROM providers WHERE app_type=? AND id=?').all('claude',route.proxy_route);
   if(providers.length!==1)return null;
   const row=providers[0],providerEnv=JSON.parse(row.settings_config)?.env||{};
   return {id:row.id,name:displayName(row.name),mapping:providerEnv};
  }
  const providers=db.prepare('SELECT id,name,settings_config FROM providers WHERE app_type=? AND is_current=1').all('claude');
  if(providers.length!==1)return null;
  const row=providers[0],providerEnv=JSON.parse(row.settings_config)?.env||{};
  // A selected CC Switch profile alone does not prove that Claude uses it in direct mode.
  const credentials=['ANTHROPIC_AUTH_TOKEN','ANTHROPIC_API_KEY'];
  const matches=credentials.some(k=>env[k]&&env[k]===providerEnv[k])&&credentials.every(k=>(env[k]||'')===(providerEnv[k]||''));
  if(matches&&new URL(providerEnv.ANTHROPIC_BASE_URL).href.replace(/\/$/,'')===endpoint.href.replace(/\/$/,''))return {name:displayName(row.name)};
 }catch{return null}finally{db?.close()}
 return null;
}
function claudeModels(cwd,{home=os.homedir(),processEnv=process.env}={}){
 const empty=reason=>({models:[],context:null,reason,provider:null,defaultModel:null});
 const root=processEnv.CLAUDE_CONFIG_DIR||path.join(home,'.claude');
 const files=[path.join(root,'settings.json'),path.join(cwd,'.claude','settings.json'),path.join(cwd,'.claude','settings.local.json')];
 let env={},fileModel;
 try{for(const f of files){let data;try{data=fs.readFileSync(f,'utf8')}catch(e){if(e.code==='ENOENT')continue;throw e}const setting=JSON.parse(data);if(setting.env&&typeof setting.env==='object')env={...env,...setting.env};if(Object.hasOwn(setting,'model'))fileModel=setting.model}}catch{return empty('無法讀取 Claude 設定，請檢查設定檔；目前沿用原工具設定。')}
 for(const k of [...MODEL_KEYS.map(x=>x[0]),'ANTHROPIC_DEFAULT_MODEL','ANTHROPIC_BASE_URL']){if(processEnv[k]&&env[k]&&processEnv[k]!==env[k])return empty('環境變數與 Claude 設定不一致，無法確認目前模型來源。');if(processEnv[k])env[k]=processEnv[k]}
 let endpoint;try{endpoint=env.ANTHROPIC_BASE_URL?new URL(env.ANTHROPIC_BASE_URL):null}catch{return empty('Claude 連線設定無效，無法確認模型來源。')}
 const proxied=endpoint&&loopback(endpoint.hostname);
 const credentialConflict=['ANTHROPIC_AUTH_TOKEN','ANTHROPIC_API_KEY'].some(k=>processEnv[k]&&processEnv[k]!==env[k]);
 const route=endpoint&&(proxied||!credentialConflict)&&ccSwitchRoute(endpoint,env,path.join(home,'.cc-switch','cc-switch.db'));
 let identity='direct:'+(endpoint?.origin||'default');
 if(proxied){
  if(!route)return empty('無法確認本機代理的目前供應商或代理使用自動切換，暫不開放模型選擇。');
  identity='cc-switch:'+endpoint.origin+':'+route.id;
 }
 function upstreamFor(id){
  if(!route?.mapping||!id)return null;
  // Only predict documented role mappings for a known client ID or explicit role alias.
  for(const [key,label] of MODEL_KEYS.slice(0,3)){
   const role=label.toLowerCase(),clientId=modelId(env[key]);
   if(id.toLowerCase()!==role&&!(clientId===id&&id.toLowerCase().includes(role)))continue;
   const upstream=modelId(route.mapping[key]);
   return upstream?withoutContextMarker(upstream):null;
  }
  return null;
 }
 const models=claudeMappingModels(env).map(m=>({...m,upstreamModel:upstreamFor(m.id)}));
 const configured=modelId(env.ANTHROPIC_MODEL??fileModel??env.ANTHROPIC_DEFAULT_MODEL);
 const defaultModel=configured&&configured.toLowerCase()!=='default'?{id:configured,upstreamModel:upstreamFor(configured)}:null;
 const context=models.length?crypto.createHash('sha256').update(JSON.stringify([identity,models.map(m=>m.id)])).digest('hex'):null;
 const reason=models.length?'來自目前設定的模型映射，尚未驗證供應商接受；推理強度沿用原工具設定。':'目前 Claude 設定沒有可辨識的模型映射，沿用原工具設定。';
 return {models,context,reason,provider:route?.name||null,defaultModel};
}

module.exports={validateSelection,codexModels,claudeMappingModels,claudeModels,validateClaudeSelection};
