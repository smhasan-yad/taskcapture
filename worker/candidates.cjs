const namesDefault=['Hasan','Hassan','Hassaan','Hasaan','حسن','حسان'];
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function normalized(text){return text.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').toLowerCase();}
function nameMention(text,aliases=namesDefault){
 return aliases.filter(x=>typeof x==='string'&&x.trim()).some(alias=>new RegExp('(?:^|[^\\p{L}\\p{N}])'+escape(normalized(alias.trim()))+'(?=$|[^\\p{L}\\p{N}])','u').test(text));
}
const englishRequest=/(?:\b(?:can|could|would|will)\s+(?:you|u|someone|anyone|we)\b|\b(?:please|pls|plz|kindly|need you to|need your help|assigned to you|for your (?:review|approval)|your (?:feedback|input|approval))\b|\b(?:need|needs|must|should|have to|we need to)\s+(?:to\s+)?(?:check|review|fix|send|share|update|test(?!\s+results\b)|deploy|build|arrange|schedule|discuss|complete|resolve|follow up)\b|(?:^|[\n.!?]\s*)(?:check|review|fix|send|share|update|test(?!\s+results\b)|deploy|build|arrange|schedule|call|meet|please|follow up|look into|take a look)\b)/i;
const romanRequest=/(?:\b(?:kar|kr|ker|krr)(?:na|do|dena|daina|dein|dain|dijiye|lo|en|ein)?\s*(?:na|do|dena|daina|dein|dain|dijiye|lo|sakte|saktay|sakta|sakti|sken|sakein|sakenge|dengay|denge|diya|dia)?\b|\b(?:kardo|krdo|karna|krna|karein|karen|kardein|krdein|kardena|krdena|karlena|kijiye|keejiye)\b|\b(?:dekh|daikh|dekho|daikho|dekhna|check|bhej|bhijwa|bata|bta|batayein|bataein|btayein|btaein|batao|btado|bhejo|bhejna|bhijwana|bhijwao|banana|banayein|lagana|lagayein)\b|\b(?:chahiye|chahye|zaroori|zaruri|meherbani|mehrbani|baraye meherbani)\b)/i;
const urduRequest=/(?:براہ\s*کرم|برائے\s*مہربانی|دیکھ|چیک|بھیج|بتا|کر\s*(?:دیں|دو|لیں|سکتے|سکیں)|کریں|کرنا|چاہیے|بنائیں|ضروری)/u;
function requestLike(text){return englishRequest.test(text)||romanRequest.test(text)||urduRequest.test(text);}
function assessCandidate(message,byKey,mode='strict',aliases=namesDefault){
 if(!message.text||message.is_hidden||message.is_deleted)return {candidate:false,reason:'excluded',strongOwnership:false};
 const text=normalized(message.text);
 if(message.is_self)return {candidate:true,reason:'self',strongOwnership:true};
 if(message.mentions_self)return {candidate:true,reason:'mention',strongOwnership:true};
 if((mode==='intelligent'?nameMention(text,aliases):/\bhasan\b/i.test(text)))return {candidate:true,reason:'name',strongOwnership:true};
 const parent=byKey.get(message.linked_source_key);
 if(parent?.is_self===true&&parent.account_id===message.account_id&&parent.conversation_id===message.conversation_id&&!parent.is_deleted&&!parent.is_hidden)return {candidate:true,reason:'reply',strongOwnership:true};
 if(mode==='intelligent'){const requested=requestLike(text);return {candidate:requested,reason:requested?(message.is_direct?'direct_request':'group_request'):'none',strongOwnership:requested&&message.is_direct===true};}
 if(mode!=='nearby_requests'||!englishRequest.test(text))return {candidate:false,reason:'none',strongOwnership:false};
 const when=Date.parse(message.timestamp);
 const previous=[...byKey.values()].filter(m=>m.conversation_id===message.conversation_id&&m.account_id===message.account_id&&Date.parse(m.timestamp)<when&&when-Date.parse(m.timestamp)<=300000).sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)).slice(0,2);
 return {candidate:previous.some(m=>m.is_self&&!m.is_deleted&&!m.is_hidden),reason:'nearby',strongOwnership:false};
}
function candidate(message,byKey,mode='strict',aliases=namesDefault){return assessCandidate(message,byKey,mode,aliases).candidate;}
module.exports={candidate,assessCandidate,nameMention,requestLike,namesDefault};
