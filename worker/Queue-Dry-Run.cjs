const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
const {stateDir}=require('./state-path.cjs');
function inspectQueue(file=path.join(stateDir,'capture.sqlite')){
 if(!fs.existsSync(file))throw Error('State database not found; migration is required');
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  const pending=db.prepare("SELECT count(*) AS n FROM messages m WHERE status='pending' AND body_cipher IS NOT NULL AND NOT EXISTS(SELECT 1 FROM messages newer WHERE newer.source_key=m.source_key AND newer.rowid>m.rowid)").get().n;
  const recovery=db.prepare("SELECT count(*) AS n FROM messages WHERE status IN ('drafted','uncertain') AND draft_cipher IS NOT NULL").get().n;
  return {dryRun:true,pending,recoverableDrafts:recovery,sourceBindings:db.prepare('SELECT count(*) AS n FROM task_sources').get().n,modelCalled:false,ticktickWrites:0,ticktickCalls:0,stateModified:false};
 }finally{db.close();}
}
if(require.main===module){try{console.log(JSON.stringify(inspectQueue()));}catch{console.error('Queue dry run failed: inspect the configured state path.');process.exitCode=1;}}
module.exports={inspectQueue};
