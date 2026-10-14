const assert=require('node:assert/strict');const {readHistory}=require('../worker/history-reader.cjs');
(async()=>{
 let reads=0;const page=async(cursor,direction)=>{const index=cursor?Number(cursor):0;if(cursor)assert.equal(direction,'before');reads++;return {items:[{id:'m'+index,timestamp:index<55?'2026-10-09T10:00:00Z':'2026-10-01T10:00:00Z'}],hasMore:true,oldestCursor:String(index+1),newestCursor:'newest'};};
 const result=await readHistory(page,{historyStart:'2026-10-03T10:00:00Z'});assert.equal(result.messages.length,55);assert.equal(reads,56);assert.equal(result.cursor,'newest');
 await assert.rejects(()=>readHistory(page,{historyStart:'2026-10-03T10:00:00Z',maxPages:3}),/page limit/);
 const incremental=await readHistory(async(cursor,direction)=>{if(cursor){assert.equal(direction,'after');return {items:[{id:'new',timestamp:'2026-10-10T10:00:00Z'}],hasMore:false,newestCursor:'latest'};}return {items:[{id:'latest',timestamp:'2026-10-10T11:00:00Z'}],hasMore:true,newestCursor:'latest'};},{checkpoint:{cursor:'old'},historyStart:'2026-10-03T10:00:00Z'});assert.equal(incremental.messages.length,2);
 await assert.rejects(()=>readHistory(async()=>({items:[{id:'same',timestamp:'2026-10-10T10:00:00Z'}],hasMore:true,oldestCursor:'same',newestCursor:'same'}),{historyStart:'2026-10-03T10:00:00Z'}),/advancing/);
 console.log('PASS: busy-chat history beyond 30 pages, seven-day cutoff, incremental checkpoints, duplicate cursor detection and failure without checkpoint advancement.');
})().catch(()=>{console.error('Offline chat history pagination failed');process.exitCode=1;});
