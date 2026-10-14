const {refreshManagedTask,taskTitle,tagContent}=require('./task-labels.cjs');
async function deliverTask(store,client,{sourceKey,revision,projectId,draft}){
 const existing=store.delivery(sourceKey);
 const marker='TaskCapture source '+sourceKey;
 async function finalize(taskId,state){
  for(const related of draft.related_sources||[]){const prior=store.delivery(related.source_key);if(prior?.task_id&&prior.task_id!==taskId)throw Error('Related source is bound to a different task');}
  store.confirm(sourceKey,taskId);
  if(draft.source_info){
   const info=draft.source_info;store.bindSource(sourceKey,taskId,info.platform,info.group,info.timestamp);
   for(const related of draft.related_sources||[]){
    const prior=store.delivery(related.source_key);
    if(prior&&prior.task_id&&prior.task_id!==taskId)throw Error('Related source is bound to a different task');
    if(!prior)store.reserve(related.source_key,related.revision,projectId,'TaskCapture source '+related.source_key);
    store.confirm(related.source_key,taskId);
    store.bindSource(related.source_key,taskId,related.platform,related.group,related.timestamp);
   }
   try{await refreshManagedTask(store,client,projectId,taskId);}catch{store.uncertain(sourceKey);return {state:'uncertain'};}
  }
  return {state,taskId,requiresReview:draft.requires_review};
 }
 if(existing?.state==='needs_review')return {state:'needs_review'};
 if(existing?.state==='created'){
  if(existing.revision!==revision)return {state:'needs_review'};
  return finalize(existing.task_id,'already_delivered');
 }
 if(existing){
  const matches=(await client.listTasks(existing.project_id)).filter(t=>typeof t.content==='string'&&!t.content.includes('TaskCapture reference only')&&(t.content.includes(existing.marker)||(existing.task_id===t.id&&t.content.includes('TaskCapture source '))));
  if(matches.length===1)return finalize(matches[0].id,existing.revision===revision?'reconciled':'needs_review');
  // The task may have been completed, moved, or deleted after an uncertain create.
  // Absence from active tasks does not prove absence from TickTick. Never create again here.
  return {state:'uncertain'};
 }
 const matching=(await client.listTasks(projectId)).filter(t=>typeof t.content==='string'&&!t.content.includes('TaskCapture reference only')&&t.content.includes(marker));
 if(matching.length>1)throw new Error('Multiple remote tasks share a source marker');
 store.reserve(sourceKey,revision,projectId,marker);
 if(matching.length===1)return finalize(matching[0].id,'reconciled');
 if(draft.duplicate_of_task_id){
  const target=(await client.listTasks(projectId)).find(t=>t.id===draft.duplicate_of_task_id&&t.content?.includes('TaskCapture source '));
  if(!target||target.content.includes('TaskCapture reference only')){store.reviewDelivery(sourceKey);return {state:'needs_review'};}
  return finalize(target.id,'merged');
 }
 const prefix=draft.requires_review?'[Review] ':'';
 let content=[draft.description,draft.requires_review?'Review the assignment and deadline before acting.':'',marker].filter(Boolean).join('\n\n');
 const sources=draft.source_info?[draft.source_info,...(draft.related_sources||[])]:[];
 if(sources.length)content=tagContent(content,sources);
 const task={projectId,title:sources.length?taskTitle(sources,prefix+draft.title):prefix+draft.title,content,kind:'TEXT',timeZone:'Asia/Karachi'};
 if(draft.due_at&&!draft.requires_review)task.dueDate=draft.due_at;
 try{
  const created=await client.call('create_task',{task,client_timezone:'Asia/Karachi'});
  if(!created.id||created.projectId!==projectId)throw new Error('Created task identity could not be verified');
  const verified=(await client.listTasks(projectId)).find(t=>t.id===created.id&&t.title===task.title&&typeof t.content==='string'&&t.content.includes(marker));
  if(!verified)throw new Error('Task readback failed');
  return finalize(created.id,'created');
 }catch{store.uncertain(sourceKey);return {state:'uncertain'};}
}
module.exports={deliverTask};
