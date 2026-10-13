import{readFile}from'node:fs/promises';
const day=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
const offset=(today,n)=>new Date(Date.parse(today+'T12:00:00Z')-n*86400000).toISOString().slice(0,10);
export async function usageSummary(path,now=Date.now()){
 if(!path)return{status:'unavailable'};
 try{
  const bytes=await readFile(path);if(bytes.length>131072)throw Error();const s=JSON.parse(bytes.toString());const today=day(now);
  if(s.version!==1||!Number.isSafeInteger(s.updated)||s.updated>now+60000||!/^\d{4}-\d{2}-\d{2}$/.test(s.startedDay)||s.startedDay>today||!Array.isArray(s.days)||s.days.length>400)throw Error();
  const rows=new Map();for(const r of s.days){if(!/^\d{4}-\d{2}-\d{2}$/.test(r.day)||r.day<s.startedDay||r.day>today||rows.has(r.day)||!['rules','ai','fallback'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0))throw Error();rows.set(r.day,{rules:r.rules,ai:r.ai,fallback:r.fallback});}
  const series=Array.from({length:30},(_,i)=>{const d=offset(today,29-i);const r=d<s.startedDay?null:(rows.get(d)||{rules:0,ai:0,fallback:0});return{day:d,...(r?{...r,total:r.rules+r.ai+r.fallback}:{total:null})};});
  const totals=n=>{const range=series.slice(-n);return{days:n,partial:range.some(r=>r.total===null),...Object.fromEntries(['rules','ai','fallback','total'].map(k=>[k,range.reduce((sum,r)=>sum+(r[k]||0),0)]))};};
  return{status:now-s.updated>180000?'stale':'available',updated:s.updated,startedDay:s.startedDay,today:totals(1),week:totals(7),month:totals(30),series};
 }catch{return{status:'unavailable'};}
}
