// Adds provenance tags to existing managed roots only; no extraction/create/delete.
const fs=require('node:fs'),path=require('node:path');const {openStore}=require('./intake-store.cjs');const {TickTickClient}=require('./ticktick-client.cjs');const {refreshManagedTask}=require('./task-labels.cjs');
async function refreshTags(store,client,projectId){
 const existing=await client.listTasks(projectId);
 const managed=new Map(existing.filter(t=>t.content?.includes('TaskCapture source ')&&!t.content.includes('TaskCapture reference only')).map(t=>[t.id,t]));
 let updated=0,verified=0,failed=0;
 const updateOnly={listTasks:p=>client.listTasks(p),call:(tool,args)=>{if(tool!=='update_task')throw Error('Chat tag refresh is update-only');return client.call(tool,args);}};
 for(const id of new Set(store.bindings().map(b=>b.task_id))){
  if(!managed.has(id))continue;
  try{const prior=managed.get(id),current=await refreshManagedTask(store,updateOnly,projectId,id);if(prior.title!==current.title||prior.content!==current.content)updated++;verified++;}catch{failed++;}
 }
 return {updated,verified,failed,created:0,deleted:0,modelCalled:false};
}
async function main(){
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({tagsApplied:false,ticktickWrites:0,modelCalled:false}));return;}
 const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../config/ticktick-destination.json'),'utf8').replace(/^\uFEFF/,''));const store=openStore(),client=new TickTickClient();
 try{await client.start();const result=await refreshTags(store,client,config.project_id);console.log(JSON.stringify(result));if(result.failed)process.exitCode=1;}finally{client.close();store.close();}
}
if(require.main===module)main().catch(()=>{console.error('Existing chat tag refresh failed safely; no tasks deleted or created.');process.exitCode=1;});
module.exports={refreshTags};
