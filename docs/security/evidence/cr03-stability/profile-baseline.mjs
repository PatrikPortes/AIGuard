const {matchingRepresentation,fraudAgent} = await import(process.argv[2] === 'current' ? '../../../../src/analysis.js' : './baseline-analysis.mjs');
import {performance} from 'node:perf_hooks';
const names=['new-number-tail','new-number-repeated','login-prefixes','digits','money-prefixes','urgency-prefixes','investment-prefixes','NFKC-Arabic-expansion'];
const corpus=['ztrati'+'l'.repeat(9994),'ztrati'.repeat(1666),'prihlaste'.repeat(1111),'9'.repeat(10000),'posli '.repeat(1666),'dnes '.repeat(2000),'garantovan'.repeat(1000),'\uFDFA'.repeat(3000)];
for(let i=0;i<20;i++){let c=corpus[i%8],m=matchingRepresentation(c);fraudAgent({content:c,type:'text',matching:m});}
const rows=[];
for(let i=0;i<2400;i++){
 let c=corpus[i%8],p=process.cpuUsage(),t=process.threadCpuUsage(),started=performance.now();
 const m=matchingRepresentation(c);const ncpu=process.cpuUsage(p),nt=process.threadCpuUsage(t);const endN=performance.now();
 p=process.cpuUsage();t=process.threadCpuUsage();fraudAgent({content:c,type:'text',matching:m});const rcpu=process.cpuUsage(p),rt=process.threadCpuUsage(t);
 rows.push({i,input:names[i%8],normalizationCPU:(ncpu.user+ncpu.system)/1000,normalizationThreadCPU:(nt.user+nt.system)/1000,rulesCPU:(rcpu.user+rcpu.system)/1000,rulesThreadCPU:(rt.user+rt.system)/1000,start_ms:started,norm_end_ms:endN,end_ms:performance.now()});
}
console.log('PHASE_JSON '+JSON.stringify(rows));
