const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {openStore}=require('../worker/intake-store.cjs');
const {protect}=require('../worker/local-crypto.cjs');
const {repairLabels}=require('../worker/Repair-Labels.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'capture-repair-test-')),store=openStore(path.join(dir,'test.sqlite'));
 try{
  const cipher=(await protect([JSON.stringify({source:'whatsapp',group:'Synthetic group',timestamp:'2026-10-10T10:00:00Z'})]))[0];
  store.ingest([{source_key:'w',revision:'r',scope_key:'group',received_at:'2026-10-10T10:00:00Z',body_cipher:cipher}],null);store.reserve('w','r','p','TaskCapture source w');store.confirm('w','task');
  let updates=0;const tasks=[{id:'task',projectId:'p',title:'Synthetic action',content:'TaskCapture source w'},{id:'user-task',projectId:'p',title:'User action',content:'Unmanaged'}];
  const client={listTasks:async()=>tasks,call:async(tool,args)=>{assert.equal(tool,'update_task');updates++;Object.assign(tasks.find(t=>t.id===args.task_id),args.task);return {};}};
  await repairLabels(store,client,'p');assert.equal(tasks[0].title,'[W] [Synthetic group] Synthetic action');assert.equal(tasks[1].title,'User action');assert.equal(updates,1);
  await repairLabels(store,client,'p');assert.equal(updates,1);assert.equal(store.bindings().length,1);
  console.log('PASS: update-only repair backfills a missing binding, preserves unmanaged tasks and replays without another update.');
 }finally{store.close();for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
})().catch(()=>{console.error('Offline label repair check failed.');process.exitCode=1;});
