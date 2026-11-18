'use strict';
// Explicit application allowlist: never traverse the project or user data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
if(process.platform!=='win32')throw Error('Windows x64 packaging requires Windows.');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json'),lock=require('../package-lock.json');
const electron=path.join(root,'node_modules','electron','dist'),installed=fs.readFileSync(path.join(electron,'version'),'utf8').trim();
if(installed!==pkg.devDependencies.electron||installed!==lock.packages['node_modules/electron'].version)throw Error('Installed Electron does not match the lockfile.');
const exe=fs.readFileSync(path.join(electron,'electron.exe'));if(exe.readUInt16LE(exe.readUInt32LE(0x3c)+4)!==0x8664)throw Error('Electron is not Windows x64.');
const appFiles=['desktop/main.js','desktop/preload.js','desktop/renderer.js','desktop/controller.js','desktop/workspace.js','desktop/harness.js','desktop/session-summary.js','desktop/history-pages.js','desktop/codex-stop-hook.ps1','desktop/codex-hook-settings.js','desktop/codex-watch.js','desktop/codex-cli.js','desktop/codex-queue.js','desktop/codex-desktop.js','desktop/codex-error.js','desktop/result-evidence.js','desktop/pet-state.js','desktop/pet-preload.js','desktop/pet.js','desktop/pet.html','desktop/pet.css','desktop/claude-pet-events.js','desktop/claude-pet-pipe.js','desktop/claude-pet-hook.ps1','desktop/claude-hook-settings.js','desktop/dispatch-store.js','desktop/windows-shortcut.js','desktop/refresh-gate.js','desktop/model-settings.js','desktop/claude-desktop-model.js','desktop/claude-peer.js','desktop/notifications.js','desktop/markdown.js','desktop/index.html','desktop/style.css','desktop/adapters/dsh.js','desktop/dsh-link.js','desktop/dsh-link-setup.js','desktop/dsh-host.mjs','desktop/adapters/opencode.js','desktop/i18n.js','desktop/i18n-messages.js','desktop/claude-open.js','node_modules/marked/lib/marked.umd.js','node_modules/marked/LICENSE'];
const runtimeFiles=['chrome_100_percent.pak','chrome_200_percent.pak','d3dcompiler_47.dll','dxcompiler.dll','electron_wer.dll','ffmpeg.dll','icudtl.dat','LICENSE','LICENSES.chromium.html','resources.pak','snapshot_blob.bin','v8_context_snapshot.bin','vk_swiftshader_icd.json','vk_swiftshader.dll','vulkan-1.dll','version'];
const dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});const tempBase=fs.mkdtempSync(path.join(os.tmpdir(),'maxagent-package-')),stage=path.join(tempBase,'stage');fs.mkdirSync(stage);
const zip=path.join(dist,`MaxAgent-${pkg.version}-windows-x64-preview.zip`),temporaryZip=path.join(tempBase,'package.zip');
function copy(source,dest){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest)}
try{
 copy(path.join(electron,'electron.exe'),path.join(stage,'MaxAgent.exe'));
 for(const f of runtimeFiles)copy(path.join(electron,f),path.join(stage,f));
 const locales=fs.readdirSync(path.join(electron,'locales'),{withFileTypes:true});if(locales.some(e=>!e.isFile()||!e.name.endsWith('.pak')))throw Error('Unexpected Electron locale contents.');for(const f of locales)copy(path.join(electron,'locales',f.name),path.join(stage,'locales',f.name));
 const app=path.join(stage,'resources','app');
 for(const f of appFiles){const source=path.join(root,...f.split('/'));const data=fs.readFileSync(source);if(data.toString('utf8').toLowerCase().includes(root.toLowerCase())||/c:[\\/]+users[\\/]+chanh/i.test(data.toString('utf8')))throw Error('Development absolute path found in '+f);copy(source,path.join(app,...f.split('/')))}
 fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'maxagent',productName:'MaxAgent',version:pkg.version,main:'desktop/main.js'},null,2));
 copy(path.join(root,'docs','試用說明.txt'),path.join(stage,'試用說明.txt'));
 const tar=path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe');
 execFileSync(tar,['-a','-cf',temporaryZip,'-C',stage,'.'],{stdio:'inherit'});
 const listing=execFileSync(tar,['-tf',temporaryZip],{encoding:'utf8',maxBuffer:1024*1024}).split(/\r?\n/).filter(Boolean);const appEntries=listing.filter(x=>/^\.\/resources\/app\//.test(x)&&!x.endsWith('/')).map(x=>x.slice('./resources/app/'.length)).sort();
 const expected=[...appFiles,'package.json'].sort();if(JSON.stringify(appEntries)!==JSON.stringify(expected))throw Error('ZIP application files do not match the allowlist.');
 fs.copyFileSync(temporaryZip,zip);const hash=crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');fs.writeFileSync(zip+'.sha256',hash+'  '+path.basename(zip)+'\n');
 console.log('Application files:\n'+appEntries.join('\n'));console.log('ZIP: '+zip+'\nSHA-256: '+hash);
}finally{if(path.dirname(tempBase)===os.tmpdir()&&path.basename(tempBase).startsWith('maxagent-package-'))fs.rmSync(tempBase,{recursive:true,force:true})}
