const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const csrf = crypto.randomBytes(32).toString('hex');
const {stateDir}=require('./state-path.cjs');
const {writeAtomic}=require('./atomic-file.cjs');
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Beeper connection for Task Capture</title><style>body{font:17px system-ui;margin:48px auto;max-width:620px;padding:24px;background:#f5f7fa;color:#172033}h1{font-size:28px}input{display:block;box-sizing:border-box;width:100%;padding:12px;margin:12px 0;border:1px solid #8a96aa;border-radius:8px}button{padding:12px 20px;background:#155eef;color:white;border:0;border-radius:8px;font:inherit}p{line-height:1.6}#status{white-space:pre-wrap}</style><h1>Connect Beeper to Task Capture</h1><p>In Beeper, open <b>Settings → Integrations</b>. Under <b>Approved connections</b>, click <b>+</b> and create a connection named <b>TaskCapture</b>.</p><p>Paste its access token below. This page sends it only to the local setup on this PC. It is checked with Beeper and stored encrypted under your Windows account.</p><form id="form"><label for="token">Beeper access token</label><input id="token" type="password" autocomplete="off" required maxlength="8192"><button id="save">Verify and save locally</button></form><p id="status" role="status"></p><script>document.getElementById('form').onsubmit=async e=>{e.preventDefault();const b=document.getElementById('save');const s=document.getElementById('status');b.disabled=true;s.textContent='Checking connection…';try{const r=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf:'${csrf}',token:document.getElementById('token').value})});const j=await r.json();s.textContent=j.message;if(r.ok){document.getElementById('token').value='';document.getElementById('form').hidden=true;}else b.disabled=false;}catch{x=s.textContent='Unable to save. Check that the local setup is running.';b.disabled=false;}}</script></html>`;
function protect(token) {
 return new Promise((resolve,reject)=>{
  const command = "Add-Type -AssemblyName System.Security; $taskToken=[Console]::In.ReadToEnd(); $taskBytes=[Text.Encoding]::UTF8.GetBytes($taskToken); $taskProtected=[Security.Cryptography.ProtectedData]::Protect($taskBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($taskProtected))";
  const child = spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let data=''; child.stdout.on('data',c=>data+=c);
  child.stderr.on('data',()=>{});
  child.on('error',()=>reject(new Error('Encryption process could not start.')));
  const timeout = setTimeout(()=>{child.kill();reject(new Error('Encryption timed out.'));},15000);
  child.on('close',code=>{clearTimeout(timeout);if(code!==0)reject(new Error('Windows encryption failed.'));else resolve(Buffer.from(data.trim(),'base64'));});
  child.stdin.end(token);
 });
}
function reply(res,status,message) { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({message})); }
const server = http.createServer(async (req,res)=>{
 const allowedHosts=['127.0.0.1:5681','localhost:5681'];
 if(!allowedHosts.includes(req.headers.host))return reply(res,403,'Invalid local host.');
 if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});return res.end(page);}
 if(req.method!=='POST'||req.url!=='/save')return reply(res,404,'Not found.');
 if(!['http://127.0.0.1:5681','http://localhost:5681'].includes(req.headers.origin))return reply(res,403,'Local page required.');
 let data=''; for await(const chunk of req){data+=chunk;if(data.length>12000)return reply(res,413,'Token is too long.');}
 try {
  const body=JSON.parse(data);
  if(body.csrf!==csrf||typeof body.token!=='string'||!body.token.trim())return reply(res,400,'Please enter the Beeper access token.');
  const token=body.token.trim();
  const check=await fetch('http://127.0.0.1:23373/oauth/introspect',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token,token_type_hint:'access_token'}),signal:AbortSignal.timeout(10000)});
  if(!check.ok)return reply(res,400,'Beeper could not validate this token. Check that it is running and that you copied the connection token.');
  const info=await check.json();if(info.active!==true)return reply(res,400,'This token is not active. Create or copy the token again in Beeper.');
  const encrypted=await protect(token);
  fs.mkdirSync(stateDir,{recursive:true});
  writeAtomic(path.join(stateDir,'beeper-token.dpapi'),encrypted);
  reply(res,200,'Beeper connection verified and saved locally. Return to your setup instructions once the token is saved.');
  console.log('Beeper token verified and encrypted locally. No token value logged.');
  server.close();setTimeout(()=>process.exit(0),2000);
 }catch{return reply(res,400,'Connection could not be checked. Keep Beeper open and try again.');}
});
server.listen(5681,'127.0.0.1',()=>console.log('Local Beeper token setup: http://localhost:5681'));
