const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const state=fs.mkdtempSync(path.join(os.tmpdir(),'capture-protocol-test-'));process.env.TASKCAPTURE_STATE=state;
const {TickTickClient}=require('../worker/ticktick-client.cjs');
(async()=>{
 const title='\u062d\u0633\u0646 \u2192 '.repeat(18000);const methods=[];
 const client=new TickTickClient({spawnProcess:()=>{
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
  child.stdin=new Writable({write(chunk,encoding,done){
   const request=JSON.parse(chunk.toString());methods.push(request.method);
   if(request.id===undefined){done();return;}
   let result;
   if(request.method==='initialize')result={};
   else if(request.method==='mcpServerStatus/list')result={data:[{name:'ticktick',authStatus:'oAuth',tools:Object.fromEntries(['list_projects','create_task','update_task','get_project_with_undone_tasks'].map(n=>[n,{}]))}]};
   else if(request.method==='thread/start'){assert.equal(request.params.model,undefined);result={thread:{id:'synthetic'}};}
   else if(request.method==='mcpServer/tool/call')result={structuredContent:{tasks:[{id:'synthetic',title}]}};
   else throw Error('Unexpected RPC');
   const bytes=Buffer.from(JSON.stringify({id:request.id,result})+'\n');
   const split=bytes.indexOf(Buffer.from('\u062d'))+1;
   queueMicrotask(()=>{child.stdout.write(bytes.subarray(0,split));for(let i=split;i<bytes.length;i+=32768)child.stdout.write(bytes.subarray(i,i+32768));});done();
  }});return child;
 }});
 try{await client.start();assert.equal((await client.listTasks('synthetic'))[0].title,title);assert(!methods.includes('turn/start'));console.log('PASS: mocked TickTick RPC preserves large split UTF-8 responses; no model name, model turn or live connector call.');}finally{client.close();if(path.dirname(state)!==path.resolve(os.tmpdir()))throw Error('Test cleanup escaped temp root');fs.rmSync(state,{recursive:true,force:true});}
})().catch(()=>{console.error('Offline protocol test failed.');process.exitCode=1;});
