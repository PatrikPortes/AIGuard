// Stage 12 A1: SQLite store of daily behaviour counters (runs only in the behaviour worker).
// Own database file, separate from the existing usage statistics, so it can never lock or slow
// the completed-check counters. Values are re-validated here and constrained by SQL CHECKs.
import {DatabaseSync} from 'node:sqlite';
import {writeFileSync,renameSync} from 'node:fs';
import {EVENTS,K1,K2,allowed,behaviorDay,isDay,RETENTION} from './behavior-stats-model.js';

const list=values=>values.map(v=>`'${v.replace(/'/g,"''")}'`).join(',');
const shiftDay=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);

export class BehaviorStore{
 constructor(path,clock=Date.now){
  this.clock=clock;this.db=new DatabaseSync(path);
  this.db.exec(`PRAGMA busy_timeout=1000;PRAGMA secure_delete=ON;
   CREATE TABLE IF NOT EXISTS behavior_daily(
    day TEXT NOT NULL CHECK(length(day)=10),
    event TEXT NOT NULL CHECK(event IN (${list(EVENTS)})),
    k1 TEXT NOT NULL CHECK(k1 IN (${list(K1)})),
    k2 TEXT NOT NULL DEFAULT '' CHECK(k2 IN (${list(K2)})),
    n INTEGER NOT NULL CHECK(n BETWEEN 0 AND ${RETENTION.maxCount}),
    PRIMARY KEY(day,event,k1,k2)) WITHOUT ROWID;
   CREATE TABLE IF NOT EXISTS behavior_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  this.db.prepare('INSERT OR IGNORE INTO behavior_meta VALUES(?,?)').run('startedDay',behaviorDay(clock()));
  this.upsert=this.db.prepare(`INSERT INTO behavior_daily(day,event,k1,k2,n) VALUES(?,?,?,?,?)
   ON CONFLICT(day,event,k1,k2) DO UPDATE SET n=MIN(n+excluded.n,${RETENTION.maxCount})`);
 }
 // rows: [[day,event,k1,k2,n],...]; anything outside the vocabulary is dropped, never stored.
 apply(rows){
  if(!Array.isArray(rows)||rows.length>1000)return 0;
  const today=behaviorDay(this.clock()),oldest=shiftDay(today,-RETENTION.days);
  const valid=rows.filter(r=>Array.isArray(r)&&r.length===5&&isDay(r[0])&&r[0]>=oldest&&r[0]<=shiftDay(today,1)&&allowed(r[1],r[2],r[3])&&Number.isSafeInteger(r[4])&&r[4]>0&&r[4]<=RETENTION.maxCount);
  if(!valid.length)return 0;
  this.db.exec('BEGIN IMMEDIATE');
  try{for(const r of valid)this.upsert.run(...r);this.db.exec('COMMIT');}
  catch(e){try{this.db.exec('ROLLBACK');}catch{}throw e;}
  return valid.length;
 }
 // Automatic retention: 400 days of counters, 90 days of bot counts.
 prune(){
  const today=behaviorDay(this.clock());
  this.db.prepare('DELETE FROM behavior_daily WHERE day<?').run(shiftDay(today,-RETENTION.days));
  this.db.prepare("DELETE FROM behavior_daily WHERE event='bot_page_view' AND day<?").run(shiftDay(today,-RETENTION.botDays));
 }
 // Compact snapshot for the admin (read-only mount): last 190 days, values as indexes into the
 // vocabulary that is shipped in the same file (and re-validated by the reader).
 snapshot(){
  const today=behaviorDay(this.clock()),from=shiftDay(today,-(RETENTION.snapshotDays-1));
  const days=new Map();
  for(const r of this.db.prepare('SELECT day,event,k1,k2,n FROM behavior_daily WHERE day>=? ORDER BY day DESC,event,k1,k2').all(from)){
   if(!days.has(r.day))days.set(r.day,[]);days.get(r.day).push([EVENTS.indexOf(r.event),K1.indexOf(r.k1),K2.indexOf(r.k2),r.n]);
  }
  return {version:1,kind:'behavior',updated:this.clock(),startedDay:this.db.prepare('SELECT value FROM behavior_meta WHERE key=?').get('startedDay').value,
   vocabulary:{events:EVENTS,k1:K1,k2:K2},days:[...days].map(([d,r])=>({d,r}))};
 }
 export(path){const tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(this.snapshot()),{mode:0o444});renameSync(tmp,path);}
 close(){this.db.close();}
}
