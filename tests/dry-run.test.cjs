const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {openStore}=require('../worker/intake-store.cjs');
const {inspectQueue}=require('../worker/Queue-Dry-Run.cjs');
const {resolveState}=require('../worker/state-path.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'capture-dry-test-')),file=path.join(dir,'test.sqlite');
const store=openStore(file);
try{
 store.ingest([{source_key:'synthetic',revision:'v1',scope_key:'group',received_at:new Date().toISOString(),body_cipher:'not-decrypted'}],null);
 const result=inspectQueue(file);assert.equal(result.pending,1);assert.equal(result.modelCalled,false);assert.equal(result.ticktickCalls,0);assert.equal(result.ticktickWrites,0);
 assert.equal(store.pending().length,1);assert.equal(result.stateModified,false);
 assert.equal(resolveState({USERPROFILE:'C:/SyntheticProfile'}),path.resolve('C:/SyntheticProfile/TaskCaptureState'));assert.equal(resolveState({TASKCAPTURE_STATE:'C:/CustomState'}),path.resolve('C:/CustomState'));assert.throws(()=>resolveState({TASKCAPTURE_STATE:'relative'}));
 console.log('PASS: dry run leaves pending data untouched and makes no model or TickTick calls; state override works.');
}finally{store.close();for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
