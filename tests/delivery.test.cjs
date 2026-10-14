const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {openStore}=require('../worker/intake-store.cjs');
const {deliverTask}=require('../worker/deliver-task.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hasan-delivery-test-')),store=openStore(path.join(dir,'test.sqlite'));
 let creates=0,tasks=[],failAfterWrite=false;
 const client={listTasks:async()=>tasks,call:async(_,args)=>{creates++;const task={...args.task,id:'synthetic-'+creates};tasks.push(task);if(failAfterWrite)throw Error('Synthetic timeout after successful remote write');return task;}};
 const input={sourceKey:'source-a',revision:'revision-a',projectId:'test-list',draft:{title:'Synthetic assignment',description:'Synthetic body',due_at:null,requires_review:false}};
 try{
  assert.equal((await deliverTask(store,client,input)).state,'created');
  assert.equal((await deliverTask(store,client,input)).state,'already_delivered');assert.equal(creates,1);
  assert.equal((await deliverTask(store,client,{...input,revision:'edited'})).state,'needs_review');assert.equal(creates,1);
  failAfterWrite=true;
  const second={...input,sourceKey:'source-b'};
  assert.equal((await deliverTask(store,client,second)).state,'uncertain');
  assert.equal((await deliverTask(store,client,second)).state,'reconciled');assert.equal(creates,2);
  const editedUncertain={...input,sourceKey:'source-edited'};
  assert.equal((await deliverTask(store,client,editedUncertain)).state,'uncertain');
  assert.equal((await deliverTask(store,client,{...editedUncertain,revision:'new-edit'})).state,'needs_review');assert.equal(creates,3);
  store.reserve('source-c','revision-c','test-list','absent-marker');
  assert.equal((await deliverTask(store,client,{...input,sourceKey:'source-c'})).state,'uncertain');assert.equal(creates,3);
  console.log('PASS: duplicate delivery, edited-source review, successful remote write followed by timeout, reconciliation, and no blind retry after ambiguous absence.');
 }finally{store.close();for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
})().catch(error=>{console.error('Synthetic delivery verification failed: '+error.message);process.exitCode=1;});
