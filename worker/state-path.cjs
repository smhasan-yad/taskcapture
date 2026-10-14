const path=require('node:path');
function resolveState(env=process.env){
 if(!env.TASKCAPTURE_STATE&&!env.USERPROFILE)throw Error('Windows user profile is unavailable');
 const root=env.TASKCAPTURE_STATE||path.join(env.USERPROFILE,'TaskCaptureState');
 if(!path.isAbsolute(root))throw Error('TASKCAPTURE_STATE must be an absolute path');
 return path.resolve(root);
}
module.exports={resolveState,stateDir:resolveState()};
