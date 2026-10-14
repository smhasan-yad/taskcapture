const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {openStore}=require('../worker/intake-store.cjs');
const {deliverTask}=require('../worker/deliver-task.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hasan-labels-test-')),store=openStore(path.join(dir,'test.sqlite'));
 let creates=0,updates=0,tasks=[],failUpdate=false;
 const client={listTasks:async()=>tasks.map(t=>({...t})),call:async(tool,args)=>{
  if(tool==='create_task'){const task={...args.task,id:'task-'+(++creates)};tasks.push(task);return {...task};}
  if(tool==='update_task'){updates++;Object.assign(tasks.find(t=>t.id===args.task_id),args.task);if(failUpdate)throw Error('Timeout after update');return {...tasks.find(t=>t.id===args.task_id)};}
  throw Error('Unexpected tool');
 }};
 const info={platform:'whatsapp',group:'Synthetic WhatsApp',timestamp:'2026-10-10T10:00:00Z'};
 const root={sourceKey:'w1',revision:'r1',projectId:'p',draft:{title:'Prepare presentation',description:'Synthetic action',due_at:null,requires_review:false,source_info:info}};
 try{
  assert.equal((await deliverTask(store,client,root)).state,'created');assert.equal(tasks[0].title,'[W] [Synthetic WhatsApp] Prepare presentation');
  const duplicate={sourceKey:'s1',revision:'s-r1',projectId:'p',draft:{...root.draft,duplicate_of_task_id:'task-1',source_info:{...info,platform:'slack',group:'Synthetic Slack'}}};
  assert.equal((await deliverTask(store,client,duplicate)).state,'merged');assert.equal(creates,1);assert.equal(tasks[0].title,'[W and S] [Synthetic WhatsApp · Synthetic Slack] Prepare presentation');assert.equal(store.sources('task-1').length,2);
  const before=updates;assert.equal((await deliverTask(store,client,duplicate)).state,'already_delivered');assert.equal(updates,before);assert.equal(creates,1);
  const multi={sourceKey:'w2',revision:'r2',projectId:'p',draft:{...root.draft,title:'Separate new action',related_sources:[{source_key:'s2',revision:'s-r2',platform:'slack',group:'Synthetic Slack',timestamp:info.timestamp}]}};
  assert.equal((await deliverTask(store,client,multi)).state,'created');assert.equal(tasks[1].title,'[W and S] [Synthetic WhatsApp · Synthetic Slack] Separate new action');assert.equal(store.delivery('s2').task_id,'task-2');assert.equal(creates,2);
  failUpdate=true;const timeout={...duplicate,sourceKey:'s3',revision:'s-r3'};
  assert.equal((await deliverTask(store,client,timeout)).state,'uncertain');failUpdate=false;
  assert.equal((await deliverTask(store,client,timeout)).state,'reconciled');assert.equal(creates,2);
  const missing={...duplicate,sourceKey:'missing-target',revision:'missing-r',draft:{...duplicate.draft,duplicate_of_task_id:'absent'}};
  assert.equal((await deliverTask(store,client,missing)).state,'needs_review');assert.equal((await deliverTask(store,client,missing)).state,'needs_review');assert.equal(creates,2);
  console.log('PASS: W/S labels, cross-platform merge, two-platform batch mapping, idempotent replay, and recovery after a successful update followed by timeout.');
 }finally{store.close();for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
})().catch(error=>{console.error('Label verification failed: '+error.stack);process.exitCode=1;});
