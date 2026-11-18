'use strict';
const api=window.maxagent,c=createController(api), $=id=>document.getElementById(id);
const {t,bindPage}=window.MaxAgentI18n,translatePage=bindPage(document);
function detail(value){const text=String(value?.message||value||'');const match=/^(Error invoking remote method '[^']+': Error: )(.*)$/s.exec(text);return match?t(match[2]):t(text)}
let listSnapshot=null,items=[],filter='all',workFilter='',loading=false,loadingOlder=false,limit=24,overviewScroll=0,selectedCard=null,modelSeq=0,modelSaving=false,modelData=[];
const drafts=new Map(),pendingDrafts=new Map(),dirtyDrafts=new Set(),draftWrites=new Map(),draftTimers=new Map();let openSeq=0;
async function flushDraft(k){if(!k)return;clearTimeout(draftTimers.get(k));while(dirtyDrafts.has(k)){const value=drafts.get(k)||'';const prev=draftWrites.get(k)||Promise.resolve();const task=prev.catch(()=>{}).then(()=>api.setDraft(k,value));draftWrites.set(k,task);await task;if(drafts.get(k)===value)dirtyDrafts.delete(k);if(draftWrites.get(k)===task)draftWrites.delete(k)}}
function scheduleDraft(k,value){drafts.set(k,value);dirtyDrafts.add(k);clearTimeout(draftTimers.get(k));draftTimers.set(k,setTimeout(()=>flushDraft(k).catch(e=>{if(c.current===k)error(e)}),350))}
async function flushAllDrafts(){while(dirtyDrafts.size)await flushDraft(dirtyDrafts.values().next().value)}
const label=tool=>({codex:'Codex',claude:'Claude Code',dsh:'DSH',opencode:'OpenCode'})[tool]||t('未知工具');
const supportsDispatch=item=>item?.canResume??['codex','claude'].includes(item?.tool);
const supportsDraft=item=>item?.tool==='dsh'||supportsDispatch(item);
const readOnlyInfo=item=>t(item?.tool==='opencode'?'OpenCode 目前僅供唯讀，尚未開放派工或完成提醒。':'DSH 原對話暫不支援直接派工。可複製草稿，在 DSH 找到同名對話後貼上並送出。');
function error(e){$('notice').textContent=detail(e);$('notice').hidden=false}
function notice(t){$('notice').textContent=t;$('notice').hidden=!t}
function createCard(item){const card=document.createElement('button');card.className='chat-card';card.dataset.key=item.key;const meta=document.createElement('span');meta.className='card-meta';const tool=document.createElement('span');tool.textContent=label(item.tool);meta.append(tool);if(item.unread){const badge=document.createElement('span');badge.className='unread-badge';badge.textContent=t('● 未讀');meta.append(badge)}const title=document.createElement('strong');title.textContent=item.title||t('未命名對話');const desc=document.createElement('p');desc.textContent=item.description||(item.cwd||'').split(/[\\/]/).filter(Boolean).pop()||t('沒有簡介');const status=document.createElement('small');status.textContent=item.tool==='opencode'&&!supportsDispatch(item)?t('唯讀'):workCategories(item).includes('running')&&workCategories(item).includes('pending')?t('處理中；另有結果未確認'):item.job?.queueRemoved&&item.job?.status==='result_unavailable'?t('已取消排隊'):item.job?.status==='queued'?t('排隊中'):item.job?.status==='confirming'?t('確認結果中'):item.job?.status==='running'?t(dispatchLabel(item.job)):workCategories(item).includes('running')?t(dispatchLabel(item.job)||'處理中'):workCategories(item).includes('pending')?t(dispatchLabel(item.job)||'可能已送出，結果未確認'):item.job?.status==='failed'?t('確定沒送出'):item.job?.status==='completed'?t('已完成'):t('狀態未知');card.append(meta,title,desc,status);card.addEventListener('click',()=>{overviewScroll=$('overview').scrollTop;selectedCard=item.key;open(item.key)});return card}
function visibleItems(){const term=$('search').value.trim().toLowerCase();return items.filter(x=>(filter==='all'||filter==='unread'&&x.unread||filter===x.tool)&&(!workFilter||workCategories(x).includes(workFilter))&&(!term||(x.title+' '+x.cwd).toLowerCase().includes(term)))}
function updateWorkbench(){for(const name of ['unread','running','pending'])$('work-'+name).textContent=items.filter(x=>workCategories(x).includes(name)).length;for(const button of document.querySelectorAll('[data-work]'))button.setAttribute('aria-pressed',String(button.dataset.work===workFilter));$('work-hint').textContent=workFilter?t('已套用分類；再點一次顯示全部。'):t('點選分類可篩選對話；再點一次顯示全部。')}
function renderList(){
 const focusedKey=document.activeElement?.classList.contains('chat-card')?document.activeElement.dataset.key:null;const visible=visibleItems();updateWorkbench();
 $('overview-count').textContent=t('{count} 個對話',{count:visible.length});
 $('cards').replaceChildren();for(const item of visible.slice(0,limit))$('cards').append(createCard(item));$('more').hidden=visible.length<=limit;
 if(!visible.length){const p=document.createElement('p');p.className='emptylist';p.textContent=!items.length?t('找不到既有對話。請確認已安裝並登入 Codex 或 Claude Code；Claude Code 可在「設定」選擇 claude.exe。Codex 找不到時可設定 MAXAGENT_CODEX_CLI。'):t('沒有符合條件的對話');$('cards').append(p)}
 if(focusedKey){const card=Array.from($('cards').children).find(x=>x.dataset.key===focusedKey);if(card)card.focus({preventScroll:true})}
}
async function list(force=false){try{const next=await api.list(force);const snapshot=JSON.stringify(next);if(snapshot!==listSnapshot){listSnapshot=snapshot;items=next;renderList()}}catch(e){error(e)}}
function renderHistory(data){
 if(!data)return;const evidence=data.modelEvidence||{};$('last-reply-model').textContent=t('最近正式回覆的模型：{detail}',{detail:evidence.status==='configured'?t('該輪設定：{model}；實際模型未確認',evidence):evidence.status==='reported'?t('Claude Code 回報：{model}（代理後方模型未確認）',evidence):evidence.status==='alias'?t('Claude Code 回報的名稱：{model}；實際模型未確認',evidence):t('實際模型未確認')});$('history').replaceChildren();if(data.cursor!==null&&data.cursor!==undefined){const more=document.createElement('button');more.type='button';more.id='older-history';more.textContent=t('載入更早訊息');more.addEventListener('click',loadOlder);$('history').append(more)}for(const msg of data.messages){const el=document.createElement('article');const kind=['user','progress','final','assistant'].includes(msg.kind)?msg.kind:(msg.role==='user'?'user':'assistant');el.className='message '+msg.role+' kind-'+kind;const name=document.createElement('b');name.textContent=({user:t('你'),progress:t('處理進度'),final:t('正式回覆'),assistant:t('AI 訊息')})[kind];const body=document.createElement('div');if(msg.role==='assistant'&&window.renderAgentMarkdown)window.renderAgentMarkdown(body,msg.text);else body.textContent=msg.text;el.append(name,body);$('history').append(el)}
 if(data.historyUnavailable||!data.messages.length){const p=document.createElement('p');p.textContent=data.historyUnavailable?t('目前無法讀取完整歷史。'):t('沒有可顯示的文字紀錄。');$('history').append(p)}$('history').scrollTop=$('history').scrollHeight;
 const job=data.job;const alert=job?.serviceAlert;const service=document.getElementById('service-alert');service.hidden=!alert;service.textContent=alert?detail(alert)+' '+(job.status==='running'?t('正在等待 Claude Code 結束，請勿重送。'):t('本輪未取得回覆，草稿仍保留。')):'';const current=c.current;if(job?.status==='completed'&&pendingDrafts.has(current)){const sent=pendingDrafts.get(current);pendingDrafts.delete(current);if(drafts.get(current)===sent&&!dirtyDrafts.has(current)){api.getDraft(current).then(d=>{if(c.current===current&&drafts.get(current)===sent&&!dirtyDrafts.has(current)&&d.text===''){drafts.set(current,'');$('prompt').value=''}}).catch(error)}}const canFallback=job?.status==='failed'&&!job.unresolvedCount&&job.reason==='codex_writer_conflict'&&items.find(x=>x.key===current)?.tool==='codex';$('codex-fallback').hidden=!canFallback;if(canFallback){const title=items.find(x=>x.key===current)?.title||t('未命名對話');$('codex-fallback-description').textContent=t('原對話「{title}」：複製後開啟原對話，請自行貼上及送出。',{title})}$('status').textContent=job?.status==='running'?(alert?t('服務回報錯誤'):t(dispatchLabel(job))):job?.status==='confirming'?t('確認結果中'):job?.status==='completed'?t('已完成'):job?.status==='result_unavailable'?t(dispatchLabel(job)):job?.status==='failed'?t('確定沒送出'):data.busy?t('原對話執行中'):'';
 if(job?.status==='queued')$('status').textContent=t('排隊中');
 if(job?.queueRemoved&&job.status==='result_unavailable')$('status').textContent=job.resendBlocked?t('原任務已被接收'):job.resendApproved?t('已解除重送限制'):t('已取消排隊');
 $('cancel-codex-queue').hidden=!(job?.queue?.clientId&&!job.queue.cancelRequested&&['queued','result_unavailable'].includes(job.status));
 $('review-codex-resend').hidden=!job?.canReviewResend;
 $('acknowledge-pending').hidden=!job?.canAcknowledgePending;
 $('send').disabled=loading||['running','queued','confirming'].includes(job?.status)||(data.busy&&items.find(x=>x.key===current)?.tool!=='codex');
 if(job?.status==='confirming'&&job.phase==='accepted'&&job.turn)notice(t('原對話已接收本輪任務，正在確認結果。'));
 $('copy-dsh-draft').hidden=items.find(x=>x.key===current)?.tool!=='dsh'||!!job?.dsh&&['running','queued','confirming','result_unavailable','reviewed_unknown'].includes(job.status);
 if(job?.status==='queued')notice(t(job.dsh?'DSH 已接收並排隊，等待原對話開始。':'已加入原對話的待處理清單，尚未確認接收；請勿重送。'));else if(job?.queueRemoved&&job.status==='result_unavailable')notice(job.resendBlocked?t('原對話已收到先前任務，為避免重複，請勿重送。'):job.resendApproved?t('已解除重送限制；請注意原任務仍可能稍後出現，重新發送有重複風險。'):t('已從排隊清單移除。原任務可能已被 Codex 取走，請勿重送；可以發送其他任務。'));else if(alert)notice('');else if(job?.status==='failed'||job?.status==='result_unavailable')notice((job.status==='result_unavailable'?t(dispatchLabel(job))+'：':t('確定沒送出：'))+(job.error?detail(job.error):t('請在原工具查看原因。')));else if(job?.unresolvedCount&&!['running','confirming'].includes(job.status))notice(t('另有 {count} 筆派工可能已送出，結果未確認。',{count:job.unresolvedCount}));else if(job?.status==='completed')notice(items.find(x=>x.key===current)?.tool==='claude'&&!job.peer?t('任務已完成，回覆可在 MaxAgent 查看；Claude 桌面已開啟的畫面可能不會即時更新。'):t('任務已完成。選擇此對話即可查看並標記已讀。'));
}
async function loadOlder(){const k=c.current,data=c.history;if(loadingOlder||!k||data?.cursor==null)return;loadingOlder=true;const view=$('history'),height=view.scrollHeight,top=view.scrollTop;try{const page=await api.history(k,data.cursor);if(c.current!==k||c.history!==data)return;data.messages=[...page.messages,...data.messages];data.cursor=page.cursor;renderHistory(data);view.scrollTop=top+(view.scrollHeight-height)}catch(e){if(c.current===k)error(e)}finally{loadingOlder=false}}
$('history').addEventListener('scroll',()=>{const view=$('history');if(view.scrollTop<=5&&view.scrollHeight>view.clientHeight)void loadOlder()});
async function open(k){try{const n=++openSeq,previous=c.current;if(previous&&supportsDraft(items.find(x=>x.key===previous))){scheduleDraft(previous,$('prompt').value);await flushDraft(previous)}if(n!==openSeq)return;const target=items.find(x=>x.key===k);if(!target)return;closeModelMenu();const oldValue=drafts.get(k);$('prompt').value=oldValue||'';notice('');const data=await c.open(k);if(n!==openSeq||c.current!==k||!data)return;if(supportsDraft(target)){const saved=await api.getDraft(k);if(n!==openSeq||c.current!==k)return;if(!dirtyDrafts.has(k)){$('prompt').value=saved.text;drafts.set(k,saved.text)}}if(c.current!==k||!data)return;const s=items.find(x=>x.key===k);if(!s)return;$('overview').hidden=true;document.querySelector('.top').hidden=false;$('history').hidden=false;$('identity').hidden=false;$('composer').hidden=!supportsDraft(s);$('send').hidden=!supportsDispatch(s);$('model-trigger').hidden=!supportsDispatch(s);$('composer-note').hidden=!supportsDispatch(s);$('readonly-info').hidden=supportsDispatch(s);$('readonly-info').textContent=readOnlyInfo(s);$('badge').textContent=label(s.tool);$('title').textContent=s.title||t('未命名對話');$('cwd').textContent=s.cwd;renderHistory(data);if(supportsDispatch(s))loadChatModel(k);else modelSeq++;await list(false)}catch(e){error(e)}}
async function update(k){try{await list(true);if(k===c.current){const data=await c.refresh();if(data&&c.current===k){renderHistory(data);if(data.last){await api.read(k,data.last);if(c.current===k)await list(false)}}}}catch(e){error(e)}}
let modelSelection={},modelReady=false,claudeRoute=null;
const defaultModel=()=>items.find(x=>x.key===c.current)?.tool==='claude'?(claudeRoute?.desktopStatus==='ok'?t('跟隨 Claude 桌面對話模型'):t('沿用 Claude Code 程序設定')):t('沿用原工具設定');
const effortLabel=value=>({minimal:t('極低'),low:t('低'),medium:t('中'),high:t('高'),xhigh:t('極高'),max:t('最高'),none:t('無'),auto:t('自動')})[value]||value;
function closeModelMenu(){const menu=$('model-popover');if(menu.matches(':popover-open'))menu.hidePopover()}
function renderModelChoices(){
 const model=modelData.find(x=>x.id===modelSelection.model),efforts=model?.efforts||[];
 const unavailable=modelSelection.model&&!model;
 const stale=claudeRoute?.selectionChanged;
 const next=stale?null:modelSelection.model?model:claudeRoute?.defaultModel;
 $('claude-model-route').hidden=!claudeRoute;
 if(claudeRoute){
  $('claude-provider').textContent=claudeRoute.provider||t('未確認');$('claude-model-note').textContent=claudeRoute.desktopStatus==='ok'?t('選擇跟隨時，發送前會重新讀取此 Claude 桌面對話記錄的模型；供應商實際使用的模型可能不同。'):t('MaxAgent 使用獨立的 Claude Code 程序派工；沿用的是該程序的設定，不一定與 Claude 桌面視窗目前選擇的模型相同。');
  $('claude-next-model').textContent=stale?t('未確認（請重新選擇）'):next?.upstreamModel?next.upstreamModel+t('（CC Switch 映射；實際模型未確認）'):next?.id?next.id+t('（Claude Code 設定；實際模型未確認）'):t('未確認（沿用 Claude Code 設定）');
 }
 const summary=stale?t('未確認 · 請重新選擇'):next?.upstreamModel||(claudeRoute&&!modelSelection.model&&next?.id)||[model?.label||(unavailable?modelSelection.model+t('（不可用）'):defaultModel()),modelSelection.effort?effortLabel(modelSelection.effort):''].filter(Boolean).join(' · ');
 $('model-trigger-value').textContent=summary;
 $('model-trigger').setAttribute('aria-label',t('下一輪模型設定：')+summary);
 $('model-refresh').disabled=modelSaving;
 const focused=document.activeElement;
 function fill(id,rows,current,kind){
  const group=$(id);
  group.replaceChildren(...rows.map(({value,label,unavailable})=>{
   const button=document.createElement('button'),name=document.createElement('span'),check=document.createElement('span');
   button.type='button';button.className='model-choice';button.dataset.value=value;
   button.setAttribute('aria-pressed',String(current===value));
   name.textContent=label;check.textContent=current===value?'✓':'';check.setAttribute('aria-hidden','true');
   button.append(name,check);button.disabled=!!unavailable||!modelReady||modelSaving;
   button.addEventListener('click',()=>{if(current!==value)void saveChatModel(kind==='model'?{model:value,effort:''}:{model:modelSelection.model||'',effort:value},id,value)});
   return button
  }));
  if(focused?.parentElement===group)group.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
 }
 fill('model-choices',[{value:'',label:defaultModel()},...modelData.map(x=>({value:x.id,label:x.upstreamModel?x.label+' → '+x.upstreamModel:x.label})),...(unavailable?[{value:modelSelection.model,label:modelSelection.model+t('（不可用）'),unavailable:true}]:[])],stale?null:modelSelection.model||'','model');
 $('effort-section').hidden=!efforts.length&&!modelSelection.effort;
 fill('effort-choices',[{value:'',label:t('使用模型預設')},...efforts.map(value=>({value,label:effortLabel(value)})),...(modelSelection.effort&&!efforts.includes(modelSelection.effort)?[{value:modelSelection.effort,label:effortLabel(modelSelection.effort)+t('（不可用）'),unavailable:true}]:[])],modelSelection.effort||'','effort');
}
async function loadChatModel(k){
 const n=++modelSeq;modelData=[];modelSelection={};modelReady=false;$('opencode-model-note').hidden=items.find(x=>x.key===k)?.tool!=='opencode';$('claude-model-note').hidden=items.find(x=>x.key===k)?.tool!=='claude';
 claudeRoute=items.find(x=>x.key===k)?.tool==='claude'?{}:null;
 $('model-help').textContent=t('正在取得設定…');renderModelChoices();
 try{
  const data=await api.getChatModel(k);if(n!==modelSeq||c.current!==k)return;
  modelData=data.models||[];modelSelection=data.selection||{};modelReady=!!modelData.length||!!modelSelection.model;
  if(claudeRoute)claudeRoute=data;
  $('model-help').textContent=data.reason||'';renderModelChoices();
 }catch(e){if(n===modelSeq&&c.current===k)$('model-help').textContent=detail(e)}
}
async function saveChatModel(selection,group,value){
 const k=c.current;let n=modelSeq;if(!k||modelSaving||!modelReady)return;
 let saved=false;
 modelSaving=true;$('send').disabled=true;renderModelChoices();
 try{
  await api.setChatModel(k,selection);
  if(n===modelSeq&&c.current===k){saved=true;modelSelection=selection;$('model-help').textContent=t('已儲存；實際採用的模型與強度尚待確認。')}
 }catch(e){if(n===modelSeq&&c.current===k)$('model-help').textContent=detail(e)}
 finally{
  modelSaving=false;
  if(saved&&claudeRoute&&c.current===k&&n===modelSeq){
   const refreshed=loadChatModel(k);n=modelSeq;await refreshed;
   if(modelSeq===n&&c.current===k&&modelReady&&!claudeRoute.selectionChanged)$('model-help').textContent=t('已儲存；實際採用的模型尚待確認。');
  }
  renderModelChoices();
  if(c.current===k&&n===modelSeq){
   $('send').disabled=loading||['running','queued','confirming'].includes(c.history?.job?.status)||(c.history?.busy&&items.find(x=>x.key===c.current)?.tool!=='codex');
   if($('model-popover').matches(':popover-open')&&[document.body,$('model-popover')].includes(document.activeElement))Array.from($(group).children).find(x=>x.dataset.value===value&&!x.disabled)?.focus({preventScroll:true});
  }else if(c.current&&c.history&&!$('composer').hidden){
   $('send').disabled=loading||['running','queued','confirming'].includes(c.history.job?.status)||(c.history.busy&&items.find(x=>x.key===c.current)?.tool!=='codex');
  }
 }
}
$('model-refresh').addEventListener('click',()=>{if(c.current&&!modelSaving)loadChatModel(c.current)});
function refreshClaudeRoute(){if(c.current&&!modelSaving&&items.find(x=>x.key===c.current)?.tool==='claude')void loadChatModel(c.current)}
window.addEventListener('focus',refreshClaudeRoute);
$('model-popover').addEventListener('toggle',e=>{if(e.newState==='open')refreshClaudeRoute()});
document.querySelector('.workbench-filters').addEventListener('click',e=>{const button=e.target.closest('button[data-work]');if(!button)return;workFilter=workFilter===button.dataset.work?'':button.dataset.work;limit=24;renderList()});
$('filters').addEventListener('click',e=>{const b=e.target.closest('button[data-filter]');if(!b)return;filter=b.dataset.filter;limit=24;for(const x of $('filters').querySelectorAll('button'))x.setAttribute('aria-pressed',String(x===b));renderList()});
$('search').addEventListener('input',()=>{limit=24;renderList()});$('more').addEventListener('click',()=>{limit+=24;renderList()});$('back').addEventListener('click',async()=>{if(c.current&&supportsDraft(items.find(x=>x.key===c.current))){scheduleDraft(c.current,$('prompt').value);try{await flushDraft(c.current)}catch(e){error(e);return}}closeModelMenu();document.getElementById('service-alert').hidden=true;openSeq++;c.current=null;c.history=null;$('history').replaceChildren();$('readonly-info').hidden=true;$('codex-fallback').hidden=true;$('acknowledge-pending').hidden=true;$('cancel-codex-queue').hidden=true;$('review-codex-resend').hidden=true;modelSeq++;$('overview').hidden=false;document.querySelector('.top').hidden=true;$('history').hidden=true;$('composer').hidden=true;notice('');renderList();const card=Array.from($('cards').children).find(x=>x.dataset.key===selectedCard);if(card)card.focus({preventScroll:true});$('overview').scrollTop=overviewScroll});$('refresh').addEventListener('click',()=>list(true));
function applyTheme(theme){document.documentElement.dataset.theme=theme;const input=document.querySelector('input[name="theme"][value="'+theme+'"]');if(input)input.checked=true}
function applyLanguage(value){
 translatePage(value);$('language').value=document.documentElement.lang;
 renderList();
 if(c.current&&c.history&&!$('history').hidden){
  const view=$('history'),top=view.scrollTop;
  renderHistory(c.history);view.scrollTop=top;
  renderModelChoices();
  const current=items.find(x=>x.key===c.current);
  if(!supportsDispatch(current))$('readonly-info').textContent=readOnlyInfo(current);
  else if(!modelSaving)void loadChatModel(c.current);
 }
}
api.getPreferences().then(p=>{applyLanguage(p.language);applyTheme(p.theme);$('windows-notifications').checked=p.windowsNotifications;$('desktop-pet').checked=p.desktopPet;$('pet-movable').checked=p.petMovable}).catch(error);
$('language').addEventListener('change',async e=>{
 const input=e.target;input.disabled=true;$('language-status').textContent='';
 try{const p=await api.setPreference('language',input.value);applyLanguage(p.language)}
 catch{input.value=document.documentElement.lang;$('language-status').textContent=t('無法保存語言設定。')}
 finally{input.disabled=false}
});
async function loadClaudePetHook(){const el=$('claude-pet-hook');el.disabled=true;try{const s=await api.getClaudePetHook();el.checked=s==='enabled';el.indeterminate=s==='partial';el.disabled=false;$('claude-pet-hook-status').textContent=s==='partial'?t('提醒設定不完整，可重新開啟修復。'):''}catch(e){$('claude-pet-hook-status').textContent=detail(e)}}
async function loadCodexStopHook(){const el=$('codex-stop-hook');el.disabled=true;try{el.checked=await api.getCodexStopHook();el.disabled=false}catch(e){$('codex-stop-hook-status').textContent=detail(e)}}
$('settings').addEventListener('click',()=>{$('settings-dialog').showModal();loadClaudePetHook();loadCodexStopHook();loadDshLink()});
$('codex-stop-hook').addEventListener('change',async e=>{const el=e.target,want=el.checked;el.disabled=true;try{el.checked=await api.setCodexStopHook(want);$('codex-stop-hook-status').textContent=want?t('已加入，請到 Codex Settings → Hooks 審核；桌面觸發尚未確認。'):t('已移除 MaxAgent 的 Codex Hook。')}catch(err){el.checked=!want;$('codex-stop-hook-status').textContent=t('無法更新：')+detail(err)}finally{el.disabled=false}});
$('claude-pet-hook').addEventListener('change',async e=>{const el=e.target,want=el.checked;el.disabled=true;try{const s=await api.setClaudePetHook(want);el.checked=s==='enabled';el.indeterminate=s==='partial';$('claude-pet-hook-status').textContent=want?t('已加入提醒設定。Claude Code 是否已載入及實際提醒仍待確認。'):t('已移除 MaxAgent 的提醒設定。')}catch(err){el.checked=!want;$('claude-pet-hook-status').textContent=t('無法更新提醒：')+detail(err)}finally{el.disabled=false}});
$('settings-close').addEventListener('click',()=>$('settings-dialog').close());
function showDshLink(status){
 $('dsh-link-enable').disabled=false;$('dsh-link-enable').textContent=t(status.paired?'更新 DSH 配對擴充':'啟用 DSH 配對');
 $('dsh-link-disable').disabled=!status.paired;
 $('dsh-link-status').textContent=t(status.connected?'已連上 DSH 桌面。':status.paired?'已配對。請重開 DSH，再打開原對話。':'尚未配對。可繼續複製草稿。');
}
async function loadDshLink(){
 try{showDshLink(await api.getDshLink())}catch(e){$('dsh-link-status').textContent=detail(e)}
}
for(const enabled of [true,false]){
 $(enabled?'dsh-link-enable':'dsh-link-disable').addEventListener('click',async()=>{
  $('dsh-link-enable').disabled=$('dsh-link-disable').disabled=true;
  try{
   showDshLink(await api.setDshLink(enabled));await list(true);
   if(c.current&&items.find(x=>x.key===c.current)?.tool==='dsh')await open(c.current);
  }catch(e){$('dsh-link-enable').disabled=$('dsh-link-disable').disabled=false;$('dsh-link-status').textContent=detail(e)}
 });
}
$('settings-dialog').addEventListener('change',async e=>{if(e.target.name!=='theme')return;try{const p=await api.setPreference('theme',e.target.value);applyTheme(p.theme)}catch(err){error(err)}});
let notificationFailureVersion=0;
$('test-windows-notification').addEventListener('click',async()=>{const el=$('test-windows-notification'),version=notificationFailureVersion;el.disabled=true;try{const result=await api.testNotification();if(version===notificationFailureVersion)$('test-notification-status').textContent=(result.requested?t('已提出測試通知請求；請求成功不代表桌面已彈出。'):t('通知失敗：')+detail(result.error))+(result.shortcut&&!result.shortcut.ok?' '+detail(result.shortcut.error):'')}catch(e){$('test-notification-status').textContent=t('通知失敗：')+detail(e)}finally{el.disabled=false}});
api.notificationFailure(message=>{notificationFailureVersion++;$('test-notification-status').textContent=t('通知失敗：')+detail(message)});
$('windows-notifications').addEventListener('change',async e=>{const input=e.target,previous=!input.checked;input.disabled=true;try{const p=await api.setPreference('windowsNotifications',input.checked);input.checked=p.windowsNotifications}catch(err){input.checked=previous;const msg=document.createElement('p');msg.textContent=t('無法保存通知設定：')+detail(err);msg.setAttribute('role','alert');$('settings-dialog').append(msg)}finally{input.disabled=false}});
$('desktop-pet').addEventListener('change',async e=>{const input=e.target,previous=!input.checked;input.disabled=true;try{const p=await api.setPreference('desktopPet',input.checked);input.checked=p.desktopPet}catch(err){input.checked=previous;const msg=document.createElement('p');msg.textContent=t('無法保存桌面寵物設定：')+detail(err);msg.setAttribute('role','alert');$('settings-dialog').append(msg)}finally{input.disabled=false}});
$('pet-movable').addEventListener('change',async e=>{const input=e.target,previous=!input.checked;input.disabled=true;try{const p=await api.setPreference('petMovable',input.checked);input.checked=p.petMovable}catch(err){input.checked=previous;const msg=document.createElement('p');msg.textContent=t('無法保存移動設定：')+detail(err);msg.setAttribute('role','alert');$('settings-dialog').append(msg)}finally{input.disabled=false}});
api.preferencesChanged(p=>{$('desktop-pet').checked=p.desktopPet});
api.preferenceError(message=>{const msg=document.createElement('p');msg.textContent=detail(message);msg.setAttribute('role','alert');$('settings-dialog').append(msg)});
$('choose-claude').addEventListener('click',async()=>{try{if(await api.chooseClaude()){ $('settings-dialog').close();notice(t('已設定 Claude Code CLI。'))}}catch(e){error(e)}});
$('prompt').addEventListener('input',()=>{if(c.current)scheduleDraft(c.current,$('prompt').value)});
$('copy-dsh-draft').addEventListener('click',async()=>{
 const k=c.current,button=$('copy-dsh-draft');
 if(items.find(x=>x.key===k)?.tool!=='dsh')return;
 button.disabled=true;
 try{
  scheduleDraft(k,$('prompt').value);await flushDraft(k);await api.copyDshDraft(k);
  if(c.current===k)notice(t('草稿已複製。請在 DSH 的原對話貼上並送出。'));
 }catch(e){if(c.current===k)error(e)}finally{button.disabled=false}
});
api.beforeClose(async()=>{try{await flushAllDrafts();await api.closeReady()}catch(e){error(e);notice(t('草稿未能保存：{error}。請先處理後再關閉。',{error:detail(e)}))}});
$('codex-fallback-button').addEventListener('click',async()=>{const k=c.current,text=$('prompt').value;if(!k)return;const button=$('codex-fallback-button');button.disabled=true;try{await flushDraft(k);const r=await api.manualCodexFallback(k,text);if(c.current===k){const title=items.find(x=>x.key===k)?.title||t('未命名對話');notice(r.opened?t('任務已複製，已要求 Windows 開啟原對話「{title}」。請自行貼上及送出。',{title}):t('草稿已複製，但開啟請求失敗；請手動在 Codex 找回原對話「{title}」。',{title}))}}catch(e){if(c.current===k)error(e)}finally{button.disabled=false}});
$('cancel-codex-queue').addEventListener('click',async()=>{const k=c.current,button=$('cancel-codex-queue');if(!k)return;button.disabled=true;try{await api.cancelCodexQueue(k);await update(k)}catch(e){if(c.current===k)error(e)}finally{button.disabled=false}});
$('open-codex-resend').addEventListener('click',async()=>{const k=c.current;if(!k)return;try{const result=await api.openCodexForResend(k);if(!result.opened&&c.current===k)notice(t('無法開啟 Codex，請自行找到同一個原對話。'))}catch(e){if(c.current===k)error(e)}});
$('acknowledge-pending').addEventListener('click',async()=>{const k=c.current,button=$('acknowledge-pending');if(!k)return;button.disabled=true;try{if(await api.acknowledgePending(k)&&c.current===k)await update(k)}catch(e){if(c.current===k)error(e)}finally{button.disabled=false}});
$('approve-codex-resend').addEventListener('click',async()=>{const k=c.current,button=$('approve-codex-resend');if(!k)return;button.disabled=true;try{await flushDraft(k);const result=await api.reviewCodexResend(k);if(c.current===k){await update(k);if(result.approved)notice(t('已解除這筆草稿的限制；請檢查內容後自行按發送。'))}}catch(e){if(c.current===k)error(e)}finally{button.disabled=false}});
$('composer').addEventListener('submit',async e=>{e.preventDefault();const k=c.current,value=$('prompt').value.trim();if(!k||!value||loading||modelSaving||!supportsDispatch(items.find(x=>x.key===k)))return;scheduleDraft(k,$('prompt').value);pendingDrafts.set(k,$('prompt').value);loading=true;let sendError=null;$('send').disabled=true;notice(t('正在向所選原對話派工…'));try{await flushDraft(k);await api.send(k,value);await update(k)}catch(err){pendingDrafts.delete(k);sendError=err}finally{loading=false;if(c.current===k&&c.history)renderHistory(c.history);if(sendError&&c.current===k)notice(t('本次未開始派工：')+detail(sendError))}});
api.sessionUpdated(async item=>{const index=items.findIndex(x=>x.key===item.key);if(index<0)return;items[index]={...items[index],...item};listSnapshot=null;const visible=visibleItems(),at=visible.findIndex(x=>x.key===item.key),card=Array.from($('cards').children).find(x=>x.dataset.key===item.key);if(at<0||at>=limit){card?.remove()}else if(card)card.replaceWith(createCard(items[index]));else{const next=visible.slice(at+1,limit).map(x=>Array.from($('cards').children).find(y=>y.dataset.key===x.key)).find(Boolean);$('cards').querySelector('.emptylist')?.remove();$('cards').insertBefore(createCard(items[index]),next||null)}updateWorkbench();$('overview-count').textContent=t('{count} 個對話',{count:visible.length});$('more').hidden=visible.length<=limit;if(c.current===item.key){try{const data=await c.refresh();if(data&&c.current===item.key){renderHistory(data);if(data.last)await api.read(item.key,data.last)}}catch(e){error(e)}}});
api.changed(k=>{update(k)});api.focus(k=>{open(k)});list(true);setInterval(()=>list(false),15000);
