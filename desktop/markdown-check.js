'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'maxagent-markdown-')));
const sample = [
 '# Markdown 標題', '', '- **粗體**與`行內程式碼`', '- [x] 已完成', '',
 '| 項目 | 數量 |', '| --- | ---: |', '| 範例 | 2 |', '',
 '```html', '<span>literal</span>', 'X'.repeat(180), '```', '',
 '<div data-test="raw">純文字 HTML</div>', '',
 '[範例連結](https://example.invalid/) ![本機替身](https://example.invalid/image.png)'
].join('\n');
const key = 'codex:markdown-fixture';
const handlers = {
 list: () => [{ key, tool: 'codex', title: '本機 Markdown 檢查', cwd: '' }],
 history: () => ({ messages: [{ role: 'user', text: '**使用者原文**' }, { role: 'assistant', text: sample }] }),
 getPreferences: () => ({ theme: 'dark', windowsNotifications: false }),
 getChatModel: () => ({ selection: {}, models: [], reason: '' })
};

app.whenReady().then(async () => {
 for (const [name, fn] of Object.entries(handlers)) ipcMain.handle('agent:' + name, fn);
 const win = new BrowserWindow({ width: 670, height: 550, show: false, webPreferences: {
  preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false
 } });
 await win.loadFile(path.join(__dirname, 'index.html'));
 const run = (code) => win.webContents.executeJavaScript(code);
 for (let i = 0; i < 40 && !(await run("!!document.querySelector('.chat-card')")); i++) await new Promise(r => setTimeout(r, 50));
 await run("document.querySelector('.chat-card').click()");
 for (let i = 0; i < 40 && !(await run("!!document.querySelector('.message.assistant')")); i++) await new Promise(r => setTimeout(r, 50));
 const result = await run(`(() => {
  const reply = document.querySelector('.message.assistant .markdown-body');
  const history = document.querySelector('#history');
  const code = reply.querySelector('pre');
  return {
   heading: reply.querySelector('h1').textContent,
   bold: reply.querySelector('strong').textContent,
   checked: reply.querySelector('li input').checked && reply.querySelector('li input').disabled,
   table: reply.querySelector('tbody td').textContent,
   code: code.textContent.startsWith('<span>literal</span>') && code.scrollWidth > code.clientWidth,
   literal: reply.textContent.includes('<div data-test="raw">') && !reply.querySelector('[data-test="raw"]'),
   inert: !reply.querySelector('img,a') && reply.textContent.includes('範例連結') && reply.textContent.includes('[圖片：本機替身]'),
   user: document.querySelector('.message.user div').textContent,
   fits: history.scrollWidth <= history.clientWidth
  };
 })()`);
 assert.deepEqual(result, { heading: 'Markdown 標題', bold: '粗體', checked: true, table: '範例', code: true, literal: true, inert: true, user: '**使用者原文**', fits: true });
 console.log('Markdown history, plain user text and inert HTML/images/links: passed');
 app.exit(0);
}).catch((error) => { console.error(error); app.exit(1); });
