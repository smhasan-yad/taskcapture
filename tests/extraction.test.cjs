// Entirely offline: validates model-shaped fixtures and candidate selection. Never invokes the model.
const assert=require('node:assert/strict');
const {validateExtraction}=require('../worker/task-validation.cjs');
const {candidate}=require('../worker/candidates.cjs');
const task={source_message_id:'request',title:'Synthetic action',description:'Synthetic description',due_at:null,requires_review:false,duplicate_of_task_id:null,related_source_message_ids:['ack','slack-copy']};
const options={targetIds:['request','ack','slack-copy','new'],allowedDuplicates:new Set(['existing'])};
assert.equal(validateExtraction({tasks:[task]},options).length,1);
assert.equal(validateExtraction({tasks:[]},options).length,0);
assert.throws(()=>validateExtraction({tasks:[{...task,due_at:'2026-02-30T10:00:00Z'}]},options));
assert.equal(validateExtraction({tasks:[{...task,due_at:'2026-10-10T20:00:00+05:00'}]},options).length,1);
for(const change of [{title:' '},{due_at:42},{due_at:'tomorrow'},{duplicate_of_task_id:'unknown'},{related_source_message_ids:['request']},{related_source_message_ids:['missing']},{requires_review:'yes'},{extra:'unexpected'}])assert.throws(()=>validateExtraction({tasks:[{...task,...change}]},options));
assert.throws(()=>validateExtraction({tasks:[task,{...task,source_message_id:'new',related_source_message_ids:['ack']}]},options));
assert.throws(()=>validateExtraction({tasks:Array(101).fill(task)},options));
const own={source_key:'own',text:'Synthetic own message',is_self:true,conversation_id:'group',account_id:'account',timestamp:'2026-10-10T10:00:00Z'};
const byKey=new Map([['own',own]]);
const nearby={text:'Can you check the synthetic issue?',conversation_id:'group',account_id:'account',timestamp:'2026-10-10T10:01:00Z'};
assert(candidate({...nearby,linked_source_key:'own'},byKey));assert(!candidate(nearby,byKey));assert(candidate(nearby,byKey,'nearby_requests'));
assert(!candidate({...nearby,conversation_id:'other'},byKey,'nearby_requests'));assert(!candidate({...nearby,timestamp:'2026-10-10T10:06:00Z'},byKey,'nearby_requests'));assert(!candidate({...nearby,is_deleted:true},byKey,'nearby_requests'));
console.log('PASS: offline extraction contract, duplicate identities, invalid fields and candidate scope. modelCalled:false');
