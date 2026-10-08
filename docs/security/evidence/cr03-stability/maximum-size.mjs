import {analyze,matchingRepresentation} from '../../../../src/analysis.js';
import {validateInput} from '../../../../src/ai/pipeline.js';
const patterns={digits:'9',money:'posli ',urgency:'dnes ',credentials:'prihlaste',newNumber:'ztratil',accentedTokens:'é ',mixedTokens:'pа ',GreekTokens:'α '};
const tests=[];
for(const [name,pattern] of Object.entries(patterns)){
 for(const chars of [1000,2500,5000,10000]){
  const content=pattern.repeat(Math.ceil(chars/pattern.length)).slice(0,chars);
  if(Buffer.byteLength(content)>16000)continue;
  tests.push({name,chars,content});
 }
}
tests.push({name:'NFKC-expansion-only',content:'\uFDFA'.repeat(5333)},{name:'NFKC-expansion-plus-Latin-tail',content:'\uFDFA'.repeat(5330)+' dnes posl'});
const records=[];
for(const input of tests){
 const content=input.content,typed={type:'text',content};validateInput(typed);
 const sample=[];
 for(let i=0;i<20;i++)analyze(typed);
 for(let i=0;i<60;i++){const c=process.cpuUsage();analyze(typed);const d=process.cpuUsage(c);sample.push((d.user+d.system)/1000);}
 const ordered=[...sample].sort((a,b)=>a-b);records.push({name:input.name,chars:content.length,bytes:Buffer.byteLength(content),matchingChars:matchingRepresentation(content).content.length,minCPU:ordered[0],medianCPU:(ordered[29]+ordered[30])/2,p95CPU:ordered[56],maxCPU:ordered.at(-1),over20:sample.filter(x=>x>20).length});
}
console.log(JSON.stringify({runsPerCase:60,cases:records},null,2));
