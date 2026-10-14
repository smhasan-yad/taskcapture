const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {openStore,hash}=require('../worker/intake-store.cjs');
const {protect,unprotect}=require('../worker/local-crypto.cjs');
const {normalize}=require('../worker/Collect-Beeper.cjs');
const {revisionFor}=require('../worker/source-revision.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hasan-intake-test-'));
 const store=openStore(path.join(dir,'test.sqlite'));
 try{
  const unicode='Synthetic Unicode message: \u062d\u0633\u0646';
  const cipher=(await protect([unicode]))[0];assert(!cipher.includes(unicode));assert.equal((await unprotect([cipher]))[0],unicode);
  const largeUnicode='\u062d\u0633\u0646 \u2192 '.repeat(18000);assert.equal((await unprotect(await protect([largeUnicode])))[0],largeUnicode);
  const record={source_key:'one',revision:hash('v1'),scope_key:'chat1',received_at:'2026-10-10T10:00:00Z',body_cipher:cipher};
  const checkpoint={scope_key:'chat1',cursor:'opaque-a',history_start:'2026-10-03T10:00:00Z'};
  assert.equal(store.ingest([record],checkpoint),1);assert.equal(store.ingest([record],checkpoint),0);
  assert.equal(store.ingest([{...record,revision:hash('v2')}],{...checkpoint,cursor:'opaque-b'}),1);
  assert.equal(store.pending().length,2);assert.equal(store.checkpoint('chat1').cursor,'opaque-b');
  store.db.prepare('UPDATE messages SET captured_at=?').run('2020-01-01T00:00:00Z');store.prune();assert.equal(store.pending().length,2);
  const latest=store.latestPending();assert.equal(latest.length,1);assert.equal(latest[0].revision,hash('v2'));
  store.draft('one',hash('v2'),cipher);assert.equal(store.recoverable().length,1);
  store.status('one',hash('v2'),'uncertain');assert.equal(store.recoverable().length,1);
  store.status('one',hash('v2'),'delivered');assert.equal(store.recoverable().length,0);
  assert.throws(()=>store.ingest([{...record,source_key:null}],{...checkpoint,cursor:'must-not-commit'}));
  assert.equal(store.checkpoint('chat1').cursor,'opaque-b');
  store.reserve('one',record.revision,'test-list','marker');
  assert.throws(()=>store.reserve('one',record.revision,'test-list','marker'));
  store.uncertain('one');assert.equal(store.delivery('one').state,'uncertain');
  const group={account_id:'whatsapp',conversation_id:'allowed-chat',name:'Synthetic group'};
  const profile={self_ids:['self'],user_name:'Synthetic User'};
  const normalized=normalize({id:'m1',accountID:'whatsapp',senderID:'self',timestamp:'2026-10-10T10:00:00Z',text:'Hi'},group,profile);
  assert.equal(normalized.is_self,true);assert.equal(normalized.sender_name,'Synthetic User');assert(!JSON.stringify(normalized).includes('"senderID"'));
  assert.equal(revisionFor({...normalized,group:'Renamed',sender_name:'Renamed sender'},normalized,'old-hash'),'old-hash');assert.notEqual(revisionFor({...normalized,text:'Edited'},normalized,'old-hash'),'old-hash');
  assert.throws(()=>normalize({id:'m1',accountID:'other'},group,profile));
  const slack=normalize({id:'s1',accountID:'slack-account',senderID:'another',mentions:['self'],timestamp:'2026-10-10T10:00:00Z',text:'Synthetic mention'},{name:'Synthetic Slack group',network:'Slack',account_id:'slack-account',conversation_id:'allowed-slack'},profile);
  assert.equal(slack.source,'slack');assert.equal(slack.mentions_self,true);assert.equal(slack.is_self,false);
  console.log('PASS: encrypted Unicode, duplicate intake, revisions, checkpoint rollback, uncertain-write reservation, identity normalization.');
 }finally{store.close();for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
})().catch(error=>{console.error('Intake verification failed: '+error.stack);process.exitCode=1;});
