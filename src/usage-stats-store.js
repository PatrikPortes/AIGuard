import {DatabaseSync} from 'node:sqlite';
import {writeFileSync,renameSync} from 'node:fs';
export const usageDay=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export class UsageStore{
 constructor(path,clock=Date.now){this.clock=clock;this.db=new DatabaseSync(path);this.db.exec(`PRAGMA busy_timeout=50;CREATE TABLE IF NOT EXISTS daily(day TEXT PRIMARY KEY,rules INTEGER NOT NULL DEFAULT 0,ai INTEGER NOT NULL DEFAULT 0,fallback INTEGER NOT NULL DEFAULT 0);CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);this.db.prepare('INSERT OR IGNORE INTO metadata VALUES(?,?)').run('startedDay',usageDay(clock()));}
 record(mode){if(!['rules','ai','fallback'].includes(mode))return;this.db.prepare(`INSERT INTO daily(day,${mode})VALUES(?,1)ON CONFLICT(day)DO UPDATE SET ${mode}=${mode}+1`).run(usageDay(this.clock()));}
 snapshot(){return{version:1,updated:this.clock(),startedDay:this.db.prepare('SELECT value FROM metadata WHERE key=?').get('startedDay').value,days:this.db.prepare('SELECT day,rules,ai,fallback FROM daily ORDER BY day DESC LIMIT 400').all()};}
 export(path){const tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(this.snapshot()),{mode:0o444});renameSync(tmp,path);}
 close(){this.db.close();}
}
