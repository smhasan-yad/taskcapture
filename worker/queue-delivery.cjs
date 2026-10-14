const {deliverTask}=require('./deliver-task.cjs');
async function deliverRows(store,client,rows,drafts,summary,deliver=deliverTask){
 summary.deferredDrafts=Math.max(0,rows.length-20);
 for(let index=0;index<Math.min(rows.length,20);index++){
  const row=rows[index];let outcome;
  try{outcome=await deliver(store,client,{sourceKey:row.source_key,revision:row.revision,projectId:row.project_id,draft:drafts[index]});}
  catch(error){
   const deterministic=/^(Related source is bound to a different task|Multiple remote tasks share a source marker)$/.test(error.message);
   deterministic?store.reviewDelivery(row.source_key):store.uncertain(row.source_key);
   outcome={state:deterministic?'needs_review':'uncertain'};
  }
  if(outcome.state==='created'){summary.created++;if(outcome.requiresReview)summary.reviewTasks++;}
  if(outcome.state==='reconciled')summary.reconciled++;
  if(outcome.state==='uncertain')summary.uncertain++;
  if(outcome.state==='needs_review')summary.updatesNeedingReview++;
  if(outcome.state==='merged')summary.merged=(summary.merged||0)+1;
  store.status(row.source_key,row.revision,outcome.state==='uncertain'?'uncertain':outcome.state==='needs_review'?'needs_review':'delivered');
  if(outcome.state!=='uncertain')for(const related of drafts[index].related_sources||[])store.status(related.source_key,related.revision,outcome.state==='needs_review'?'needs_review':'merged');
 }
}
module.exports={deliverRows};
