const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'capture-upgrade-test-'));process.env.TASKCAPTURE_STATE=dir;
const {openStore}=require('../worker/intake-store.cjs');const {protect}=require('../worker/local-crypto.cjs');const {upgrade}=require('../worker/Upgrade-Candidates.cjs');
(async()=>{const store=openStore();try{
 const now=new Date().toISOString(),old=new Date(Date.now()-8*86400000).toISOString();
 const bodies=[['new','aap ye check krdo',now],['bound','Please check synthetic issue',now],['strict','Hasan review synthetic issue',now],['old','Please check old synthetic issue',old],['info','Thanks everyone',now]].map(([id,text,timestamp])=>({id,source_key:id,text,timestamp,account_id:'a',conversation_id:'c'}));
 const encrypted=await protect(bodies.map(b=>JSON.stringify(b)));store.ingest(bodies.map((b,i)=>({source_key:b.id,revision:'r',scope_key:'g',received_at:b.timestamp,body_cipher:encrypted[i]})),null);
 for(const b of bodies)store.status(b.id,'r','no_task');store.bindSource('bound','task','slack','Synthetic group',now);
 const preview=await upgrade();assert.equal(preview.additionalCandidates,1);assert.equal(store.pending().length,0);
 const applied=await upgrade({apply:true});assert.equal(applied.requeued,1);assert.deepEqual(store.pending().map(x=>x.source_key),['new']);
 store.status('new','r','no_task');const second=await upgrade({apply:true});assert(second.alreadyApplied);assert.equal(second.requeued,0);assert.equal(store.pending().length,0);
 console.log('PASS: one-time policy upgrade preserves delivered bindings, prior strong candidates and old history; preview is read-only and repeated apply is idempotent.');
 }finally{store.close();const target=path.resolve(dir);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert(path.basename(target).startsWith('capture-upgrade-test-'));fs.rmSync(target,{recursive:true});}})().catch(()=>{console.error('Offline candidate policy upgrade failed');process.exitCode=1;});
