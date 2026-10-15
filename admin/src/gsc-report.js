// Stage 10 (S10.3): read-only report for GET /api/seo, computed from SQLite only (Google is never
// called while serving a request). CTR and average position are derived from the aggregates.
import {ensureGscSchema,CHECKER_PATHS,OTHER_PATH,DEVICES,lastStoredDay,latestSync,lastSuccess,meta} from './gsc-store.js';

export const PERIODS=Object.freeze([7,28,90]);
const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function totals(rows){
 const clicks=rows.reduce((s,r)=>s+r.clicks,0),impressions=rows.reduce((s,r)=>s+r.impressions,0);
 const weighted=rows.reduce((s,r)=>s+(r.position??0)*r.impressions,0);
 return {clicks,impressions,ctr:impressions?clicks/impressions:null,position:impressions?weighted/impressions:null};
}
function grouped(rows,key){
 const map=new Map();for(const r of rows){const k=r[key];if(!map.has(k))map.set(k,[]);map.get(k).push(r);}
 return [...map].map(([k,list])=>({[key]:k,...totals(list)}));
}
const rank=(a,b)=>b.clicks-a.clicks||b.impressions-a.impressions;

export function seoReport(db,{days,configured,setupError=null}){
 if(!PERIODS.includes(days))throw Error('invalid_days');
 ensureGscSchema(db);
 const sync=latestSync(db),ok=lastSuccess(db);
 const base={days,configured,setupError,sync:sync?{finished:sync.finished,status:sync.status,error:sync.error}:null,lastSuccess:ok?.finished??null};
 if(!configured)return {...base,status:'not_configured'};
 const last=lastStoredDay(db);
 if(!last)return {...base,status:ok?'no_data':(sync?.status==='error'?'unavailable':'pending')};
 const to=last,from=addDays(to,-(days-1)),prevTo=addDays(from,-1),prevFrom=addDays(from,-days);
 const rangeStart=meta(db,'range_start');
 const between=(table,a,b)=>db.prepare(`SELECT * FROM ${table} WHERE day BETWEEN ? AND ? ORDER BY day`).all(a,b);
 const daily=between('gsc_daily',from,to),previous=between('gsc_daily',prevFrom,prevTo);
 const byDay=new Map(daily.map(r=>[r.day,r]));
 const series=Array.from({length:days},(_,i)=>{const d=addDays(from,i),r=byDay.get(d);return r?{day:d,clicks:r.clicks,impressions:r.impressions}:{day:d,missing:true};});
 const pages=grouped(between('gsc_daily_page',from,to),'path');
 const checkers=[...Object.entries(CHECKER_PATHS).map(([path,label])=>{const p=pages.find(x=>x.path===path);return {path,label,...(p?{clicks:p.clicks,impressions:p.impressions,ctr:p.ctr,position:p.position}:{clicks:0,impressions:0,ctr:null,position:null,missing:true})};}),
  (()=>{const rest=pages.filter(p=>!CHECKER_PATHS[p.path]);const t=totals(rest.map(r=>({clicks:r.clicks,impressions:r.impressions,position:r.position})));return {path:null,label:'Ostatní stránky',...t,...(rest.length?{}:{missing:true})};})()];
 const devices=grouped(between('gsc_daily_device',from,to),'device').filter(d=>DEVICES.includes(d.device)).sort(rank);
 const queries=db.prepare('SELECT query,clicks,impressions,position,end_day FROM gsc_query_window WHERE days=? ORDER BY clicks DESC,impressions DESC LIMIT 20').all(days)
  .map(q=>({query:q.query,clicks:q.clicks,impressions:q.impressions,ctr:q.impressions?q.clicks/q.impressions:null,position:q.position,endDay:q.end_day}));
 return {...base,
  status:daily.length?'available':'no_data',
  lastDay:last,final:daily.every(r=>r.final===1),
  period:{from,to,...totals(daily),reportedDays:daily.length},
  // A comparison is shown only if the whole previous period was requested from Google.
  previous:rangeStart&&rangeStart<=prevFrom?{from:prevFrom,to:prevTo,...totals(previous),reportedDays:previous.length}:null,
  daily:series,checkers,
  pages:pages.filter(p=>p.path!==OTHER_PATH).sort(rank).slice(0,10),
  queries,devices};
}
