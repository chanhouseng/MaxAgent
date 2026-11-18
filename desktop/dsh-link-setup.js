'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {execFileSync}=require('node:child_process');
const {configFile,createClient}=require('./dsh-link');
const begin='# MaxAgent DSH link: begin',end='# MaxAgent DSH link: end';
function changePatch(input,enable,host,pairing){
 const text=input.replace(/^\uFEFF/,'');
 const a=text.indexOf(begin),b=text.indexOf(end);
 if((a<0)!==(b<0)||a>=0&&(b<a||text.indexOf(begin,a+1)>=0||text.indexOf(end,b+1)>=0||a>0&&text[a-1]!=='\n'))throw Error('DSH 設定內的 MaxAgent 區塊不完整，沒有改動。');
 const eol=text.includes('\r\n')?'\r\n':'\n';
 const lines=[begin,'- insert:','    - id: maxagent-local-dispatch','      name: '+JSON.stringify(pathToFileURL(host).href),'      config:','        pairingFile: '+JSON.stringify(pairing),end,''];
 const block=lines.join(eol);
 if(a>=0){
  const tail=b+end.length+(text.startsWith(eol,b+end.length)?eol.length:0);
  const existing=text.slice(a,tail).trimEnd().split(eol);
  let oldSource;try{oldSource=new URL(JSON.parse(existing[3].slice('      name: '.length)))}catch{}
  const owned=existing.length===7&&existing.every((line,i)=>i===3?line.startsWith('      name: ')&&oldSource?.protocol==='file:'&&oldSource.pathname.endsWith('/desktop/dsh-host.mjs'):line===lines[i]);
  if(!owned)throw Error('MaxAgent 的 DSH 設定曾被修改，請先核對設定檔。');
  return (input.startsWith('\uFEFF')?'\uFEFF':'')+text.slice(0,a)+(enable?block:'')+text.slice(tail);
 }
 if(!enable)return input;
 if(text.includes('maxagent-local-dispatch')||text.split(/\r?\n/).some(l=>/^[^\s#]/.test(l)&&!/^-(?:\s|$)/.test(l)))throw Error('DSH 設定格式不符合預期，沒有改動。');
 return input+(input&&!input.endsWith('\n')?eol:'')+block;
}
function replace(file,previous,next){
 if(previous===next)return;
 const scratch=file+'.maxagent-'+crypto.randomUUID()+'.tmp';
 fs.writeFileSync(scratch,next,{flag:'wx',mode:0o600});
 try{
  if(fs.readFileSync(file,'utf8')!==previous)throw Error('DSH 正在更新設定，請稍後再試。');
  fs.renameSync(scratch,file);
 }finally{if(fs.existsSync(scratch))fs.unlinkSync(scratch)}
}
function createPairing(file){
 const sid=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).match(/S-1-(?:\d+-)+\d+/)?.[0];
 if(!sid)throw Error('無法確認 Windows 使用者，未建立 DSH 配對。');
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const scratch=file+'.'+crypto.randomUUID()+'.tmp';
 fs.writeFileSync(scratch,'',{flag:'wx',mode:0o600});
 try{
  execFileSync('icacls.exe',[scratch,'/inheritance:r','/grant:r','*'+sid+':(F)'],{windowsHide:true,stdio:'ignore'});
  fs.writeFileSync(scratch,JSON.stringify({key:crypto.randomBytes(32).toString('hex'),socket:crypto.randomBytes(16).toString('hex')}),'utf8');
  // Avoid replacing a pairing initiated by another running MaxAgent.
  fs.linkSync(scratch,file);
 }finally{fs.unlinkSync(scratch)}
}
async function configure(enable,{host=path.join(__dirname,'dsh-host.mjs'),file=configFile(),home=process.env.DSH_HOME||path.join(os.homedir(),'.dsh')}={}){
 if(process.platform!=='win32')throw Error('目前僅支援 Windows 上的 DSH 桌面配對。');
 if(typeof enable!=='boolean')throw Error('無效的 DSH 配對選擇。');
 const profile=path.join(home,'profiles','desktop'),patch=path.join(profile,'cordis.patch.yml');
 if(!fs.existsSync(path.join(profile,'package.json'))||!fs.existsSync(patch))throw Error('找不到 DSH 桌面設定。請先安裝並開啟 DeepSeek Harness Desktop。');
 const installed=path.join(path.dirname(file),'dsh-bridge','desktop','dsh-host.mjs');
 const previous=fs.readFileSync(patch,'utf8'),next=changePatch(previous,enable,installed,file);
 if(!enable){
  if(fs.existsSync(file))fs.unlinkSync(file); // Revokes future requests even before DSH restarts.
  replace(patch,previous,next);
  return;
 }
 if(!fs.existsSync(host))throw Error('缺少 MaxAgent DSH 擴充檔。');
 let created=false;
 try{
  // Use a stable user-local path so moving the MaxAgent folder cannot break DSH startup.
  fs.mkdirSync(path.dirname(installed),{recursive:true});
  for(const [source,target] of [[host,installed],[path.join(path.dirname(host),'dsh-link.js'),path.join(path.dirname(installed),'dsh-link.js')]]){
   fs.copyFileSync(source,target);
  }
  if(!fs.existsSync(file)){createPairing(file);created=true}
  if(!createClient(file).configured())throw Error('DSH 本機配對設定損壞；請先移除配對再啟用。');
  replace(patch,previous,next);
 }catch(e){if(created)fs.unlinkSync(file);throw e}
}
module.exports={configure,changePatch};
