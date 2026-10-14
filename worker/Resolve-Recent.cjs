const {protect,unprotect}=require('./local-crypto.cjs');
const {stateDir}=require('./intake-store.cjs');
const {writeAtomic}=require('./atomic-file.cjs');
const fs=require('node:fs'),path=require('node:path');
function selectRecentChats(chats,accounts,now=Date.now()){
 const ids=new Set(accounts.map(a=>a.accountID)),cutoff=now-7*86400000,unique=new Map();
 for(const chat of chats){
  if(!ids.has(chat.accountID)||typeof chat.id!=='string')continue;
  const activity=Date.parse(chat.lastActivity||chat.preview?.timestamp);
  if(!Number.isFinite(activity))throw Error('Chat activity is missing; inventory cannot be verified');
  if(activity>=cutoff)unique.set(chat.accountID+'|'+chat.id,chat);
 }
 return [...unique.values()].sort((a,b)=>Date.parse(b.lastActivity||b.preview?.timestamp)-Date.parse(a.lastActivity||a.preview?.timestamp));
}
function profilesFor(accounts,chats,userName='User'){
 return accounts.map(account=>{
  if(account.user?.isSelf!==true||typeof account.user.id!=='string')throw Error('Connected account self identity unavailable');
  const selfIds=new Set([account.user.id]);
  for(const chat of chats.filter(c=>c.accountID===account.accountID))for(const person of chat.participants?.items||[])if(person.isSelf===true&&person.id)selfIds.add(person.id);
  return {user_name:userName,account_id:account.accountID,self_id:account.user.id,self_ids:[...selfIds],timezone:'Asia/Karachi'};
 });
}
async function hydrateActivity(chats,get){
 for(const chat of chats){
  if(Number.isFinite(Date.parse(chat.lastActivity||chat.preview?.timestamp)))continue;
  const page=await get('http://127.0.0.1:23373/v1/chats/'+encodeURIComponent(chat.id)+'/messages');
  if(!Array.isArray(page.items))throw Error('Chat activity cannot be verified');
  if(!page.items.length){chat.history_unavailable=true;chat.lastActivity='1970-01-01T00:00:00Z';continue;}
  const times=page.items.map(m=>Date.parse(m.timestamp));
  if(times.some(t=>!Number.isFinite(t)))throw Error('Chat activity cannot be verified');
  chat.lastActivity=page.items.length?new Date(Math.max(...times)).toISOString():'1970-01-01T00:00:00Z';
 }
 return chats;
}
async function resolveRecent(network){
 if(!['WhatsApp','Slack'].includes(network))throw Error('Unknown network');
 const key=network==='Slack'?'slack':'whatsapp';
 const configPath=path.resolve(__dirname,'../config/'+key+'-allowlist.json');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));
 if(config.selection_mode!=='all_chats_active_last_7_days'||config.all_chats_authorized_by_user!==true)throw Error('All-chat scope not authorized');
 const token=(await unprotect([fs.readFileSync(path.join(stateDir,'beeper-token.dpapi')).toString('base64')]))[0];
 async function get(url){const r=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Beeper access unavailable');return r.json();}
 const accounts=(await get('http://127.0.0.1:23373/v1/accounts')).filter(a=>a.network===network&&a.status==='connected');
 if(!accounts.length)throw Error('No connected account for the configured network');
 const chats=[],ids=new Set(accounts.map(a=>a.accountID));let cursor;
 for(let page=0;page<100;page++){
  const url=new URL('http://127.0.0.1:23373/v1/chats');url.searchParams.set('limit','200');
  for(const id of ids)url.searchParams.append('accountIDs',id);
  if(cursor){url.searchParams.set('cursor',cursor);url.searchParams.set('direction','before');}
  const data=await get(url);if(!Array.isArray(data.items))throw Error('Invalid chat inventory');
  chats.push(...data.items.filter(c=>ids.has(c.accountID)));
  if(!data.hasMore)break;
  if(!data.items.length||!data.oldestCursor||data.oldestCursor===cursor||page===99)throw Error('Network chat inventory is incomplete');
  cursor=data.oldestCursor;
 }
 await hydrateActivity(chats,get);
 const destination=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../config/ticktick-destination.json'),'utf8').replace(/^\uFEFF/,''));
 const selected=selectRecentChats(chats,accounts),profiles=profilesFor(accounts,selected,destination.user_name||'User');
 const entries=selected.map((chat,i)=>({name:chat.title||chat.participants?.items?.filter(p=>!p.isSelf).map(p=>p.fullName||p.displayName||p.name).filter(Boolean).join(', ')||'Chat '+chat.id.slice(-10),conversation_id:chat.id,account_id:chat.accountID,network,chat_type:chat.type,rollout_order:i+1}));
 if(key==='slack')config.channels=entries;else config.groups=entries;
 config.connection='beeper_desktop';config.verified_at=new Date().toISOString();config.connected_accounts=accounts.map(a=>a.accountID);
 const identity=profiles.length===1?profiles[0]:{profiles};
 const encrypted=(await protect([JSON.stringify(identity)]))[0];
 writeAtomic(path.join(stateDir,key+'-identity.dpapi'),Buffer.from(encrypted,'base64'));
 writeAtomic(configPath,JSON.stringify(config,null,2)+'\n');
 console.log(JSON.stringify({ready:true,network,connectedAccounts:accounts.length,activeConversations:entries.length,groupChats:selected.filter(c=>c.type==='group').length,sideChats:selected.filter(c=>c.type!=='group').length,scopeDays:7,unavailableHistory:chats.filter(c=>c.history_unavailable).length}));
}
if(require.main===module){const network=process.argv.includes('--whatsapp')?'WhatsApp':process.argv.includes('--slack')?'Slack':null;resolveRecent(network).catch(()=>{console.error('Recent chat resolution failed safely; prior source inventory retained.');process.exitCode=1;});}
module.exports={selectRecentChats,profilesFor,hydrateActivity,resolveRecent};
