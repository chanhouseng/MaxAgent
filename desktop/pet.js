const $=id=>document.getElementById(id);
const {t,bindPage}=window.MaxAgentI18n,translatePage=bindPage(document);
let expanded=false,changing=false,revision=0,seenRevision=0;
function updateDot(){
 const pending=revision>seenRevision,dot=$('dot');
 dot.classList.toggle('pending',pending);
 dot.setAttribute('aria-label',expanded?t('收起任務列表'):pending?t('有新完成任務，展開查看'):t('展開任務列表'));
}
async function togglePanel(){
 if(changing)return;
 changing=true;
 try{
  const layout=await window.pet.setExpanded(!expanded);
  expanded=layout.expanded;
  document.body.classList.toggle('right',layout.right);
  document.body.classList.toggle('bottom',layout.bottom);
  $('lists').hidden=!expanded;
  $('dot').setAttribute('aria-expanded',String(expanded));
  if(expanded){seenRevision=revision;$('open-status').textContent=''}
  updateDot();
 }finally{changing=false}
}
$('dot').addEventListener('click',()=>void togglePanel().catch(console.error));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded){$('dot').focus();void togglePanel().catch(console.error)}});
const opening=new Set();
async function openChat(item){
 if(opening.has(item.key))return;
 opening.add(item.key);
 const status=$('open-status');
 status.textContent='';
 try{if(await window.pet.openChat(item.key))return}catch{}
 finally{opening.delete(item.key)}
 status.textContent=item.tool==='codex'?t('無法開啟這個 Codex 對話。請在 Codex 中搜尋對話名稱。'):t('無法開啟 Claude 桌面版的這個對話。請到桌面版的 Code 側欄找原對話，或回 MaxAgent 查看結果。');
}
function renderList(id,items){const list=$(id);list.replaceChildren();for(const item of items){const li=document.createElement('li'),title=document.createElement('div'),meta=document.createElement('span');title.textContent=item.title;meta.textContent=(item.source==='codex-record'?t('Codex 原紀錄'):item.source==='claude-hook'?t('Claude Code 原工具'):item.tool==='codex'?t('Codex · MaxAgent 派工'):t('Claude Code · MaxAgent 派工'))+' · '+(item.source==='codex-record'&&item.status==='running'?t('紀錄顯示處理中'):({running:t('處理中'),confirming:t('確認結果中'),completed:t('已完成')}[item.status]));
 if(item.tool==='codex'||item.tool==='claude'){
  const label=item.tool==='codex'?t('在 Codex 開啟'):t('在 Claude 桌面版開啟');
  const button=document.createElement('button');button.type='button';button.className='open-chat';button.dataset.tool=item.tool;button.setAttribute('aria-label',label+'：'+item.title);
  button.title=label;
  const name=document.createElement('span');name.className='chat-name';name.textContent=title.textContent;
  button.append(name,meta);button.addEventListener('click',()=>openChat(item));li.append(button);
 }else li.append(title,meta);
 list.append(li)}}
window.pet.onState(s=>{
 if(s.language!==document.documentElement.lang){
  translatePage(s.language);$('open-status').textContent='';
 }
 document.documentElement.dataset.theme=s.theme==='dark'?'dark':'light';
 document.body.classList.toggle('movable',s.movable);
 revision=s.revision;
 if(expanded)seenRevision=revision;
 updateDot();
 $('running-section').hidden=!s.running.length;
 $('recent-section').hidden=!s.recent.length;
 $('empty-state').hidden=!!(s.running.length||s.recent.length);
 renderList('running',s.running);
 renderList('recent',s.recent);
});
