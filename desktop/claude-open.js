const {spawn}=require('node:child_process');
const path=require('node:path');

function openClaudeChat(session,exe){
 if(process.platform!=='win32'||session?.tool!=='claude'||typeof session.id!=='string'||!(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i).test(session.id)||typeof session.cwd!=='string'||!path.isAbsolute(session.cwd))return Promise.resolve(false);
 if(typeof exe!=='string'||(exe!=='claude.exe'&&(!path.isAbsolute(exe)||path.extname(exe).toLowerCase()!=='.exe')))return Promise.resolve(false);
 return new Promise(resolve=>{
  let child;
  // The helper hands off the exact conversation to Claude Desktop without a terminal or a prompt.
  try{child=spawn(exe,['--desktop','--resume',session.id],{
   cwd:session.cwd,stdio:'ignore',windowsHide:true
  })}catch{return resolve(false)}
  child.once('error',()=>resolve(false));
  child.once('exit',code=>resolve(code===0));
 });
}
module.exports={openClaudeChat};
