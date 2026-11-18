'use strict';
const fs=require('node:fs'),path=require('node:path');
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function readDesktopModel(id,{roots}={}){
 if(!uuid.test(id||''))return {status:'invalid'};
 roots??=process.env.LOCALAPPDATA?['Claude-3p','Claude'].map(x=>path.join(process.env.LOCALAPPDATA,x,'claude-code-sessions')):[];
 const found=[];let failed=false;
 for(const root of roots){let orgs;try{orgs=fs.readdirSync(root,{withFileTypes:true})}catch(e){if(e.code!=='ENOENT')failed=true;continue}
  for(const org of orgs){if(!org.isDirectory())continue;const orgPath=path.join(root,org.name);let accounts;try{accounts=fs.readdirSync(orgPath,{withFileTypes:true})}catch{failed=true;continue}
   for(const account of accounts){if(!account.isDirectory())continue;const dir=path.join(orgPath,account.name);let files;try{files=fs.readdirSync(dir,{withFileTypes:true})}catch{failed=true;continue}
    for(const file of files){if(!file.isFile()||!/^local_[0-9a-f-]{36}\.json$/i.test(file.name))continue;try{const p=path.join(dir,file.name);if(fs.statSync(p).size>1048576){failed=true;continue}const d=JSON.parse(fs.readFileSync(p,'utf8'));if(d.cliSessionId!==id)continue;if(d.sessionId!==path.basename(file.name,'.json')){failed=true;continue}found.push({host:d.sessionId,model:typeof d.model==='string'?d.model:null})}catch{failed=true}}
   }
  }
 }
 if(failed)return {status:'unavailable'};if(found.length>1)return {status:'ambiguous'};if(!found.length)return {status:'absent'};return found[0].model?{status:'ok',...found[0]}:{status:'unavailable'};
}
function resolveDesktopModel(model,models){if(typeof model!=='string'||!Array.isArray(models))return null;const matches=models.filter(x=>x.id===model||['haiku','sonnet','opus'].includes(model.toLowerCase())&&x.label?.toLowerCase().startsWith(model.toLowerCase()+'（'));return matches.length===1?matches[0]:null}
module.exports={readDesktopModel,resolveDesktopModel};
