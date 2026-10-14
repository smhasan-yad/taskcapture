const deadlinePattern=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
function validDeadline(value){
 if(typeof value!=='string'||!deadlinePattern.test(value)||!Number.isFinite(Date.parse(value)))return false;
 const offset=value.match(/([+-])(\d\d):(\d\d)$/);const minutes=offset?(offset[1]==='+'?1:-1)*(Number(offset[2])*60+Number(offset[3])):0;
 return new Date(Date.parse(value)+minutes*60000).toISOString().slice(0,19)===value.slice(0,19);
}
function reviewInvalidDeadlines(data){
 let count=0;if(!data||!Array.isArray(data.tasks))return count;
 const note='Deadline needs review: no valid date and time could be confirmed automatically.';
 for(const task of data.tasks){
  if(!task||typeof task!=='object'||typeof task.due_at!=='string'||validDeadline(task.due_at)||typeof task.requires_review!=='boolean'||typeof task.description!=='string')continue;
  task.due_at=null;task.requires_review=true;
  if(!task.description.includes(note)&&task.description.length+note.length+2<=10000)task.description+='\n\n'+note;
  count++;
 }
 return count;
}
const fields=['source_message_id','title','description','due_at','requires_review','duplicate_of_task_id','related_source_message_ids'];
function validateExtraction(data,{targetIds,allowedDuplicates=new Set()}){
 if(!data||Object.keys(data).some(k=>k!=='tasks')||!Array.isArray(data.tasks)||data.tasks.length>100)throw Error('Invalid extraction envelope');
 const targets=new Set(targetIds),seen=new Set();
 for(const task of data.tasks){
  if(!task||typeof task!=='object'||fields.some(k=>!Object.hasOwn(task,k))||Object.keys(task).some(k=>!fields.includes(k)))throw Error('Invalid task fields');
  if(typeof task.title!=='string'||!task.title.trim()||task.title.length>480||typeof task.description!=='string'||task.description.length>10000||typeof task.requires_review!=='boolean')throw Error('Invalid task text or review flag');
  if(task.due_at!==null&&(typeof task.due_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(task.due_at)||!Number.isFinite(Date.parse(task.due_at))))throw Error('Invalid deadline');
  if(task.due_at){const offset=task.due_at.match(/([+-])(\d\d):(\d\d)$/);const minutes=offset?(offset[1]==='+'?1:-1)*(Number(offset[2])*60+Number(offset[3])):0;if(new Date(Date.parse(task.due_at)+minutes*60000).toISOString().slice(0,19)!==task.due_at.slice(0,19))throw Error('Invalid calendar deadline');}
  if(task.duplicate_of_task_id!==null&&(typeof task.duplicate_of_task_id!=='string'||!allowedDuplicates.has(task.duplicate_of_task_id)))throw Error('Unknown duplicate target');
  if(!Array.isArray(task.related_source_message_ids)||task.related_source_message_ids.length>200)throw Error('Invalid related sources');
  for(const id of [task.source_message_id,...task.related_source_message_ids]){
   if(typeof id!=='string'||!targets.has(id)||seen.has(id))throw Error('Unknown or repeated source identity');seen.add(id);
  }
 }
 return data.tasks;
}
module.exports={validateExtraction,validDeadline,reviewInvalidDeadlines};
