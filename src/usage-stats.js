import {Worker}from'node:worker_threads';
export function completedMode(input,result){
 if(input.topic==='loan')return null;
 if(result.engine==='rules+ai-v1')return 'ai';
 if(result.engine!=='rules-v1')return null;
 return result.ai_status==='not_performed'&&result.ai_fallback_reason!=='declined'?'fallback':'rules';
}
export function countOnFinish(res,input,result,stats){
 const mode=completedMode(input,result);if(!mode||!stats)return;
 res.once('finish',()=>{if(res.statusCode===200&&res.writableFinished){try{stats.record(mode);}catch{/* Statistics cannot alter a completed response. */}}});
}
export function createUsageStats({db,snapshot}){
 if(!db||!snapshot)return undefined;
 let worker,pending=0,active=true;
 try{worker=new Worker(new URL('./usage-stats-worker.js',import.meta.url),{workerData:{db,snapshot},resourceLimits:{maxOldGenerationSizeMb:32}});}catch{return undefined;}
 worker.on('error',()=>{active=false;});worker.on('exit',()=>{active=false;});worker.on('message',()=>{pending=Math.max(0,pending-1);});worker.unref();
 return{record(mode){if(!active||pending>=64)return;try{worker.postMessage(mode);pending++;}catch{active=false;}},close(){active=false;return worker.terminate();}};
}
