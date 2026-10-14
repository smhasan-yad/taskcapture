const crypto=require('node:crypto');
const META='TaskCapture chat tags: ';
function sourceLabel(sources){
 const platforms=new Set(sources.map(s=>s.platform));
 return platforms.has('whatsapp')&&platforms.has('slack')?'[W and S]':platforms.has('whatsapp')?'[W]':platforms.has('slack')?'[S]':'';
}
function cleanName(value){return String(value||'Unknown chat').replace(/[\[\]\r\n\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim()||'Unknown chat';}
function shortName(value){
 const name=cleanName(value),characters=Array.from(name);
 if(characters.length<=22)return name;
 const first=name.split(' - ')[0];if(first!==name&&Array.from(first).length<=22)return first;
 return characters.slice(0,21).join('')+'…';
}
function chatLabel(sources){
 const names=[...new Set(sources.map(s=>cleanName(s.source_group||s.group)))];
 const shorts=names.map(shortName);
 const labels=names.map((name,i)=>shorts.filter(x=>x===shorts[i]).length>1?shorts[i]+' '+crypto.createHash('sha256').update(name).digest('hex').slice(0,4):shorts[i]);
 return labels.length?'['+labels.slice(0,2).join(' · ')+(labels.length>2?' +'+(labels.length-2):'')+']':'';
}
function stripLabel(title,content=''){
 let base=title.replace(/^\[(?:W|S|W and S)\]\s*/,'');
 const marker=content.split(/\r?\n/).find(line=>line.startsWith(META));
 if(marker){try{const prior=JSON.parse(marker.slice(META.length));if(typeof prior==='string'&&base.startsWith(prior+' '))base=base.slice(prior.length+1);}catch{throw Error('Managed chat-tag metadata is invalid');}}
 return base;
}
function taskTitle(sources,base){
 const prefix=[sourceLabel(sources),chatLabel(sources)].filter(Boolean).join(' ')+' ';
 const maximum=480-prefix.length;const trimmed=base.length>maximum?base.slice(0,maximum-1)+'…':base;
 return (prefix+trimmed).trim();
}
function tagContent(content,sources){
 return content.split(/\r?\n/).filter(line=>!line.startsWith(META)).join('\n').trimEnd()+'\n\n'+META+JSON.stringify(chatLabel(sources));
}
async function refreshManagedTask(store,client,projectId,taskId){
 const current=(await client.listTasks(projectId)).find(t=>t.id===taskId);
 if(!current||!current.content?.includes('TaskCapture source ')||current.content.includes('TaskCapture reference only'))throw Error('Managed task is unavailable');
 const sources=store.sources(taskId);if(!sources.length)return current;
 const title=taskTitle(sources,stripLabel(current.title,current.content));
 let content=current.content;
 for(const source of sources){
  const marker='TaskCapture source '+source.source_key;
  if(!content.includes(marker))content+='\n\nSource: '+source.source_group+' ('+source.platform+'), '+source.source_at+'\n'+marker;
 }
 content=tagContent(content,sources);
 if(title===current.title&&content===current.content)return current;
 await client.call('update_task',{task_id:taskId,task:{id:taskId,projectId,title,content,etag:current.etag,kind:current.kind||'TEXT'},client_timezone:'Asia/Karachi'});
 const verified=(await client.listTasks(projectId)).find(t=>t.id===taskId&&t.title===title&&t.content===content);
 if(!verified)throw Error('Managed task update could not be verified');return verified;
}
module.exports={sourceLabel,chatLabel,stripLabel,taskTitle,tagContent,refreshManagedTask};
