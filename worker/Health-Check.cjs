const fs=require('node:fs'),path=require('node:path');
const {stateDir}=require('./state-path.cjs');
const {TickTickClient}=require('./ticktick-client.cjs');
async function healthCheck(client=new TickTickClient()){
 const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<16))throw Error('Node.js 22.16 or newer is required');
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../config/ticktick-destination.json'),'utf8').replace(/^\uFEFF/,''));
 if(!fs.existsSync(path.join(stateDir,'capture.sqlite')))throw Error('Configured state database is missing');
 try{
  await client.start();
  const models=await client.rpc("model/list",{limit:100,includeHidden:false});
  if(!models.data?.some(m=>(m.model||m.id)===(config.extraction_model||"gpt-6-sol")&&m.supportedReasoningEfforts?.some(e=>e.reasoningEffort===(config.reasoning_effort||"low"))))throw Error("Configured extraction model or effort unavailable");
  const projects=await client.call('list_projects',{});
  if(!Array.isArray(projects.result)||!projects.result.some(p=>p.id===config.project_id&&p.name===config.project_name))throw Error('Destination identity mismatch');
  const tasks=await client.listTasks(config.project_id);if(!Array.isArray(tasks))throw Error('Task protocol mismatch');
  return {ticktickHealthy:true,ticktickWrites:0,modelCalled:false};
 }finally{client.close();}
}
if(require.main===module)healthCheck().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('TickTick health check failed: verify Codex CLI compatibility and TickTick sign-in. No capture was started.');process.exitCode=1;});
module.exports={healthCheck};
