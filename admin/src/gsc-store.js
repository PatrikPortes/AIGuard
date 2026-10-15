// Stage 10 (S10.2): Search Console aggregates in the existing admin SQLite. Only Google's aggregate
// numbers, our own page paths and the top search queries; no visitor data.
export const CHECKER_PATHS=Object.freeze({'/overit-zpravu':'Zpráva','/proverit-web':'Web','/proverit-firmu':'Firma','/proverit-pujcku':'Půjčka','/proverit-investici':'Investice','/proverit-smlouvu':'Smlouva'});
export const KNOWN_PATHS=Object.freeze(['/',...Object.keys(CHECKER_PATHS),'/uz-se-to-stalo','/privacy','/o-projektu','/kontakt']);
export const OTHER_PATH='__other__';
export const DEVICES=Object.freeze(['DESKTOP','MOBILE','TABLET']);
export const QUERY_WINDOWS=Object.freeze([7,28,90]);
export const ERROR_CODES=Object.freeze(['not_configured','invalid_credentials','invalid_site','auth','permissions','rate_limited','upstream','invalid_response','budget','reauth_required','invalid_scope']);

export function ensureGscSchema(db){
 db.exec(`
 CREATE TABLE IF NOT EXISTS gsc_daily(day TEXT PRIMARY KEY, clicks INTEGER NOT NULL CHECK(clicks>=0), impressions INTEGER NOT NULL CHECK(impressions>=0), position REAL, final INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS gsc_daily_page(day TEXT NOT NULL, path TEXT NOT NULL, clicks INTEGER NOT NULL CHECK(clicks>=0), impressions INTEGER NOT NULL CHECK(impressions>=0), position REAL, final INTEGER NOT NULL, PRIMARY KEY(day,path));
 CREATE TABLE IF NOT EXISTS gsc_daily_device(day TEXT NOT NULL, device TEXT NOT NULL, clicks INTEGER NOT NULL CHECK(clicks>=0), impressions INTEGER NOT NULL CHECK(impressions>=0), position REAL, final INTEGER NOT NULL, PRIMARY KEY(day,device));
 CREATE TABLE IF NOT EXISTS gsc_query_window(days INTEGER NOT NULL, end_day TEXT NOT NULL, query TEXT NOT NULL, clicks INTEGER NOT NULL CHECK(clicks>=0), impressions INTEGER NOT NULL CHECK(impressions>=0), position REAL, PRIMARY KEY(days,query));
 CREATE TABLE IF NOT EXISTS gsc_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS gsc_sync(id INTEGER PRIMARY KEY AUTOINCREMENT, started INTEGER NOT NULL, finished INTEGER, status TEXT NOT NULL CHECK(status IN ('running','ok','error')), error TEXT, from_day TEXT, to_day TEXT, last_day TEXT, calls INTEGER NOT NULL DEFAULT 0);
 `);
}
export const lastStoredDay=db=>db.prepare('SELECT max(day) AS d FROM gsc_daily').get()?.d??null;
export const meta=(db,key)=>db.prepare('SELECT value FROM gsc_meta WHERE key=?').get(key)?.value??null;
export const latestSync=db=>db.prepare('SELECT started,finished,status,error,last_day,calls FROM gsc_sync ORDER BY id DESC LIMIT 1').get()??null;
export const lastSuccess=db=>db.prepare("SELECT finished,last_day FROM gsc_sync WHERE status='ok' ORDER BY id DESC LIMIT 1").get()??null;

export function startSyncRecord(db,now){
 // A crashed earlier run must not stay "running" forever.
 db.prepare("UPDATE gsc_sync SET status='error',error='upstream',finished=? WHERE status='running'").run(now);
 return Number(db.prepare("INSERT INTO gsc_sync(started,status) VALUES(?, 'running')").run(now).lastInsertRowid);
}
export function finishSyncRecord(db,id,{now,status,error=null,from=null,to=null,lastDay=null,calls=0}){
 if(error!==null&&!ERROR_CODES.includes(error))error='upstream';
 db.prepare('UPDATE gsc_sync SET finished=?,status=?,error=?,from_day=?,to_day=?,last_day=?,calls=? WHERE id=?').run(now,status,error,from,to,lastDay,calls,id);
 db.prepare('DELETE FROM gsc_sync WHERE id NOT IN (SELECT id FROM gsc_sync ORDER BY id DESC LIMIT 60)').run();
}

// Replaces every row of [from,to] atomically: days Google no longer reports disappear, nothing partial is kept.
export function writeSyncResult(db,{from,to,daily,pages,devices,queries,retainFrom}){
 db.exec('BEGIN IMMEDIATE');
 try{
  for(const table of ['gsc_daily','gsc_daily_page','gsc_daily_device'])db.prepare(`DELETE FROM ${table} WHERE day BETWEEN ? AND ?`).run(from,to);
  const d=db.prepare('INSERT INTO gsc_daily VALUES(?,?,?,?,?)');for(const r of daily)d.run(r.day,r.clicks,r.impressions,r.position,r.final?1:0);
  const p=db.prepare('INSERT INTO gsc_daily_page VALUES(?,?,?,?,?,?) ON CONFLICT(day,path) DO UPDATE SET position=CASE WHEN excluded.impressions+impressions>0 THEN (coalesce(position,0)*impressions+coalesce(excluded.position,0)*excluded.impressions)/(impressions+excluded.impressions) ELSE NULL END, clicks=clicks+excluded.clicks, impressions=impressions+excluded.impressions, final=min(final,excluded.final)');
  for(const r of pages)p.run(r.day,r.path,r.clicks,r.impressions,r.position,r.final?1:0);
  const v=db.prepare('INSERT INTO gsc_daily_device VALUES(?,?,?,?,?,?)');for(const r of devices)v.run(r.day,r.device,r.clicks,r.impressions,r.position,r.final?1:0);
  if(queries){db.prepare('DELETE FROM gsc_query_window').run();const q=db.prepare('INSERT INTO gsc_query_window VALUES(?,?,?,?,?,?)');for(const r of queries)q.run(r.days,r.endDay,r.query,r.clicks,r.impressions,r.position);}
  const firstFrom=meta(db,'range_start');if(!firstFrom||from<firstFrom)db.prepare('INSERT INTO gsc_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('range_start',from);
  // Retention ≈ 16 months, like Search Console itself.
  for(const table of ['gsc_daily','gsc_daily_page','gsc_daily_device'])db.prepare(`DELETE FROM ${table} WHERE day < ?`).run(retainFrom);
  if(meta(db,'range_start')<retainFrom)db.prepare("UPDATE gsc_meta SET value=? WHERE key='range_start'").run(retainFrom);
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
