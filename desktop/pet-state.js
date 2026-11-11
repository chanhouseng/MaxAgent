function projectPetState(sessions,jobs,completed=[]){
 const running=[],recent=completed.map(x=>({...x}));
 for(const [key,job] of jobs){
  if(!['running','confirming'].includes(job.status))continue;
  const session=sessions.get(key);if(!session)continue;
  const item={key,tool:session.tool,title:session.title||'未命名對話',status:job.status,time:job.time||0};
  running.push(item);
 }
 running.sort((a,b)=>b.time-a.time);recent.sort((a,b)=>b.time-a.time);
 return {running,recent:recent.slice(0,5)};
}
module.exports={projectPetState};
