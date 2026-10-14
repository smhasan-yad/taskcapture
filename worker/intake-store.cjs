const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {stateDir}=require('./state-path.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function openStore(file=path.join(stateDir,'capture.sqlite')){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const db=new DatabaseSync(file);
 db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
 db.exec(`
 CREATE TABLE IF NOT EXISTS messages(
 source_key TEXT NOT NULL,revision TEXT NOT NULL,scope_key TEXT NOT NULL,received_at TEXT NOT NULL,
 captured_at TEXT NOT NULL,body_cipher TEXT, status TEXT NOT NULL DEFAULT 'pending',
 draft_cipher TEXT,error_code TEXT,PRIMARY KEY(source_key,revision));
 CREATE TABLE IF NOT EXISTS checkpoints(scope_key TEXT PRIMARY KEY,cursor TEXT,history_start TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS deliveries(source_key TEXT PRIMARY KEY,revision TEXT NOT NULL,project_id TEXT NOT NULL,
 task_id TEXT,state TEXT NOT NULL,marker TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS messages_pending ON messages(status,captured_at);
 CREATE TABLE IF NOT EXISTS task_sources(source_key TEXT PRIMARY KEY,task_id TEXT NOT NULL,platform TEXT NOT NULL,source_group TEXT NOT NULL,source_at TEXT NOT NULL);
 `);
 return {
 db,
 checkpoint:scope=>db.prepare('SELECT * FROM checkpoints WHERE scope_key=?').get(scope),
 ingest(records,checkpoint){
  db.exec('BEGIN IMMEDIATE');
  try{
   let inserted=0;
   const statement=db.prepare('INSERT INTO messages(source_key,revision,scope_key,received_at,captured_at,body_cipher) VALUES(?,?,?,?,?,?) ON CONFLICT(source_key,revision) DO NOTHING');
   for(const r of records)inserted+=statement.run(r.source_key,r.revision,r.scope_key,r.received_at,new Date().toISOString(),r.body_cipher).changes;
   if(checkpoint)db.prepare('INSERT INTO checkpoints(scope_key,cursor,history_start,updated_at) VALUES(?,?,?,?) ON CONFLICT(scope_key) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at').run(checkpoint.scope_key,checkpoint.cursor,checkpoint.history_start,new Date().toISOString());
   db.exec('COMMIT');return inserted;
  }catch(error){db.exec('ROLLBACK');throw error;}
 },
 pending:()=>db.prepare("SELECT * FROM messages WHERE status='pending' AND body_cipher IS NOT NULL ORDER BY received_at LIMIT 5000").all(),
 latestPending(){
  db.prepare("UPDATE messages SET status='superseded' WHERE status='pending' AND EXISTS(SELECT 1 FROM messages newer WHERE newer.source_key=messages.source_key AND newer.rowid>messages.rowid)").run();
  return this.pending();
 },
 recoverable:()=>db.prepare("SELECT * FROM messages WHERE status IN ('drafted','uncertain') AND draft_cipher IS NOT NULL ORDER BY received_at LIMIT 200").all(),
 context:()=>db.prepare("SELECT source_key,body_cipher FROM messages WHERE body_cipher IS NOT NULL AND rowid IN(SELECT MAX(rowid) FROM messages GROUP BY source_key) ORDER BY received_at DESC LIMIT 500").all(),
 status:(key,revision,status,error=null)=>db.prepare('UPDATE messages SET status=?,error_code=? WHERE source_key=? AND revision=?').run(status,error,key,revision),
 draft:(key,revision,cipher)=>db.prepare("UPDATE messages SET draft_cipher=?,status='drafted',error_code=NULL WHERE source_key=? AND revision=?").run(cipher,key,revision),
 delivery:key=>db.prepare('SELECT * FROM deliveries WHERE source_key=?').get(key),
 latestRevision:key=>db.prepare('SELECT revision,body_cipher FROM messages WHERE source_key=? ORDER BY rowid DESC LIMIT 1').get(key),
 reviewDelivery:key=>db.prepare("UPDATE deliveries SET state='needs_review',updated_at=? WHERE source_key=?").run(new Date().toISOString(),key),
 bindSource:(key,task,platform,group,at)=>db.prepare('INSERT INTO task_sources(source_key,task_id,platform,source_group,source_at) VALUES(?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET task_id=excluded.task_id').run(key,task,platform,group,at),
 sources:id=>db.prepare('SELECT * FROM task_sources WHERE task_id=? ORDER BY source_at').all(id),
 bindings:()=>db.prepare('SELECT * FROM task_sources').all(),
 reserve(key,revision,project,marker){
  db.prepare("INSERT INTO deliveries(source_key,revision,project_id,state,marker,updated_at) VALUES(?,?,?,'writing',?,?)").run(key,revision,project,marker,new Date().toISOString());
 },
 confirm:(key,id)=>db.prepare("UPDATE deliveries SET task_id=?,state='created',updated_at=? WHERE source_key=?").run(id,new Date().toISOString(),key),
 uncertain:key=>db.prepare("UPDATE deliveries SET state='uncertain',updated_at=? WHERE source_key=?").run(new Date().toISOString(),key),
 prune:()=>db.prepare("UPDATE messages SET body_cipher=NULL WHERE status IN ('delivered','merged','merged_duplicate','no_task','not_candidate','superseded') AND body_cipher IS NOT NULL AND captured_at < ?").run(new Date(Date.now()-7*86400000).toISOString()),
 close:()=>db.close()
 };
}
module.exports={openStore,hash,stateDir};
