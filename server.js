#!/usr/bin/env node
/* ============================================================
 * Agent Board — 多 Agent 任務瞭望台 (v1)
 * 監看: DSH / Codex / Claude Code 的本地 session 記錄
 * 用法: node server.js  →  http://127.0.0.1:7750
 * 零依賴，Node 18+ 即可
 * ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');


/* ---------- 可調參數 ---------- */
const PORT = 7760;
const HOST = '127.0.0.1';
const SCAN_MS = 3000;                 // 掃描間隔
const WINDOW_DAYS = 7;                // 只深入解析最近 N 天的 Codex 檔
const WORK_FRESH_SEC = 180;           // mid-turn 且檔案 3 分鐘內有寫入 → 正在工作
const WAIT_MAX_SEC = 2 * 3600;        // 「等你」訊號在 2 小時內才顯示
const STALL_MAX_SEC = 30 * 60;        // mid-turn 超過 30 分鐘無動靜就歸閒置

const HOME = os.homedir();
const DIRS = {
  DSH:   path.join(HOME, '.dsh', 'storages', 'session_projcache', 'sessions'),
  CC:    path.join(HOME, '.claude', 'projects'),
  Codex: path.join(HOME, '.codex', 'sessions'),
};

/* ---------- 通用工具 ---------- */
function walkFiles(dir, filterFn, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, filterFn, out);
    else if (e.isFile() && filterFn(e.name, p)) out.push(p);
  }
  return out;
}
function readJsonSafe(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }
  try { return JSON.parse(raw); } catch {}
  // 保險：清掉非法控制字元再試一次
  try { return JSON.parse(raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')); } catch { return null; }
}
function firstText(s, n) { s = (s || '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, n) : ''; }
function relState(nowMs, lastActMs) { return (nowMs - lastActMs) / 1000; }

/* ---------- 狀態機 ----------
 * working   = 有未結束的步驟（真的在生成/執行中），且檔案仍在寫入
 * waitingYou= 明確等你：待答問題／待批准呼叫／回合完成（agent 已回覆完）
 * stalled   = 步驟開了但檔案 3–30 分鐘沒動靜
 * idle      = 其餘
 */
function decide(sig, nowMs) {
  const age = (nowMs - sig.lastAct) / 1000;
  if (sig.waitingYou && age < WAIT_MAX_SEC) return 'waitingYou';
  if (sig.midTurn) {
    if (age <= WORK_FRESH_SEC) return 'working';
    if (age < STALL_MAX_SEC) return 'stalled';
  }
  return 'idle';
}

/* ---------- DSH 解析 ---------- */
function parseDSH(file, st, nowMs) {
  const j = readJsonSafe(file);
  if (!j) return null;
  const rec = j.record || j;
  const rows = (rec && rec.rows) || {};
  const v = (k) => (rows[k] && rows[k].val);
  const stats = v('sessionStats') || {};
  const tb = v('turnBoundary') || {};
  const lastMsgT = (v('timeContext') || {}).lastMessageTime;
  const lastPromptT = (v('sessionListMetadata') || {}).lastPromptAt;
  const lastAct = Math.max(Number(lastMsgT || 0), Number(lastPromptT || 0), st.mtimeMs);
  const uq = (v('userQuestions') || {});
  const activeQ = (uq.questions && uq.questions.active) || uq.active || [];
  const pendingCalls = stats.pendingCalls || {};
  const pendingApprovals = Array.isArray(pendingCalls) ? pendingCalls.length : Object.keys(pendingCalls).length;
  const openStep = stats.openStep;
  const midTurn = (tb.lastStepBoundary && tb.lastStepBoundary.kind === 'start')
    || (!tb.lastStepBoundary && !!(openStep && openStep.startTime));
  const todosV = v('todos');
  const todos = Array.isArray(todosV) ? todosV : (todosV && todosV.todos) || [];
  const todosActive = todos.filter(t => t.status === 'in_progress').length;
  const modelSel = (v('modelSelection') || {}).lastUsed || {};
  const model = modelSel.model ? `${modelSel.provider || ''}/${modelSel.model}` : '';
  const goal = (v('goal') || {}).current || {};
  const sig = { lastAct, midTurn, waitingYou: activeQ.length > 0 || pendingApprovals > 0 };
  return {
    tool: 'DSH', id: path.basename(file, '.json'), lastAct,
    title: firstText((v('title') || ''), 80) || firstText(goal.objective, 80) || '（無標題）',
    cwd: (v('workingDirectory') && typeof v('workingDirectory') === 'string' ? v('workingDirectory') : rec.identity && rec.identity.cwd) || '',
    state: decide(sig, nowMs),
    detail: {
      model, turns: stats.turns || 0, todosActive,
      pendingQuestions: activeQ.length, pendingApprovals,
      goalPhase: goal.phase || '', lastReply: '',
    },
  };
}

/* ---------- Claude Code 解析 ---------- */
function ccDirToPath(d) {           // 'C--Users-chanh-Desktop-X-main' → 'C:\Users\chanh\Desktop\X-main'
  const m = /^([A-Za-z])--(.*)$/.exec(d || '');
  return m ? `${m[1]}:\\${m[2].replace(/-/g, '\\')}` : (d || '');
}
function parseCC(file, st, nowMs) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }
  let lastKind = '', customTitle = '', aiTitle = '', firstUser = '';
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const t = o.type;
    if (t === 'custom-title') customTitle = o.customTitle || o.title || customTitle;
    else if (t === 'ai-title') aiTitle = o.aiTitle || o.title || aiTitle;
    else if (t === 'user' && o.message) {
      const c = o.message.content;
      if (typeof c === 'string') {
        lastKind = 'user-real';
        if (!firstUser && c.trim() && !c.trim().startsWith('<')) firstUser = c.trim();
      } else if (Array.isArray(c)) {
        const hasTR = c.some(b => b.type === 'tool_result');
        const txt = c.filter(b => b.type === 'text').map(b => b.text || '').join(' ').trim();
        lastKind = hasTR ? 'user-tool' : 'user-real';
        if (!firstUser && txt && !txt.startsWith('<')) firstUser = txt;
      }
    } else if (t === 'assistant' && o.message) {
      const c = o.message.content;
      const hasText = typeof c === 'string' ? !!c.trim() : Array.isArray(c) && c.some(b => b.type === 'text' && (b.text || '').trim());
      if (hasText || Array.isArray(c) && c.some(b => b.type === 'tool_use')) lastKind = 'assistant';
    }
  }
  if (!lastKind) return null;
  const title = customTitle || aiTitle || firstUser || '（無標題）';
  const cwd = ccDirToPath(path.basename(path.dirname(file)));
  const sig = {
    lastAct: st.mtimeMs,
    midTurn: lastKind !== 'assistant',        // 最後是真實 prompt 或 tool_result → agent 還沒回完
    waitingYou: lastKind === 'assistant',
  };
  return {
    tool: 'CC', id: path.basename(file, '.jsonl'), lastAct: sig.lastAct,
    title: firstText(title, 80),
    cwd,
    state: decide(sig, nowMs),
    detail: { model: '', turns: 0, todosActive: 0, pendingQuestions: 0, pendingApprovals: 0, goalPhase: '', lastReply: '' },
  };
}

/* ---------- Codex 解析 ---------- */
function parseCodex(file, st, nowMs) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }
  let cwd = '', firstUser = '', lastEvType = '', lastEvTs = 0, lastReply = '';
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type === 'session_meta' && o.payload && o.payload.cwd) cwd = o.payload.cwd;
    if (o.type === 'response_item' && o.payload && o.payload.type === 'message' && o.payload.role === 'user' && !firstUser) {
      const parts = (o.payload.content || []).map(p => p.text || '').join(' ').trim();
      if (parts && !parts.startsWith('<') && !parts.startsWith('# User Instructions') && !parts.startsWith('user_instructions')) firstUser = parts;
    }
    if (o.type === 'event_msg' && o.payload) {
      const pt = o.payload.type;
      if (pt === 'task_started') lastEvType = 'task_started';
      else if (pt === 'task_complete') { lastEvType = 'task_complete'; lastReply = o.payload.last_agent_message || lastReply; }
      else if (pt === 'item_completed') lastEvType = lastEvType === 'task_complete' ? lastEvType : 'item_completed';
      if (o.timestamp) { const ts = Date.parse(o.timestamp); if (ts) lastEvTs = ts; }
    }
  }
  if (!lastEvType) return null;
  const lastAct = Math.max(st.mtimeMs, lastEvTs || 0);
  const sig = {
    lastAct,
    midTurn: lastEvType === 'task_started' || lastEvType === 'item_completed',
    waitingYou: lastEvType === 'task_complete',
  };
  return {
    tool: 'Codex', id: path.basename(file, '.jsonl'), lastAct,
    title: firstText(firstUser, 80) || '（無標題）',
    cwd,
    state: decide(sig, nowMs),
    detail: { model: '', turns: 0, todosActive: 0, pendingQuestions: 0, pendingApprovals: 0, goalPhase: '', lastReply: firstText(lastReply, 160) },
  };
}

/* ---------- 掃描器（含 mtime+size 快取） ---------- */
const cache = new Map(); // file → {mtimeMs, size, parsed}
function cached(file, st, parseFn, nowMs) {
  const c = cache.get(file);
  if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return c.parsed;
  const parsed = parseFn(file, st, nowMs);
  cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, parsed });
  return parsed;
}
let lastScanResult = { now: 0, sessions: [], archived: { DSH: 0, CC: 0, Codex: 0 } };
let scanning = false;

function scan() {
  if (scanning) return;
  scanning = true;
  try {
    const nowMs = Date.now();
    const windowStart = nowMs - WINDOW_DAYS * 86400 * 1000;
    const sessions = [];
    const archived = { DSH: 0, CC: 0, Codex: 0 };

    for (const f of walkFiles(DIRS.DSH, n => n.startsWith('session-') && n.endsWith('.json'))) {
      let st; try { st = fs.statSync(f); } catch { continue; }
      const s = cached(f, st, parseDSH, nowMs);
      if (s) sessions.push(s); else archived.DSH++;
    }
    for (const f of walkFiles(DIRS.CC, n => n.endsWith('.jsonl'))) {
      let st; try { st = fs.statSync(f); } catch { continue; }
      const s = cached(f, st, parseCC, nowMs);
      if (s) sessions.push(s); else archived.CC++;
    }
    let codexTotal = 0, codexParsed = 0;
    for (const f of walkFiles(DIRS.Codex, n => n.startsWith('rollout-') && n.endsWith('.jsonl'))) {
      codexTotal++;
      let st; try { st = fs.statSync(f); } catch { continue; }
      if (st.mtimeMs < windowStart) continue;             // 舊檔只計數，不解析
      const s = cached(f, st, parseCodex, nowMs);
      if (s) { sessions.push(s); codexParsed++; }
    }
    archived.Codex = Math.max(0, codexTotal - codexParsed);

    sessions.sort((a, b) =>
      (RANK[a.state] - RANK[b.state]) || ((b.lastAct || 0) - (a.lastAct || 0)));

    lastScanResult = { now: nowMs, sessions, archived };
  } finally { scanning = false; }
}
const RANK = { waitingYou: 0, working: 1, stalled: 2, idle: 3 };

/* ---------- HTTP ---------- */
const HTML = `<!doctype html>
<html lang="zh-Hant"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MaxAgent 多工具看板</title>
<style>
  :root{--bg:#0f1115;--card:#171a21;--line:#262b36;--tx:#e7eaf0;--dim:#8b93a3;
    --dsh:#a78bfa;--codex:#fb923c;--cc:#60a5fa;
    --work:#34d399;--wait:#fbbf24;--stall:#f87171;--idle:#6b7280}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);
    font-family:"Microsoft JhengHei","PingFang TC",system-ui,sans-serif}
  header{display:flex;align-items:center;gap:16px;flex-wrap:wrap;
    padding:14px 22px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:5}
  h1{font-size:18px;margin:0;font-weight:700}
  .chips{display:flex;gap:8px;flex-wrap:wrap}
  .chip{padding:4px 10px;border-radius:99px;border:1px solid var(--line);font-size:12px;cursor:pointer;user-select:none}
  .chip.on{border-color:var(--tx);background:#222733}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:1px}
  .meta{margin-left:auto;font-size:12px;color:var(--dim);display:flex;gap:12px;align-items:center}
  button.ghost{background:none;border:1px solid var(--line);color:var(--dim);border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer}
  button.ghost.on{color:var(--tx);border-color:var(--dim)}
  main{padding:18px 22px;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;position:relative;cursor:pointer}
  .card:hover{border-color:var(--dim)}
  .card.waitingYou{border-color:#8a6d1f}
  .card.stalled{border-color:#7a3030}
  .top{display:flex;gap:8px;align-items:center;margin-bottom:8px}
  .tool{font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;color:#0f1115}
  .tool.DSH{background:var(--dsh)}.tool.Codex{background:var(--codex)}.tool.CC{background:var(--cc)}
  .st{font-size:12px;color:var(--dim)}
  .title{font-size:14px;font-weight:600;line-height:1.4;margin-bottom:6px;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .proj{font-size:12px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .reply{font-size:12px;color:var(--dim);margin-top:6px;line-height:1.4;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .foot{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:11px;color:var(--dim)}
  .tag{border:1px solid var(--line);border-radius:6px;padding:1px 7px}
  .ago{margin-left:auto}
  .empty{grid-column:1/-1;text-align:center;color:var(--dim);padding:40px 0}
  #toast{position:fixed;right:18px;bottom:18px;background:#1e2230;border:1px solid #39405a;color:#e6e9f5;padding:10px 14px;border-radius:10px;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none;z-index:9}
  #toast.show{opacity:1}
</style></head><body>
<div id="toast"></div>
<header>
  <h1>🛰️ MaxAgent 多工具看板</h1>
  <div class="chips" id="filters">
    <span class="chip on" data-f="all">全部</span>
    <span class="chip" data-f="working"><span class="dot" style="background:var(--work)"></span>工作中</span>
    <span class="chip" data-f="waitingYou"><span class="dot" style="background:var(--wait)"></span>等你</span>
    <span class="chip" data-f="stalled"><span class="dot" style="background:var(--stall)"></span>卡死</span>
    <span class="chip" data-f="idle"><span class="dot" style="background:var(--idle)"></span>閒置</span>
    <span class="chip" data-f="DSH" style="color:var(--dsh)">DSH</span>
    <span class="chip" data-f="Codex" style="color:var(--codex)">Codex</span>
    <span class="chip" data-f="CC" style="color:var(--cc)">Claude&nbsp;Code</span>
  </div>
  <div class="meta">
    <span id="counts"></span><span id="scanAt"></span><span style="color:var(--dim)">v1.4</span>
    <button class="ghost" id="notifyBtn">🔔 開啟通知</button>
  </div>
</header>
<main id="grid"><div class="empty">載入中…</div></main>
<script>
(function(){
  var filter='all', prev={}, notified=('Notification' in window && Notification.permission==='granted');
  var toastEl=document.getElementById('toast'),toastTimer=null;
  function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){toastEl.classList.remove('show')},2800)}
  var ST={working:'工作中',waitingYou:'等你處理',stalled:'疑似卡死',idle:'閒置'};
  var SC={working:'var(--work)',waitingYou:'var(--wait)',stalled:'var(--stall)',idle:'var(--idle)'};
  function esc(s){return (s||'').replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function ago(ms){var d=Date.now()-ms;if(d<60e3)return Math.max(1,Math.floor(d/1e3))+'秒前';
    if(d<3600e3)return Math.floor(d/60e3)+'分鐘前';if(d<86400e3)return Math.floor(d/3600e3)+'小時前';
    return Math.floor(d/86400e3)+'天前'}
  function card(s){
    var d=s.detail||{},proj=s.cwd?esc(s.cwd.split('\\\\').pop()||s.cwd):'';
    var tags='';
    if(d.model)tags+='<span class="tag">'+esc(d.model)+'</span>';
    if(d.turns)tags+='<span class="tag">'+d.turns+' 輪</span>';
    if(d.todosActive)tags+='<span class="tag">todo '+d.todosActive+'</span>';
    if(d.pendingQuestions)tags+='<span class="tag" style="color:var(--wait)">提問 '+d.pendingQuestions+'</span>';
    if(d.pendingApprovals)tags+='<span class="tag" style="color:var(--wait)">待批准 '+d.pendingApprovals+'</span>';
    if(d.goalPhase==='running')tags+='<span class="tag">目標進行中</span>';
    var reply=d.lastReply?'<div class="reply">💬 '+esc(d.lastReply)+'</div>':'';
    return '<div class="card '+s.state+'" data-id="'+esc(s.id)+'" data-tool="'+s.tool+'">'
      +'<div class="top"><span class="tool '+s.tool+'">'+s.tool+'</span>'
      +'<span class="st"><span class="dot" style="background:'+SC[s.state]+'"></span>'+ST[s.state]+'</span></div>'
      +'<div class="title">'+esc(s.title)+'</div>'
      +'<div class="proj" title="'+esc(s.cwd)+'">'+proj+'</div>'+reply
      +'<div class="foot">'+tags+'<span class="ago">'+ago(s.lastAct)+'</span></div></div>';
  }
  function render(j){
    var list=j.sessions||[];
    var c={working:0,waitingYou:0,stalled:0,idle:0};
    list.forEach(function(s){c[s.state]++});
    document.getElementById('counts').innerHTML=
      '<span style="color:var(--work)">做'+c.working+'</span> · '
      +'<span style="color:var(--wait)">等'+c.waitingYou+'</span> · '
      +'<span style="color:var(--stall)">卡'+c.stalled+'</span> · 閒'+c.idle
      +(j.archived?' <span style="color:var(--dim)">(已歸檔 '+(j.archived.Codex+j.archived.CC+j.archived.DSH)+')</span>':'');
    document.getElementById('scanAt').textContent='掃描 '+new Date(j.now).toLocaleTimeString('zh-TW');
    var show=list.filter(function(s){return filter==='all'||s.state===filter||s.tool===filter});
    document.getElementById('grid').innerHTML=show.length?show.map(card).join(''):
      '<div class="empty">沒有符合的 session</div>';
    // 通知：狀態轉入「等你」時
    list.forEach(function(s){
      if(prev[s.id]&&prev[s.id]!==s.state&&s.state==='waitingYou'&&notified){
        try{new Notification('Agent 等你：'+s.tool,{body:s.title})}catch(e){}
      }
      prev[s.id]=s.state;
    });
  }
  function tick(){fetch('/api/sessions').then(function(r){return r.json()}).then(render).catch(function(){})}
  document.getElementById('filters').addEventListener('click',function(e){
    var t=e.target.closest('.chip');if(!t)return;
    filter=t.getAttribute('data-f');
    document.querySelectorAll('.chip').forEach(function(x){x.classList.remove('on')});
    t.classList.add('on');tick();
  });
  document.getElementById('notifyBtn').addEventListener('click',function(){
    if(!('Notification' in window))return alert('此瀏覽器不支援通知');
    Notification.requestPermission().then(function(p){notified=(p==='granted')});
  });
  tick();setInterval(tick,5000);
})();
</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/api/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    // 補上 lastAct（在 parse 內以 decide.lastAct 傳遞）
    const out = lastScanResult.sessions.map(({ detail, ...session }) => { const { lastReply, ...summary } = detail || {}; return { ...session, detail: summary }; });
    res.end(JSON.stringify({ now: lastScanResult.now, sessions: out, archived: lastScanResult.archived }));
  } else if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(HTML);
  } else {
    res.writeHead(404); res.end('not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[MaxAgent] http://${HOST}:${PORT}`);
  scan();
  setInterval(scan, SCAN_MS);
});
