const {spawn}=require('node:child_process');
function crypt(operation,values){
 if(!['protect','unprotect'].includes(operation)||!Array.isArray(values))return Promise.reject(new Error('Invalid encryption request'));
 return new Promise((resolve,reject)=>{
  const command="[Console]::InputEncoding=New-Object Text.UTF8Encoding($false); [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false); Add-Type -AssemblyName System.Security; $taskRequest=[Console]::In.ReadToEnd() | ConvertFrom-Json; $taskResults=New-Object System.Collections.Generic.List[string]; foreach($taskValue in $taskRequest.values){if($taskRequest.operation -eq 'protect'){$taskBytes=[Text.Encoding]::UTF8.GetBytes([string]$taskValue);$taskData=[Security.Cryptography.ProtectedData]::Protect($taskBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);$taskResults.Add([Convert]::ToBase64String($taskData))}else{$taskBytes=[Convert]::FromBase64String([string]$taskValue);$taskData=[Security.Cryptography.ProtectedData]::Unprotect($taskBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);$taskResults.Add([Text.Encoding]::UTF8.GetString($taskData))}}; [Console]::Out.Write((ConvertTo-Json -InputObject @($taskResults.ToArray()) -Compress))";
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  child.stdout.setEncoding('utf8');
  let out=''; const timer=setTimeout(()=>{child.kill();reject(new Error('Windows encryption timed out'));},20000);
  child.stdout.on('data',c=>out+=c);child.stderr.on('data',()=>{});
  child.on('error',()=>{clearTimeout(timer);reject(new Error('Windows encryption unavailable'));});
  child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error('Windows encryption failed'));try{const result=JSON.parse(out);if(!Array.isArray(result)||result.length!==values.length)throw Error();resolve(result);}catch{reject(new Error('Invalid encryption response'));}});
  child.stdin.end(JSON.stringify({operation,values}));
 });
}
module.exports={protect:values=>crypt('protect',values),unprotect:values=>crypt('unprotect',values)};
