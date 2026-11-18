(function(root){
 const locales=['zh-Hant','zh-Hans','en','pt'];
 let language='zh-Hant';
 const messages=new Map();
 function add(rows){for(const [key,...values] of rows)messages.set(key,values)}
 function setLanguage(value){language=locales.includes(value)?value:'zh-Hant';return language}
 function t(key,vars={}){
  const translated=messages.get(key)?.[locales.indexOf(language)-1]||key;
  return translated.replace(/\{(\w+)\}/g,(match,name)=>Object.hasOwn(vars,name)?String(vars[name]):match);
 }
 function bindPage(doc){
  const entries=[];
  const walker=doc.createTreeWalker(doc.documentElement,4);
  while(walker.nextNode()){
   const node=walker.currentNode,raw=node.nodeValue,key=raw.trim();
   if(messages.has(key))entries.push(()=>{if(node.isConnected)node.nodeValue=raw.replace(key,()=>t(key))});
  }
  for(const node of doc.querySelectorAll('[aria-label],[placeholder]')){
   for(const attr of ['aria-label','placeholder']){
    const key=node.getAttribute(attr);
    if(messages.has(key))entries.push(()=>node.setAttribute(attr,t(key)));
   }
  }
  return value=>{doc.documentElement.lang=setLanguage(value);for(const apply of entries)apply()};
 }
 const api={locales,setLanguage,bindPage,t,add};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.MaxAgentI18n=api;
})(globalThis);
