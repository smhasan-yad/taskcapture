const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'capture-deployment-test-'));
try{
 const source=path.join(dir,'source'),state=path.join(dir,'state'),runtime=path.join(state,'runtime');
 for(const folder of [path.join(source,'worker'),path.join(source,'config'),state])fs.mkdirSync(folder,{recursive:true});
 fs.copyFileSync(path.resolve(__dirname,'../Deploy-Runtime.ps1'),path.join(source,'Deploy-Runtime.ps1'));
 const codeFiles=['Run-Capture.ps1','Notify-Failure.ps1','Verify-State.ps1','Install-Schedule.ps1','worker/synthetic.cjs','worker/task-schema.json'];
 for(const file of codeFiles)fs.writeFileSync(path.join(source,file),'synthetic code version one','utf8');
 const configs={
  'runtime.json':{enabled:false,first_live_run_approved:false,schedule_registered:false,task_name:'Synthetic Task'},
  'ticktick-destination.json':{enabled:false,project_id:'SYNTHETIC_DESTINATION'},
  'slack-allowlist.json':{enabled:false,channels:[]},
  'whatsapp-allowlist.json':{enabled:false,groups:[]}
 };
 for(const [name,value] of Object.entries(configs))fs.writeFileSync(path.join(source,'config',name),JSON.stringify(value),'utf8');
 fs.writeFileSync(path.join(source,'config','ignored.example.json'),'{}','utf8');
 const database=path.join(state,'capture.sqlite');fs.writeFileSync(database,'synthetic database sentinel','utf8');
 const deploy=()=>spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',path.join(source,'Deploy-Runtime.ps1'),'-StatePath',state],{encoding:'utf8',windowsHide:true,timeout:30000});
 assert.equal(deploy().status,0,'First deployment must succeed');
 assert.equal(fs.existsSync(path.join(runtime,'config','ignored.example.json')),false,'Do not deploy examples');
 const installed=new Map();
 for(const name of Object.keys(configs)){
  const value={...configs[name],installed_marker:'synthetic installed setting'};
  if(name==='runtime.json'){value.task_name='Existing Custom Task';value.schedule_registered=true;}
  if(name==='ticktick-destination.json')value.project_id='SYNTHETIC_INSTALLED_DESTINATION';
  if(name==='slack-allowlist.json')value.channels=[{name:'Synthetic Discovered Channel',conversation_id:'synthetic-slack-chat'}];
  const bytes=Buffer.from('\ufeff'+JSON.stringify(value,null,2)+'\r\n','utf8');
  fs.writeFileSync(path.join(runtime,'config',name),bytes);installed.set(name,bytes);
 }
 fs.writeFileSync(path.join(source,'config','ticktick-destination.json'),'{"enabled":false,"project_id":"YOUR_TICKTICK_PROJECT_ID"}','utf8');
 fs.writeFileSync(path.join(source,'config','additional.json'),'{"enabled":false}','utf8');
 fs.writeFileSync(path.join(source,'worker','synthetic.cjs'),'synthetic code version two','utf8');
 assert.equal(deploy().status,0,'Disabled runtime redeployment must succeed');
 for(const [name,bytes] of installed)assert.deepEqual(fs.readFileSync(path.join(runtime,'config',name)),bytes,'Redeployment must preserve installed '+name+' byte for byte');
 assert.equal(fs.readFileSync(path.join(runtime,'worker','synthetic.cjs'),'utf8'),'synthetic code version two','Code must update');
 assert.equal(fs.readFileSync(path.join(runtime,'config','additional.json'),'utf8'),'{"enabled":false}','Missing config must be installed');
 assert.equal(fs.readFileSync(database,'utf8'),'synthetic database sentinel','State must remain untouched');
 assert.equal(deploy().status,0,'Repeated deployment must succeed');
 for(const [name,bytes] of installed)assert.deepEqual(fs.readFileSync(path.join(runtime,'config',name)),bytes,'Repeated deployment must preserve settings');
 fs.writeFileSync(path.join(runtime,'config','runtime.json'),'{"enabled":true}','utf8');
 fs.writeFileSync(path.join(source,'worker','synthetic.cjs'),'must not deploy while enabled','utf8');
 assert.notEqual(deploy().status,0,'Enabled runtime deployment must be refused');
 assert.equal(fs.readFileSync(path.join(runtime,'worker','synthetic.cjs'),'utf8'),'synthetic code version two');
 console.log('PASS: real PowerShell deployment preserves installed settings byte for byte, installs missing config, updates code, excludes examples and refuses enabled runtimes. No live state or connector calls.');
}finally{
 if(path.dirname(dir)!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('capture-deployment-test-'))throw Error('Cleanup escaped temp fixture');
 fs.rmSync(dir,{recursive:true,force:true});
}
