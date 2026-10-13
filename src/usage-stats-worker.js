import {parentPort,workerData}from'node:worker_threads';import{UsageStore}from'./usage-stats-store.js';
const store=new UsageStore(workerData.db);
const publish=()=>{try{store.export(workerData.snapshot);}catch{/* No content, identities or errors are logged. */}};
publish();const timer=setInterval(publish,60000);timer.unref();
parentPort.on('message',mode=>{try{store.record(mode);publish();}catch{/* Best-effort metrics never fail a request. */}finally{parentPort.postMessage('ack');}});
