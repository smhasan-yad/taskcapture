// Separate repair after Hasan confirms manual acknowledgement deletion. Never creates or deletes tasks.
const fs=require('node:fs'),path=require('node:path');
const {openStore}=require('./intake-store.cjs');
const {unprotect}=require('./local-crypto.cjs');
const {TickTickClient}=require('./ticktick-client.cjs');
const {refreshManagedTask}=require('./task-labels.cjs');
async function repairLabels(store,client,projectId){
 const tasks=await client.listTasks(projectId);
 const remaining=new Map(tasks.filter(t=>t.content?.includes('TaskCapture source ')&&!t.content.includes('TaskCapture reference only')).map(t=>[t.id,t]));
 const rows=store.db.prepare("SELECT m.source_key,m.body_cipher,d.task_id FROM deliveries d JOIN messages m ON m.source_key=d.source_key AND m.revision=d.revision WHERE d.state='created' AND d.project_id=? AND m.body_cipher IS NOT NULL").all(projectId).filter(r=>remaining.has(r.task_id)&&remaining.get(r.task_id).content.includes('TaskCapture source '+r.source_key));
 const bodies=(await unprotect(rows.map(r=>r.body_cipher))).map(JSON.parse);
 const bound=new Set(store.bindings().map(b=>b.source_key));
 for(let i=0;i<rows.length;i++){
  if(bound.has(rows[i].source_key))continue;
  const b=bodies[i];if(!['whatsapp','slack'].includes(b.source)||typeof b.group!=='string'||!Number.isFinite(Date.parse(b.timestamp)))throw Error('Invalid source metadata');
  store.bindSource(rows[i].source_key,rows[i].task_id,b.source,b.group,b.timestamp);
 }
 const updateOnly={listTasks:p=>client.listTasks(p),call:(tool,args)=>{if(tool!=='update_task')throw Error('Repair is update-only');return client.call(tool,args);}};
 let verified=0;
 for(const id of new Set(store.bindings().map(b=>b.task_id)))if(remaining.has(id)){await refreshManagedTask(store,updateOnly,projectId,id);verified++;}
 return {verifiedManagedTasks:verified,created:0,deleted:0};
}
async function main(){
 if(!process.argv.includes('--apply')||!process.argv.includes('--acknowledgements-removed')){console.log(JSON.stringify({repairApplied:false,requiresManualDeletionConfirmation:true,ticktickWrites:0}));return;}
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../config/ticktick-destination.json'),'utf8').replace(/^\uFEFF/,''));
 const store=openStore(),client=new TickTickClient();
 try{await client.start();const tasks=await client.listTasks(config.project_id);if(tasks.some(t=>t.content?.includes('TaskCapture reference only')))throw Error('Acknowledgement references remain; no repair applied');console.log(JSON.stringify(await repairLabels(store,client,config.project_id)));}finally{store.close();client.close();}
}
if(require.main===module)main().catch(()=>{console.error('Update-only label repair stopped safely. Check manual acknowledgement removal and managed task ownership.');process.exitCode=1;});
module.exports={repairLabels};
