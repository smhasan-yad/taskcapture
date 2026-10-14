const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'capture-runner-test-'));
const quote=s=>"'"+s.replaceAll("'","''")+"'";
try{
 for(const fail of ['none','whatsapp_intake','whatsapp_resolution','slack_resolution','ticktick_health']){
  const state=path.join(root,fail),calls=path.join(root,fail+'-calls.txt');
  const script="& "+quote(path.resolve(__dirname,'../Run-Capture.ps1'))+" -Live -SuppressToast -StatePath "+quote(state)+" -StepExecutor { param($stage,$script,$stepParams) Add-Content -LiteralPath "+quote(calls)+" -Value ($stage+' '+$script+' '+($stepParams -join ',')) -Encoding utf8; if ($stage -eq "+quote(fail)+") {return 1}; return 0 }";
  const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,encoding:'utf8',timeout:30000});
  assert.equal(run.status,fail==='none'?0:1,run.stderr);
  const lines=fs.readFileSync(calls,'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/),stages=lines.map(x=>x.split(' ')[0]);
  if(fail==='ticktick_health')assert.deepEqual(stages,['temporary_cleanup','ticktick_health']);
  else{assert.equal(stages.includes('whatsapp_intake'),fail!=='whatsapp_resolution');assert(stages.includes('queue_processing'));assert.equal(stages.includes('slack_intake'),fail!=='slack_resolution');if(fail!=='whatsapp_resolution')assert(lines.find(x=>x.startsWith('whatsapp_intake')).includes('--all-approved'));assert(lines.find(x=>x.startsWith('slack_resolution')).includes('--slack'));assert(lines.find(x=>x.startsWith('whatsapp_resolution')).includes('--whatsapp'));}
 }
 console.log('PASS: real PowerShell runner with mocked steps; independent source failures, health preflight, both groups and queued-data processing. No capture/model/TickTick calls.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
