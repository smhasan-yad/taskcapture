// Bound each model batch; unselected candidates stay pending for a later pass.
function selectBatch(bodies,byKey,{mode='strict',aliases,maxCandidates=40,maxTextChars=40000}={}){
 const {assessCandidate}=require('./candidates.cjs');
 const eligible=bodies.filter(b=>assessCandidate(b,byKey,mode,aliases).candidate);
 const targets=[],context=[];let chars=0;
 for(const body of eligible){
  if(targets.length>=maxCandidates)break;
  const required=[body];const parent=byKey.get(body.linked_source_key);
  if(parent?.text&&!parent.is_deleted&&!parent.is_hidden)required.push(parent);
  const additions=required.filter(b=>!targets.some(x=>x.id===b.id)&&!context.some(x=>x.id===b.id));
  const cost=additions.reduce((n,b)=>n+b.text.length,0);
  if(chars+cost>maxTextChars)continue;
  targets.push(body);chars+=cost;
  for(const b of additions)if(b.id!==body.id)context.push(b);
 }
 // A chosen parent can also be a processing target; include it only once.
 const batch=[...targets,...context.filter(b=>!targets.some(t=>t.id===b.id))];
 for(const body of targets){
  const nearby=[...byKey.values()].filter(b=>b.text&&!b.is_hidden&&!b.is_deleted&&b.account_id===body.account_id&&b.conversation_id===body.conversation_id&&Math.abs(Date.parse(b.timestamp)-Date.parse(body.timestamp))<=300000).sort((a,b)=>Math.abs(Date.parse(a.timestamp)-Date.parse(body.timestamp))-Math.abs(Date.parse(b.timestamp)-Date.parse(body.timestamp))).slice(0,5);
  for(const b of nearby)if(!batch.some(x=>x.id===b.id)&&chars+b.text.length<=maxTextChars){batch.push(b);chars+=b.text.length;}
 }
 return {targets,batchBodies:batch,eligibleCount:eligible.length,deferredCandidates:eligible.length-targets.length,textChars:chars};
}
module.exports={selectBatch};
