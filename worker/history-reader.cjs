async function readHistory(page,{checkpoint=null,historyStart,maxPages=3000}){
 const cutoff=Date.parse(historyStart);if(!Number.isFinite(cutoff))throw Error('Invalid history boundary');
 const first=await page(),seen=new Map();let pages=1;
 function append(data){
  if(!Array.isArray(data.items))throw Error('Invalid Beeper message page');
  for(const m of data.items){if(!m.id||!Number.isFinite(Date.parse(m.timestamp)))throw Error('Invalid source message identity or timestamp');if(Date.parse(m.timestamp)>=cutoff)seen.set(m.id,m);}
 }
 append(first);
 if(checkpoint?.cursor){
  let cursor=checkpoint.cursor;
  while(true){
   if(pages>=maxPages)throw Error('History page limit reached; checkpoint not advanced');
   const data=await page(cursor,'after');pages++;append(data);
   if(!data.hasMore||!data.items.length)break;
   if(!data.newestCursor||data.newestCursor===cursor)throw Error('Pagination stopped advancing');cursor=data.newestCursor;
  }
 }else{
  let data=first;
  while(data.hasMore&&data.items.length&&data.items.every(m=>Date.parse(m.timestamp)>=cutoff)){
   if(pages>=maxPages)throw Error('History page limit reached; checkpoint not advanced');
   if(!data.oldestCursor)throw Error('Missing older-history cursor');
   const prior=data.oldestCursor;data=await page(prior,'before');pages++;append(data);
   if(data.hasMore&&data.items.length&&data.oldestCursor===prior)throw Error('Pagination stopped advancing');
  }
 }
 const cursor=first.newestCursor||checkpoint?.cursor;if(!cursor)throw Error('Missing source checkpoint cursor');
 return {messages:[...seen.values()],cursor,pages};
}
module.exports={readHistory};
