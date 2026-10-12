import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
// Persistent rolling 24-hour quota; no message text or raw IP is stored.
export class VisitorQuota {
  constructor({path, secret, clock=Date.now}) {
    if(!secret || secret.length<32) throw new Error('Quota secret missing');
    this.clock=clock;this.secret=secret;this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=1000;
      CREATE TABLE IF NOT EXISTS visitor_calls(identity TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS visitor_calls_lookup ON visitor_calls(identity,at);
      CREATE TABLE IF NOT EXISTS visitor_burst(identity TEXT PRIMARY KEY, start INTEGER NOT NULL, attempts INTEGER NOT NULL, blocked_until INTEGER NOT NULL);`);
  }
  key(value){return createHmac('sha256',this.secret).update(value).digest('hex');}
  burst(ip){
    const key=this.key('ip:'+ip),now=this.clock();
    this.db.exec('BEGIN IMMEDIATE');
    try{
      this.db.prepare('DELETE FROM visitor_burst WHERE start<? AND blocked_until<=?').run(now-900000,now);
      let row=this.db.prepare('SELECT * FROM visitor_burst WHERE identity=?').get(key);
      if(row?.blocked_until>now){this.db.exec('COMMIT');return {code:'CLIENT_COOLDOWN',retryAfter:Math.ceil((row.blocked_until-now)/1000)};}
      if(!row && this.db.prepare('SELECT COUNT(*) AS n FROM visitor_burst').get().n>=20000)throw new Error('Quota capacity');
      if(!row || row.start<=now-60000)row={start:now,attempts:0,blocked_until:0};
      row.attempts++;if(row.attempts>10)row.blocked_until=now+900000;
      this.db.prepare('INSERT OR REPLACE INTO visitor_burst VALUES(?,?,?,?)').run(key,row.start,row.attempts,row.blocked_until);
      this.db.exec('COMMIT');return row.blocked_until?{code:'CLIENT_COOLDOWN',retryAfter:900}:null;
    }catch(e){try{this.db.exec('ROLLBACK');}catch{}throw e;}
  }
  reserve(session,ip){
    const now=this.clock(),keys=[this.key('session:'+session),this.key('ip:'+ip)];
    this.db.exec('BEGIN IMMEDIATE');
    try{
      this.db.prepare('DELETE FROM visitor_calls WHERE at<=?').run(now-86400000);
      if(this.db.prepare('SELECT COUNT(*) AS n FROM visitor_calls').get().n>=50000)throw new Error('Quota capacity');
      for(const [i,key]of keys.entries()){
        const row=this.db.prepare('SELECT COUNT(*) AS n,MIN(at) AS first FROM visitor_calls WHERE identity=?').get(key);
        // Supplementary network ceiling leaves room for households sharing an IP.
        if(row.n>=(i===0?3:12)){this.db.exec('COMMIT');return {code:'AI_VISITOR_LIMIT',retryAfter:Math.max(1,Math.ceil((row.first+86400000-now)/1000))};}
      }
      for(const key of keys)this.db.prepare('INSERT INTO visitor_calls VALUES(?,?)').run(key,now);
      this.db.exec('COMMIT');return null;
    }catch(e){try{this.db.exec('ROLLBACK');}catch{}throw e;}
  }
  close(){this.db.close();}
}
