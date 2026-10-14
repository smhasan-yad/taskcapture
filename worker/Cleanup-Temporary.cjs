const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {stateDir}=require('./state-path.cjs');
function cleanupTemporary(now=Date.now()){
 const lock=path.join(stateDir,'processor.lock');
 if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock,'utf8'));if(!Number.isInteger(pid)||pid<=0)throw Error('Processor lock requires inspection');try{process.kill(pid,0);throw Error('Processor is active');}catch(e){if(e.code!=='ESRCH')throw e;}}
 let removed=0;
 for(const [root,pattern] of [[path.join(stateDir,'temporary'),/^[0-9a-f-]{36}$/i],[os.tmpdir(),/^hasan-task-extraction-[0-9a-f]{32}$/i]]){
  if(!fs.existsSync(root))continue;
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
   if(!entry.isDirectory()||!pattern.test(entry.name))continue;
   const target=path.resolve(root,entry.name);
   if(path.dirname(target)!==path.resolve(root))throw Error('Temporary cleanup target escaped root');
   if(now-fs.statSync(target).mtimeMs<3600000)continue;
   fs.rmSync(target,{recursive:true,force:true});removed++;
  }
 }
 return {temporaryDirectoriesRemoved:removed};
}
if(require.main===module){try{console.log(JSON.stringify(cleanupTemporary()));}catch{console.error('Temporary cleanup stopped: processor may be active or its lock needs inspection.');process.exitCode=1;}}
module.exports={cleanupTemporary};
