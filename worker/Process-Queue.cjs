const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {openStore,stateDir}=require('./intake-store.cjs');
const {protect,unprotect}=require('./local-crypto.cjs');
const {TickTickClient}=require('./ticktick-client.cjs');
const {deliverRows:deliverQueuedRows}=require('./queue-delivery.cjs');
const {candidate,assessCandidate,namesDefault}=require('./candidates.cjs');
const {selectBatch}=require('./candidate-batch.cjs');
const {validateExtraction,reviewInvalidDeadlines}=require('./task-validation.cjs');
const {createQueueDiagnostics,describeQueueFailure,cleanQueue}=require('./queue-diagnostics.cjs');
function runExtraction(input,result,model='gpt-6-sol',effort='low',diagnostics){
 return new Promise((resolve,reject)=>{
  const {buildExtractionContract,decodeExtractionResult}=require('./extraction-contract.cjs');
  let contract;try{contract=buildExtractionContract(JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'')),JSON.parse(fs.readFileSync(path.join(__dirname,'task-schema.json'),'utf8').replace(/^\uFEFF/,'')));}catch{const e=new Error('extraction_input_invalid');e.modelCalled=false;reject(e);return;}
  const suffix=crypto.randomUUID(),directory=path.dirname(result),modelInput=path.join(directory,'model-input-'+suffix+'.json'),modelSchema=path.join(directory,'model-schema-'+suffix+'.json'),modelOutput=path.join(directory,'model-output-'+suffix+'.json');
  let stdout='',stderr='',settled=false,modelStarted=false,timer,child;
  const finish=(code)=>{if(settled)return;settled=true;clearTimeout(timer);let failure=code;
   if(!failure){try{const raw=JSON.parse(fs.readFileSync(modelOutput,'utf8').replace(/^\uFEFF/,''));fs.writeFileSync(result,JSON.stringify(decodeExtractionResult(raw,contract)),'utf8');}catch{failure='extraction_contract_invalid';}}
   for(const file of [modelInput,modelSchema,modelOutput]){try{if(fs.existsSync(file))fs.unlinkSync(file);}catch{failure=failure||'extraction_cleanup_failed';}}
   stdout='';stderr='';if(failure){const e=new Error(failure);e.modelCalled=modelStarted;reject(e);}else resolve();
  };
  try{fs.writeFileSync(modelInput,JSON.stringify(contract.modelInput),'utf8');fs.writeFileSync(modelSchema,JSON.stringify(contract.schema),'utf8');
   const env={...process.env};delete env.OPENAI_API_KEY;delete env.CODEX_API_KEY;
   child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',path.join(__dirname,'Extract-Tasks.ps1'),'-InputPath',modelInput,'-OutputPath',modelOutput,'-SchemaPath',modelSchema,'-Model',model,'-ReasoningEffort',effort],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});
  }catch{finish('extraction_unavailable');return;}
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',c=>{if(stdout.length<2*1024*1024)stdout+=c;if(/^TASKCAPTURE_MODEL_STARTED$/m.test(stdout)){modelStarted=true;if(diagnostics)diagnostics.modelCalled=true;}});
  child.stderr.on('data',c=>{if(stderr.length<2*1024*1024)stderr+=c;});
  timer=setTimeout(()=>{if(child?.pid)spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});child.kill();finish('extraction_timeout');},180000);
  child.on('error',()=>finish('extraction_unavailable'));
  child.on('close',code=>{if(settled)return;finish(code===0?null:require('./extraction-errors.cjs').classifyExtractionFailure(stderr,stdout));});
 });
}
async function processQueue(diagnostics=createQueueDiagnostics()){
 if(process.argv.includes('--dry-run')){console.log(JSON.stringify(require('./Queue-Dry-Run.cjs').inspectQueue()));return;}
 const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../config/ticktick-destination.json'),'utf8').replace(/^\uFEFF/,''));
 if(!config.project_id)throw new Error('TickTick destination is not configured');
 if(!process.argv.includes('--trial')&&!config.enabled)throw new Error('Automatic delivery is disabled');
 diagnostics.phase='processor_lock';
 const lockPath=path.join(stateDir,'processor.lock');fs.mkdirSync(stateDir,{recursive:true});
 try{fs.writeFileSync(lockPath,String(process.pid),{encoding:'utf8',flag:'wx'});}catch(error){
  if(error.code!=='EEXIST')throw error;
  const previousPid=Number(fs.readFileSync(lockPath,'utf8'));if(!Number.isInteger(previousPid)||previousPid<=0)throw new Error('Processor lock requires inspection');
  try{process.kill(previousPid,0);throw new Error('Processor is already running');}catch(check){if(check.code!=='ESRCH')throw check;}
  fs.unlinkSync(lockPath);fs.writeFileSync(lockPath,String(process.pid),{encoding:'utf8',flag:'wx'});
 }
 const tempDir=path.join(stateDir,'temporary',crypto.randomUUID());let store,client;
 try{
  diagnostics.phase='state_open';store=openStore();
  fs.mkdirSync(tempDir,{recursive:true});
  async function connect(){
   if(client)return;diagnostics.phase='ticktick_connect';client=new TickTickClient();await client.start();
   diagnostics.phase='ticktick_projects';
   const projects=await client.call('list_projects',{});
   if(!projects.result?.some(p=>p.id===config.project_id&&p.name===config.project_name))throw new Error('TickTick destination identity changed');
  }
  async function deliverRows(rows,drafts,summary){
   await connect();
   diagnostics.phase='task_delivery';
   await deliverQueuedRows(store,client,rows.map(row=>({...row,project_id:config.project_id})),drafts,summary);
  }
  diagnostics.phase='recoverable_drafts';
  const recovered=store.recoverable();
  if(recovered.length){
   diagnostics.phase='decrypt_drafts';
   const drafts=(await unprotect(recovered.map(r=>r.draft_cipher))).map(JSON.parse);
   const summary={recoveredDrafts:recovered.length,created:0,reviewTasks:0,reconciled:0,uncertain:0,updatesNeedingReview:0,modelCalled:false,automaticScheduleEnabled:false};
   await deliverRows(recovered,drafts,summary);console.log(JSON.stringify(summary));
   if(summary.uncertain||summary.updatesNeedingReview)process.exitCode=1;
  }
  diagnostics.phase='pending_selection';
  const rows=store.latestPending();if(!rows.length){console.log(JSON.stringify({pending:0,modelCalled:false}));return;}
  diagnostics.phase='decrypt_pending';
  const bodies=(await unprotect(rows.map(row=>row.body_cipher))).map(JSON.parse);
  diagnostics.phase='decrypt_context';
  const contextRows=store.context();const contextBodies=(await unprotect(contextRows.map(r=>r.body_cipher))).map(JSON.parse);
  diagnostics.phase='candidate_selection';
  const directChats=new Set();
  for(const network of ['whatsapp','slack']){const scope=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../config/'+network+'-allowlist.json'),'utf8').replace(/^\uFEFF/,''));for(const chat of scope.groups||scope.channels||[])if(chat.chat_type==='single')directChats.add(chat.account_id+'|'+chat.conversation_id);}
  for(const body of [...bodies,...contextBodies])if(directChats.has(body.account_id+'|'+body.conversation_id))body.is_direct=true;
  const byKey=new Map(contextBodies.map(body=>[body.source_key,body]));
  for(const body of bodies)byKey.set(body.source_key,body);
  const mode=config.candidate_mode||'strict';
  if(!['strict','nearby_requests','intelligent'].includes(mode))throw Error('Unknown candidate mode');
  const aliases=config.name_aliases||namesDefault;
  const selection=selectBatch(bodies,byKey,{mode,aliases});
  const targets=selection.targets;
  diagnostics.phase='queue_filter';
  store.db.exec('BEGIN IMMEDIATE');
  try{for(const row of rows)if(!candidate(byKey.get(row.source_key),byKey,mode,aliases))store.status(row.source_key,row.revision,'not_candidate');store.db.exec('COMMIT');}catch(error){store.db.exec('ROLLBACK');throw error;}
  if(!targets.length){console.log(JSON.stringify({examined:rows.length,candidates:0,deferredCandidates:selection.deferredCandidates,modelCalled:false}));if(selection.deferredCandidates)throw Error('candidate_exceeds_batch_budget');return;}
  const targetIds=targets.map(body=>body.id);
  await connect();
  diagnostics.phase='list_existing_tasks';
  const managedTasks=(await client.listTasks(config.project_id)).filter(t=>t.content?.includes('TaskCapture source ')&&!t.content.includes('TaskCapture reference only'));
  const allowedDuplicates=new Set(managedTasks.map(t=>t.id));
  diagnostics.phase='queue_input';
  const batchBodies=selection.batchBodies;
  const batch={user_name:config.user_name||'User',user_aliases:aliases,timezone:'Asia/Karachi',processing_now:new Date().toISOString(),processing_target_ids:targetIds,messages:batchBodies.filter(body=>body.text&&!body.is_hidden&&!body.is_deleted).map(body=>({id:body.id,sender:body.sender_name,is_self:body.is_self,mentions_user:body.mentions_self,ownership_signal:assessCandidate(body,byKey,mode,aliases).reason,timestamp:body.timestamp,text:body.text,reply_to:body.linked_source_key,context_only:!targetIds.includes(body.id)}))};
  batch.existing_tasks=managedTasks.map(t=>({task_id:t.id,title:t.title,description:t.content.split('\n\nSource:')[0].slice(0,1200),due_at:t.dueDate||null}));
  const input=path.join(tempDir,'input.json'),result=path.join(tempDir,'result.json');
  fs.writeFileSync(input,JSON.stringify(batch),'utf8');
  diagnostics.phase='extraction';diagnostics.modelCalled=false;
  try{await runExtraction(input,result,config.extraction_model||'gpt-6-sol',config.reasoning_effort||'low',diagnostics);}catch(error){diagnostics.modelCalled=error.modelCalled===true;console.log(JSON.stringify({queuePreserved:true,errorCode:error.message,phase:'extraction',modelCalled:diagnostics.modelCalled}));process.exitCode=1;return;}
  diagnostics.phase='parse_extraction';
  const extracted=JSON.parse(fs.readFileSync(result,'utf8').replace(/^\uFEFF/,''));
  diagnostics.phase='validation';
  const deadlineReviews=reviewInvalidDeadlines(extracted);
  if(deadlineReviews)console.log(JSON.stringify({deadlineReviews,modelCalled:true}));
  validateExtraction(extracted,{targetIds,allowedDuplicates});
  diagnostics.phase='task_enrichment';
  const ids=new Set();
  for(const task of extracted.tasks){
   if(!targetIds.includes(task.source_message_id)||ids.has(task.source_message_id)||typeof task.title!=='string'||!task.title.trim()||task.title.length>480||typeof task.description!=='string'||task.description.length>10000||typeof task.requires_review!=='boolean'||(task.due_at!==null&&!Number.isFinite(Date.parse(task.due_at))))throw new Error('Task validation failed');
   ids.add(task.source_message_id);
   if(!Array.isArray(task.related_source_message_ids))throw Error('Missing related source identities');
   for(const id of task.related_source_message_ids){if(!targetIds.includes(id)||ids.has(id))throw Error('Invalid or repeated related source identity');ids.add(id);}
   if(task.duplicate_of_task_id!==null&&!allowedDuplicates.has(task.duplicate_of_task_id))throw Error('Unknown duplicate target');
   if(task.due_at&&Date.parse(task.due_at)<Date.now())task.requires_review=true;
   const source=byKey.get(task.source_message_id);
   if(['nearby_requests','intelligent'].includes(mode)&&!assessCandidate(source,byKey,mode,aliases).strongOwnership)task.requires_review=true;
   task.description+='\n\nSource: '+source.group+' ('+source.source+'), '+source.timestamp;
   task.source_info={platform:source.source,group:source.group,timestamp:source.timestamp};
   task.related_sources=task.related_source_message_ids.map(id=>{const body=byKey.get(id),row=rows.find(r=>r.source_key===id);return {source_key:id,revision:row.revision,platform:body.source,group:body.group,timestamp:body.timestamp};});
  }
  diagnostics.phase='encrypt_drafts';
  const encrypted=await protect(extracted.tasks.map(task=>JSON.stringify(task)));
  diagnostics.phase='persist_drafts';
  store.db.exec('BEGIN IMMEDIATE');
  try{
   for(let index=0;index<extracted.tasks.length;index++){
    const task=extracted.tasks[index],row=rows.find(r=>r.source_key===task.source_message_id);store.draft(row.source_key,row.revision,encrypted[index]);
    for(const related of task.related_sources)store.status(related.source_key,related.revision,'awaiting_merge');
   }
   for(const row of rows)if(targetIds.includes(row.source_key)&&!ids.has(row.source_key))store.status(row.source_key,row.revision,'no_task');
   store.db.exec('COMMIT');
  }catch(error){store.db.exec('ROLLBACK');throw error;}
  if(!extracted.tasks.length){console.log(JSON.stringify({examined:rows.length,candidates:targets.length,extractedTasks:0,deferredCandidates:selection.deferredCandidates,modelCalled:true,locallyValidated:true}));return;}
  const summary={modelCalled:true,deferredCandidates:selection.deferredCandidates,examined:rows.length,candidates:targets.length,extractedTasks:extracted.tasks.length,created:0,reviewTasks:0,reconciled:0,uncertain:0,updatesNeedingReview:0,locallyValidated:true};
  await deliverRows(extracted.tasks.map(draft=>rows.find(r=>r.source_key===draft.source_message_id)),extracted.tasks,summary);
  console.log(JSON.stringify(summary));
  if(summary.uncertain||summary.updatesNeedingReview)process.exitCode=1;
 }finally{
  const failures=cleanQueue([
   ()=>client?.close(),()=>store?.close(),
   ...['input.json','result.json'].map(name=>()=>{const file=path.join(tempDir,name);if(fs.existsSync(file))fs.unlinkSync(file);}),
   ()=>{if(fs.existsSync(tempDir))fs.rmdirSync(tempDir);},
   ()=>{if(fs.existsSync(lockPath))fs.unlinkSync(lockPath);}
  ]);
  if(failures){console.log(JSON.stringify({errorCode:'queue_cleanup_failed',phase:'cleanup',modelCalled:diagnostics.modelCalled,cleanupFailures:failures}));process.exitCode=1;}
 }
}
async function runQueue(){const diagnostics=createQueueDiagnostics();try{await processQueue(diagnostics);}catch(error){console.log(JSON.stringify(describeQueueFailure(error,diagnostics)));console.error('Task processing stopped safely. Queued messages or drafts are retained for retry.');process.exitCode=1;}}
if(require.main===module)runQueue();
module.exports={candidate,runExtraction,processQueue,runQueue};
