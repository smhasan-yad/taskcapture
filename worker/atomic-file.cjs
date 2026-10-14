const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function writeAtomic(file,data){
 const temporary=path.join(path.dirname(file),'.'+path.basename(file)+'.'+crypto.randomUUID()+'.tmp');
 try{fs.writeFileSync(temporary,data,{encoding:'utf8',flag:'wx'});fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
module.exports={writeAtomic};
