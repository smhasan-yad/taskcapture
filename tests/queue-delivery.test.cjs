const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {openStore}=require('../worker/intake-store.cjs');
const {deliverRows}=require('../worker/queue-delivery.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'capture-queue-test-')),store=openStore(path.join(dir,'test.sqlite'));
 try{
  const rows=Array.from({length:25},(_,i)=>({source_key:'source-'+i,revision:'r',project_id:'p'}));
  for(const r of rows){store.ingest([{...r,scope_key:'group',received_at:new Date().toISOString(),body_cipher:'synthetic'}],null);store.draft(r.source_key,r.revision,'synthetic');}
  const summary={created:0,reviewTasks:0,reconciled:0,uncertain:0,updatesNeedingReview:0};let calls=0;
  await deliverRows(store,{},rows,rows.map(()=>({related_sources:[]})),summary,async(_,__,r)=>{assert.equal(r.projectId,'p');calls++;if(r.sourceKey==='source-0')throw Error('Related source is bound to a different task');if(r.sourceKey==='source-1')throw Error('Transient read failure');return {state:'created'};});
  assert.equal(calls,20);assert.equal(summary.created,18);assert.equal(summary.updatesNeedingReview,1);assert.equal(summary.uncertain,1);assert.equal(summary.deferredDrafts,5);
  const statuses=store.db.prepare('SELECT source_key,status FROM messages').all();assert.equal(statuses[0].status,'needs_review');assert.equal(statuses[1].status,'uncertain');assert.equal(statuses[24].status,'drafted');
  console.log('PASS: poison rows do not block later delivery; transient failures remain retryable; delivery cap leaves drafts intact.');
 }finally{store.close();for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
})().catch(()=>{console.error('Offline queue delivery check failed.');process.exitCode=1;});
