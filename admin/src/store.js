import { DatabaseSync } from 'node:sqlite';
export class Store {
 constructor(path){this.db=new DatabaseSync(path);this.db.exec(`PRAGMA busy_timeout=1000; CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, updated INTEGER NOT NULL, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS daily_totals(day TEXT NOT NULL, metric TEXT NOT NULL, value INTEGER NOT NULL CHECK(value>=0), PRIMARY KEY(day,metric));`);}
 put(key,value,now=Date.now()){this.db.prepare('INSERT INTO cache VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET updated=excluded.updated,value=excluded.value').run(key,now,JSON.stringify(value));}
 get(key){const r=this.db.prepare('SELECT updated,value FROM cache WHERE key=?').get(key);return r?{updated:r.updated,value:JSON.parse(r.value)}:null;}
 close(){this.db.close();}
}
