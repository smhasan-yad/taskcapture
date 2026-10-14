// The model fills one nullable slot per target message. Durable IDs stay outside its output.
function buildExtractionContract(batch,baseSchema){
 const ids=batch.processing_target_ids;
 if(!Array.isArray(ids)||!ids.length||ids.length>40||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Error('extraction_input_invalid');
 const toAlias=new Map(ids.map((id,i)=>[id,'m'+(i+1)]));const fromAlias=new Map([...toAlias].map(([id,alias])=>[alias,id]));let context=0;
 for(const message of batch.messages||[])if(!toAlias.has(message.id))toAlias.set(message.id,'c'+(++context));
 if(ids.some(id=>!(batch.messages||[]).some(m=>m.id===id&&m.text&&!m.context_only)))throw Error('extraction_input_invalid');
 const modelInput={...batch,processing_target_ids:ids.map(id=>toAlias.get(id)),messages:batch.messages.map(m=>({...m,id:toAlias.get(m.id),reply_to:toAlias.get(m.reply_to)||null}))};
 const task=JSON.parse(JSON.stringify(baseSchema.properties.tasks.items));delete task.properties.source_message_id;task.required=task.required.filter(k=>k!=='source_message_id');
 const aliases=[...fromAlias.keys()];task.properties.related_source_message_ids.items={type:'string',enum:aliases};
 task.properties.duplicate_of_task_id={type:['string','null'],enum:[null,...new Set((batch.existing_tasks||[]).map(t=>t.task_id))]};task.properties.title.minLength=1;
 const schema={type:'object',properties:{tasks:{type:'object',properties:Object.fromEntries(aliases.map(alias=>[alias,{anyOf:[{$ref:'#/$defs/task'},{type:'null'}]}])),required:aliases,additionalProperties:false}},required:['tasks'],additionalProperties:false,$defs:{task}};
 return {modelInput,schema,fromAlias};
}
function decodeExtractionResult(data,contract){
 if(!data||typeof data!=='object'||Object.keys(data).length!==1||!Object.hasOwn(data,'tasks')||!data.tasks||typeof data.tasks!=='object'||Array.isArray(data.tasks))throw Error('extraction_contract_invalid');
 const entries=Object.entries(data.tasks);if(entries.length!==contract.fromAlias.size||entries.some(([alias])=>!contract.fromAlias.has(alias)))throw Error('extraction_contract_invalid');
 const tasks=[];
 for(const [alias,value] of entries){
  if(value===null)continue;
  if(typeof value!=='object'||Array.isArray(value)||Object.hasOwn(value,'source_message_id')||!Array.isArray(value.related_source_message_ids))throw Error('extraction_contract_invalid');
  const related=value.related_source_message_ids.map(id=>{if(!contract.fromAlias.has(id))throw Error('extraction_contract_invalid');return contract.fromAlias.get(id);});
  tasks.push({...value,source_message_id:contract.fromAlias.get(alias),related_source_message_ids:related});
 }
 return {tasks};
}
module.exports={buildExtractionContract,decodeExtractionResult};
