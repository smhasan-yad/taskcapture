const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const {stateDir}=require('./intake-store.cjs');
const safeOperations=new Set(['initialize','mcpServerStatus/list','thread/start','model/list','list_projects','get_project_with_undone_tasks','create_task','get_task_by_id','update_task']);
function connectorError(code,message,operation){const error=new Error(message);error.code=code;if(safeOperations.has(operation))error.operation=operation;return error;}
class TickTickClient{
 constructor({spawnProcess=spawn,requestTimeoutMs=45000}={}){this.spawnProcess=spawnProcess;this.requestTimeoutMs=requestTimeoutMs;this.pending=new Map();this.next=0;this.buffer='';this.threadId=null;this.closed=false;}
 rejectPending(code,message){for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(connectorError(code,message,item.operation));}this.pending.clear();}
 async start(){
  const cwd=path.join(stateDir,'ticktick-worker');fs.mkdirSync(cwd,{recursive:true});
  const binary=process.env.TASKCAPTURE_CODEX||path.join(process.env.USERPROFILE,'AppData/Local/Programs/OpenAI/Codex/bin/codex.exe');
  this.closed=false;
  this.child=this.spawnProcess(binary,['app-server','--stdio','-c','mcp_servers.node_repl.enabled=false'],{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});
  this.child.stdout.setEncoding('utf8');
  this.child.stderr.on('data',()=>{});
  this.child.stdin.on('error',()=>{this.closed=true;this.rejectPending('ticktick_pipe_failed','TickTick connector pipe failed');});
  this.child.stdout.on('data',chunk=>{this.buffer+=chunk;if(this.buffer.length>8*1024*1024){this.close();return;}let index;while((index=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,index);this.buffer=this.buffer.slice(index+1);try{const msg=JSON.parse(line);const item=this.pending.get(msg.id);if(item){this.pending.delete(msg.id);clearTimeout(item.timer);msg.error?item.reject(connectorError('ticktick_protocol_failed','TickTick protocol request failed',item.operation)):item.resolve(msg.result);}else if(msg.id!==undefined&&msg.method&&!this.closed){this.child.stdin.write(JSON.stringify({id:msg.id,error:{code:-32000,message:'Human authorization required'}})+'\n');}}catch{}}});
  this.child.on('exit',()=>{this.closed=true;this.rejectPending('ticktick_connector_stopped','TickTick connector stopped');});
  this.child.on('error',()=>{this.closed=true;this.rejectPending('ticktick_connector_unavailable','TickTick connector unavailable');});
  await this.rpc('initialize',{clientInfo:{name:'task_capture_worker',version:'1.0'},capabilities:{experimentalApi:true}});
  this.child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
  const inventory=await this.rpc('mcpServerStatus/list',{limit:50,detail:'toolsAndAuthOnly'});
  const tick=(inventory.data||[]).find(s=>s.name==='ticktick');
  if(!tick||tick.authStatus!=='oAuth'||tick.toolsError||!['list_projects','create_task','update_task','get_project_with_undone_tasks'].every(name=>tick.tools?.[name]))throw new Error('TickTick authorization or tool discovery is unavailable');
  const thread=await this.rpc('thread/start',{cwd,ephemeral:true,sandbox:'read-only',approvalPolicy:'on-request'});
  this.threadId=thread.thread.id;return this;
 }
 rpc(method,params){
  const operation=method==='mcpServer/tool/call'?params?.tool:method;
  if(this.closed||!this.child||this.child.stdin.destroyed||this.child.stdin.writableEnded)return Promise.reject(connectorError('ticktick_connector_stopped','TickTick connector stopped',operation));
  return new Promise((resolve,reject)=>{
   const id=++this.next;
   const fail=()=>{const item=this.pending.get(id);if(!item)return;clearTimeout(item.timer);this.pending.delete(id);item.reject(connectorError('ticktick_pipe_failed','TickTick connector pipe failed',operation));};
   const timer=setTimeout(()=>{this.pending.delete(id);reject(connectorError('ticktick_timeout','TickTick request timed out',operation));},this.requestTimeoutMs);
   this.pending.set(id,{resolve,reject,timer,operation});
   try{this.child.stdin.write(JSON.stringify({id,method,params})+'\n',error=>{if(error)fail();});}catch{fail();}
  });
 }
 async call(tool,args){
  const allowed=['list_projects','get_project_with_undone_tasks','create_task','get_task_by_id','update_task'];
  if(!allowed.includes(tool))throw new Error('TickTick tool is not allowed in the task worker');
  const result=await this.rpc('mcpServer/tool/call',{threadId:this.threadId,server:'ticktick',tool,arguments:args});
  if(result.isError||!result.structuredContent)throw new Error('TickTick operation failed; an uncertain write must be reconciled');
  return result.structuredContent;
 }
 async listTasks(projectId){return (await this.call('get_project_with_undone_tasks',{project_id:projectId})).tasks||[];}
 close(){
  this.closed=true;
  if(this.child?.pid){spawn('taskkill.exe',['/PID',String(this.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});this.child.kill();}
  this.rejectPending('ticktick_connector_closed','TickTick connector closed');
 }
}
module.exports={TickTickClient};
