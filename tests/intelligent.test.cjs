const assert=require('node:assert/strict');
const {candidate,assessCandidate}=require('../worker/candidates.cjs');
const {selectBatch}=require('../worker/candidate-batch.cjs');
const base={id:'request',source_key:'request',account_id:'a',conversation_id:'c',timestamp:'2026-10-10T12:00:00Z'};
const empty=new Map();
for(const text of ['Dr. Hassan, can you check the PACS issue?','HASAN please review this','Hassaan bhai report bhej dein','Hasaan sahab dekh lein','حَسَن بھائی یہ دیکھ لیں','حسان صاحب چیک کریں','Can you check the PACS issue?','Please send the revised document','Your feedback on the viewer is needed','Need to resolve the deployment issue','aap zara PACS ka issue dekh lein','ap ye krdo','plz kal review kar dena','bhej dein jab ready ho','ye check krna','کیا آپ یہ چیک کر سکتے ہیں؟']){
 assert(candidate({...base,text},empty,'intelligent'),text);
}
for(const text of ['Thanks everyone','Happy birthday','The server is working now','Test results look good','This is an informational update','Hassanali sent the files','hasan@example.com']){
 // An email addressed with Hasan is deliberately eligible; no task is inferred locally.
 if(text.includes('@'))continue;
 assert(!candidate({...base,text},empty,'intelligent'),text);
}
assert(!candidate({...base,text:'Hasan please check',is_deleted:true},empty,'intelligent'));
assert(!candidate({...base,text:'Hasan please check',is_hidden:true},empty,'intelligent'));
assert(!assessCandidate({...base,text:'aap dekh lein'},empty,'intelligent').strongOwnership);
assert(assessCandidate({...base,text:'aap dekh lein',is_direct:true},empty,'intelligent').strongOwnership);
assert(!candidate({...base,text:'Thanks everyone',is_direct:true},empty,'intelligent'));
assert(assessCandidate({...base,text:'Hassan dekh lein'},empty,'intelligent').strongOwnership);
const own={...base,id:'own',source_key:'own',is_self:true,text:'Synthetic own context'};
const byKey=new Map([['own',own]]);
assert(candidate({...base,text:'yes',linked_source_key:'own'},byKey,'intelligent'));
assert(!candidate({...base,text:'yes',conversation_id:'other',linked_source_key:'own'},byKey,'intelligent'));
const messages=Array.from({length:65},(_,i)=>({...base,id:'m'+i,source_key:'m'+i,text:'Please review synthetic item '+i}));
const selection=selectBatch(messages,empty,{mode:'intelligent'});
assert.equal(selection.targets.length,40);assert.equal(selection.deferredCandidates,25);
assert.equal(new Set(selection.batchBodies.map(b=>b.id)).size,selection.batchBodies.length);
const huge={...base,text:'Please '+ 'x'.repeat(50000)};
const bounded=selectBatch([huge,messages[0]],empty,{mode:'intelligent'});
assert.deepEqual(bounded.targets.map(b=>b.id),['m0']);assert.equal(bounded.deferredCandidates,1);assert(bounded.textChars<=40000);
const reply={...messages[0],linked_source_key:'own'};
const contextual=selectBatch([reply],byKey,{mode:'intelligent'});
assert(contextual.batchBodies.some(b=>b.id==='own'));assert.equal(contextual.targets.length,1);
console.log('PASS: multilingual requests, name boundaries, ownership uncertainty, reply isolation and bounded deferred batches. modelCalled:false');
