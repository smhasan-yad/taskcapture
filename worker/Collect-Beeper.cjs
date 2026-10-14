const fs=require('node:fs'),path=require('node:path');
const {protect,unprotect}=require('./local-crypto.cjs');
const {openStore,hash,stateDir}=require('./intake-store.cjs');
const {revisionFor}=require('./source-revision.cjs');
const {readHistory}=require('./history-reader.cjs');
function normalize(message,group,profile){
 if(message.accountID!==group.account_id)throw new Error('Unexpected message account');
 const key=hash('beeper|'+group.account_id+'|'+group.conversation_id+'|'+message.id);
 const self=message.isSender===true||profile.self_ids.includes(message.senderID);
 const mentioned=Array.isArray(message.mentions)&&message.mentions.some(id=>profile.self_ids.includes(id));
 const text=typeof message.text==='string'?message.text:'';
 return {id:key,source_key:key,source:group.network==='Slack'?'slack':'whatsapp',account_id:group.account_id,conversation_id:group.conversation_id,
 original_message_id:message.id,group:group.name,is_direct:group.chat_type==='single',timestamp:message.timestamp,text,sender_name:self?(profile.user_name||'Me'):(message.senderName||'Unknown'),
 is_self:self,mentions_self:mentioned,broadcast_mention:Array.isArray(message.mentions)&&message.mentions.includes('@room'),
 linked_source_key:message.linkedMessageID?hash('beeper|'+group.account_id+'|'+group.conversation_id+'|'+message.linkedMessageID):null,
 is_deleted:message.isDeleted===true,is_hidden:message.isHidden===true,edited_at:message.editedTimestamp||null,type:message.type||'TEXT'};
}
async function collect(){
 const slack=process.argv.includes('--slack');
 const network=slack?'Slack':'WhatsApp';
 const configPath=path.resolve(__dirname,'../config/'+(slack?'slack':'whatsapp')+'-allowlist.json');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));
 const trial=process.argv.includes('--trial');
 const allApproved=process.argv.includes('--all-approved');
 if(allApproved&&(!trial||slack))throw Error('All-approved selection applies only to a bounded WhatsApp trial');
 const orderArg=process.argv.find(arg=>arg.startsWith('--order='));
 const trialOrder=orderArg?Number(orderArg.slice('--order='.length)):1;
 if(orderArg&&(!trial||!Number.isInteger(trialOrder)||trialOrder<1))throw Error('A valid manual trial order is required');
 if(!trial&&!config.enabled)throw new Error('Automatic collection is disabled; manual trial requires --trial');
 if(!config.privacy_confirmed_by_user||config.contains_confidential_clinical_information)throw new Error('Source privacy gate is not satisfied');
 if(config.selection_mode==='all_chats_active_last_7_days'&&config.all_chats_authorized_by_user!==true)throw Error('All-chat scope not authorized');
 const groups=(slack?config.channels:config.groups).filter(g=>!trial||allApproved||config.selection_mode==='all_chats_active_last_7_days'||(slack&&config.selection_mode==='active_last_7_days')||g.rollout_order===trialOrder);
 if(slack&&config.selection_mode==='active_last_7_days'&&config.recent_scope_privacy_confirmed_by_user!==true)throw Error('Recent Slack scope is not confirmed');
 if(!groups.length){console.log(JSON.stringify({network,activeConversations:0,automaticScheduleEnabled:false}));return;}
 if(groups.some(g=>!g.conversation_id||g.network!==network))throw new Error('Stable allowlisted group IDs required');
 const values=await unprotect(['beeper-token.dpapi',(slack?'slack':'whatsapp')+'-identity.dpapi'].map(name=>fs.readFileSync(path.join(stateDir,name)).toString('base64')));
 const token=values[0],identity=JSON.parse(values[1]);
 const profiles=Array.isArray(identity.profiles)?identity.profiles:[identity];
 if(!profiles.length||profiles.some(profile=>typeof profile.self_id!=='string'||!Array.isArray(profile.self_ids)))throw new Error('Validated self identity required');
 const store=openStore();let total=0,failed=0;
 try{
  for(const group of groups){
   try{
   const profile=profiles.find(p=>p.account_id===group.account_id);
   if(!profile)throw new Error('Chat belongs to an unverified account');
   const scope=hash('beeper|'+group.account_id+'|'+group.conversation_id);
   const previous=store.checkpoint(scope);
   const rollingStart=new Date(Date.now()-7*86400000).toISOString();
   const historyStart=previous?.history_start&&Date.parse(previous.history_start)>Date.parse(rollingStart)?previous.history_start:rollingStart;
   const base='http://127.0.0.1:23373/v1/chats/'+encodeURIComponent(group.conversation_id)+'/messages';
   async function page(cursor,direction){
    const url=new URL(base);if(cursor){url.searchParams.set('cursor',cursor);url.searchParams.set('direction',direction);}
    const response=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Beeper read failed: HTTP '+response.status);
    const data=await response.json();if(!Array.isArray(data.items))throw new Error('Invalid Beeper message page');return data;
   }
   const history=await readHistory(page,{checkpoint:previous,historyStart});
   const messages=history.messages.map(m=>normalize(m,group,profile));
   const prior=messages.map(m=>store.latestRevision(m.source_key));
   const readable=prior.map((row,index)=>({row,index})).filter(x=>x.row?.body_cipher);
   const priorBodies=new Map((await unprotect(readable.map(x=>x.row.body_cipher))).map((body,index)=>[readable[index].index,JSON.parse(body)]));
   const encrypted=await protect(messages.map(m=>JSON.stringify(m)));
   const records=messages.map((m,i)=>({source_key:m.source_key,revision:revisionFor(m,priorBodies.get(i),prior[i]?.revision),scope_key:scope,received_at:m.timestamp,body_cipher:encrypted[i]}));
   const cursor=history.cursor;
   if(!cursor)throw new Error('Missing source checkpoint cursor');
   const inserted=store.ingest(records,{scope_key:scope,cursor,history_start:historyStart});total+=inserted;
   console.log(JSON.stringify({examined:messages.length,newRevisions:inserted,historyStart,checkpointSaved:true,mode:trial?'manual_trial':'enabled_collection'}));
   }catch(error){failed++;const known={'Missing source checkpoint cursor':'checkpoint_missing','Missing older-history cursor':'history_cursor_missing','History page limit reached; checkpoint not advanced':'history_page_limit','Pagination stopped advancing':'pagination_stalled','Invalid source message identity or timestamp':'message_identity_invalid','Chat belongs to an unverified account':'identity_unverified'};const code=known[error.message]||(/^Beeper read failed: HTTP [0-9]{3}$/.test(error.message)?'beeper_http_error':/Windows encryption/.test(error.message)?'encryption_failed':'intake_failed');console.log(JSON.stringify({errorCode:code}));console.error('An authorized '+network+' conversation failed; its checkpoint is preserved and other conversations will continue.');}
  }
  store.prune();console.log(JSON.stringify({durableIntakeComplete:failed===0,newRevisions:total,failedConversations:failed}));if(failed)process.exitCode=1;
 }finally{store.close();}
}
if(require.main===module)collect().catch(()=>{console.error('Beeper collection failed. Messages remain queued and the affected checkpoint was not advanced.');process.exitCode=1;});
module.exports={normalize};
