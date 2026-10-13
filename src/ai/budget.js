import { DatabaseSync } from 'node:sqlite';
import { ServiceError } from './errors.js';

function integer(value, min) { return Number.isSafeInteger(value) && value >= min; }
// BudgetStore contract: reserve({costMicroUsd}) atomically before each attempt.
export class SqliteBudgetStore {
  constructor({ path, dailyRequests, dailyBudgetMicroUsd, totalBudgetMicroUsd, clock = Date.now, bucket = "message" }) {
    if (![dailyRequests, dailyBudgetMicroUsd, totalBudgetMicroUsd].every(value => integer(value, 0))) throw new ServiceError('AI_INVALID_CONFIG');
    this.limits = { dailyRequests, dailyBudgetMicroUsd, totalBudgetMicroUsd };
    this.clock = clock;
    if(!["message","contract"].includes(bucket))throw new ServiceError("AI_INVALID_CONFIG");
    this.dailyTable=bucket==="contract"?"ai_contract_daily":"ai_daily";this.totalTable=bucket==="contract"?"ai_contract_total":"ai_total";
    try {
      this.db = new DatabaseSync(path);
      this.db.exec(`PRAGMA busy_timeout=3000;
        CREATE TABLE IF NOT EXISTS ${this.dailyTable} (day TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reserved INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS ${this.totalTable} (id INTEGER PRIMARY KEY CHECK(id=1), reserved INTEGER NOT NULL);
        INSERT OR IGNORE INTO ${this.totalTable} VALUES (1,0);`);
    } catch { throw new ServiceError('AI_BUDGET_UNAVAILABLE'); }
  }
  reserve({ costMicroUsd }) {
    if (!integer(costMicroUsd, 1)) throw new ServiceError('AI_INVALID_CONFIG');
    let transaction = false;
    try {
      this.db.exec('BEGIN IMMEDIATE'); transaction = true;
      const day = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(this.clock()));
      const daily = this.db.prepare(`SELECT attempts,reserved FROM ${this.dailyTable} WHERE day=?`).get(day) || { attempts: 0, reserved: 0 };
      const total = this.db.prepare(`SELECT reserved FROM ${this.totalTable} WHERE id=1`).get();
      if (!total || ![daily.attempts, daily.reserved, total.reserved].every(value => integer(value, 0))) throw new ServiceError('AI_BUDGET_UNAVAILABLE');
      if (daily.attempts >= this.limits.dailyRequests || costMicroUsd > this.limits.dailyBudgetMicroUsd - daily.reserved || costMicroUsd > this.limits.totalBudgetMicroUsd - total.reserved) throw new ServiceError('AI_CAPACITY_EXHAUSTED');
      this.db.prepare(`INSERT INTO ${this.dailyTable}(day,attempts,reserved) VALUES(?,1,?) ON CONFLICT(day) DO UPDATE SET attempts=attempts+1,reserved=reserved+excluded.reserved`).run(day, costMicroUsd);
      this.db.prepare(`UPDATE ${this.totalTable} SET reserved=reserved+? WHERE id=1`).run(costMicroUsd);
      this.db.exec('COMMIT'); transaction = false;
    } catch (error) {
      if (transaction) { try { this.db.exec('ROLLBACK'); } catch {} }
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('AI_BUDGET_UNAVAILABLE');
    }
  }
  close() { this.db.close(); }
}

