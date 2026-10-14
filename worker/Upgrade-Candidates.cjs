// One-time local policy upgrade. Existing delivered sources are never requeued.
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {stateDir,openStore}=require('./intake-store.cjs');
const {unprotect}=require('./local-crypto.cjs');
const {assessCandidate,namesDefault}=require('./candidates.cjs');
async function upgrade({apply=false}={}){
 const version='intelligent-v1';
 const db=new DatabaseSync(path.join(stateDir,'capture.sqlite'),{readOnly:true});
 let rows,alreadyApplied;
 try{
  const exists=db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='candidate_upgrades'").get().n;
  alreadyApplied=exists&&Boolean(db.prepare('SELECT 1 FROM candidate_upgrades WHERE version=?').get(version));
  rows=db.prepare("SELECT source_key,revision,body_cipher,status FROM messages WHERE body_cipher IS NOT NULL AND received_at>=? AND rowid IN (SELECT MAX(rowid) FROM messages GROUP BY source_key)").all(new Date(Date.now()-7*86400000).toISOString());
  const delivered=new Set(db.prepare('SELECT source_key FROM deliveries UNION SELECT source_key FROM task_sources').all().map(r=>r.source_key));
  rows=rows.map(r=>({...r,delivered:delivered.has(r.source_key)}));
 }finally{db.close();}
 if(alreadyApplied)return {upgradeApplied:false,alreadyApplied:true,requeued:0,modelCalled:false,ticktickWrites:0};
 const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../config/ticktick-destination.json'),'utf8').replace(/^\uFEFF/,''));
 const bodies=(await unprotect(rows.map(r=>r.body_cipher))).map(JSON.parse);
 const byKey=new Map(bodies.map(b=>[b.source_key,b]));
 const selected=rows.filter((r,i)=>['no_task','not_candidate'].includes(r.status)&&!r.delivered&&!assessCandidate(bodies[i],byKey,'strict').candidate&&assessCandidate(bodies[i],byKey,'intelligent',config.name_aliases||namesDefault).candidate);
 if(apply){const store=openStore();try{
  store.db.exec('BEGIN IMMEDIATE');
  store.db.exec('CREATE TABLE IF NOT EXISTS candidate_upgrades(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
  for(const r of selected)store.status(r.source_key,r.revision,'pending');
  store.db.prepare('INSERT INTO candidate_upgrades(version,applied_at) VALUES(?,?)').run(version,new Date().toISOString());
  store.db.exec('COMMIT');
 }catch(error){store.db.exec('ROLLBACK');throw error;}finally{store.close();}}
 return {upgradeApplied:apply,requeued:apply?selected.length:0,additionalCandidates:selected.length,modelCalled:false,ticktickWrites:0};
}
if(require.main===module)upgrade({apply:process.argv.includes('--apply')}).then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error('Candidate policy upgrade failed safely; no model or task calls made.');process.exitCode=1;});
module.exports={upgrade};
