const {test}=require('node:test'),assert=require('node:assert/strict');
const {claudeMappingModels,validateClaudeSelection}=require('./model-settings');const {claudeArgs}=require('./harness');
test('Claude 使用實際設定值作選項，並保持前綴',()=>{const models=claudeMappingModels({ANTHROPIC_DEFAULT_SONNET_MODEL:'ccs-test-a',ANTHROPIC_DEFAULT_OPUS_MODEL:'opus-proxy'});assert.deepEqual(models.map(x=>x.id),['ccs-test-a','opus-proxy']);assert.deepEqual(models[0].efforts,[]);assert.deepEqual(validateClaudeSelection({model:'ccs-test-a'},models,'a','a'),{model:'ccs-test-a'});const args=claudeArgs('original-id','本機替身',{model:'ccs-test-a'});assert.equal(args[args.indexOf('--resume')+1],'original-id');assert.equal(args[args.indexOf('--model')+1],'ccs-test-a');assert(args.indexOf('--model')<args.indexOf('--'))});
test('切換供應商、缺少來源及無效選項均不能派工',()=>{const models=claudeMappingModels({ANTHROPIC_DEFAULT_OPUS_MODEL:'opus-proxy'});assert.throws(()=>validateClaudeSelection({model:'opus-proxy'},models,'old','new'),/連線|供應商/);assert.throws(()=>validateClaudeSelection({model:'missing'},models,'a','a'),/不可用/);assert.throws(()=>validateClaudeSelection({model:'opus-proxy'},models,null,null),/連線|供應商/);assert.deepEqual(validateClaudeSelection({},[],null,null),{})});

test('CC Switch 切換供應商時，重新讀取名稱與上游模型，同時拒絕舊選擇',t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const {DatabaseSync}=require('node:sqlite'),{claudeModels}=require('./model-settings');
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'maxagent-claude-route-'));
 t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 for(const dir of ['.claude','.cc-switch'])fs.mkdirSync(path.join(home,dir));
 const live={env:{ANTHROPIC_BASE_URL:'http://127.0.0.1:19521',ANTHROPIC_DEFAULT_SONNET_MODEL:'claude-sonnet-test[1M]'}};
 const write=()=>fs.writeFileSync(path.join(home,'.claude','settings.json'),JSON.stringify(live));
 write();
 const db=new DatabaseSync(path.join(home,'.cc-switch','cc-switch.db'));
 try{
  db.exec(`CREATE TABLE proxy_config(app_type,listen_address,listen_port,enabled,auto_failover_enabled);
    INSERT INTO proxy_config VALUES('claude','127.0.0.1',19521,1,0);
    CREATE TABLE providers(id,name,settings_config,app_type,is_current);`);
  const insert=db.prepare("INSERT INTO providers VALUES(?,?,?,'claude',?)");
  insert.run('first','Kimi',JSON.stringify({env:{ANTHROPIC_DEFAULT_SONNET_MODEL:'kimi-test'}}),1);
  insert.run('second','GLM',JSON.stringify({env:{ANTHROPIC_DEFAULT_SONNET_MODEL:'glm-test [1M]',ANTHROPIC_AUTH_TOKEN:'fixture-secret'}}),0);
  const route=id=>fs.writeFileSync(path.join(home,'.cc-switch','live-state.json'),JSON.stringify({version:1,apps:{claude:{mode:'proxy',attached:true,proxy_route:id}}}));
  route('first');
  const read=()=>claudeModels(home,{home,processEnv:{}});
  const first=read();
  assert.equal(first.provider,'Kimi');
  assert.equal(first.models[0].upstreamModel,'kimi-test');
  assert.equal(first.defaultModel,null);
  route('second'); // 代理路由切換時，舊直連欄位可能不變。
  const second=read();
  assert.equal(second.provider,'GLM');
  assert.equal(second.models[0].id,first.models[0].id);
  assert.equal(second.models[0].upstreamModel,'glm-test');
  assert(!JSON.stringify(second).includes('fixture-secret'));
  assert.throws(()=>validateClaudeSelection({model:first.models[0].id},second.models,first.context,second.context),/供應商/);
  route('missing');assert.equal(read().provider,null);assert.equal(read().models.length,0);
  fs.writeFileSync(path.join(home,'.cc-switch','live-state.json'),JSON.stringify({version:1,apps:{claude:{mode:'proxy',attached:false,proxy_route:'second'}}}));assert.equal(read().models.length,0);
  fs.writeFileSync(path.join(home,'.cc-switch','live-state.json'),'{');assert.equal(read().models.length,0);
  route('second');
  live.model='sonnet';write();
  assert.deepEqual(read().defaultModel,{id:'sonnet',upstreamModel:'glm-test'});
  db.exec('UPDATE proxy_config SET auto_failover_enabled=1');
  assert.equal(read().provider,null);
  assert.equal(read().defaultModel,null);
 }finally{db.close()}
});
