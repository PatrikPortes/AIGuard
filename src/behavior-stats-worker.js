// Stage 12 A1: behaviour statistics worker. Receives aggregated batches (never single requests),
// writes them in one transaction, applies retention and publishes the read-only snapshot.
import {parentPort,workerData} from 'node:worker_threads';
import {BehaviorStore} from './behavior-stats-store.js';
const store=new BehaviorStore(workerData.db);
let published=0;
const publish=(force=false)=>{if(!force&&Date.now()-published<30000)return;published=Date.now();try{store.export(workerData.snapshot);}catch{/* Aggregates only; nothing is logged. */}};
const maintain=()=>{try{store.prune();}catch{}publish(true);};
maintain();const timer=setInterval(maintain,3600000);timer.unref();
parentPort.on('message',message=>{
 if(message==='close'){clearInterval(timer);publish(true);try{store.close();}catch{}parentPort.close();return;}
 let ok=true;try{store.apply(message?.rows);publish();}catch{ok=false;}
 parentPort.postMessage(ok?'ack':'fail');
});
