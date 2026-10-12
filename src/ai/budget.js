import { DatabaseSync } from 'node:sqlite';
import { ServiceError } from './errors.js';

function integer(value, min) { return Number.isSafeInteger(value) && value >= min; }
// BudgetStore contract: reserve({costMicroUsd}) atomically before each attempt.
export class SqliteBudgetStore {
  constructor({ path, dailyRequests, dailyBudgetMicroUsd, totalBudgetMicroUsd, clock = Date.now }) {
    if (![dailyRequests, dailyBudgetMicroUsd, totalBudgetMicroUsd].every(value => integer(value, 0))) throw new ServiceError('AI_INVALID_CONFIG');
    this.limits = { dailyRequests, dailyBudgetMicroUsd, totalBudgetMicroUsd };
    this.clock = clock;
    try {
      this.db = new DatabaseSync(path);
      this.db.exec(`PRAGMA busy_timeout=3000;
        CREATE TABLE IF NOT EXISTS ai_daily (day TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reserved INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS ai_total (id INTEGER PRIMARY KEY CHECK(id=1), reserved INTEGER NOT NULL);
        INSERT OR IGNORE INTO ai_total VALUES (1,0);`);
    } catch { throw new ServiceError('AI_BUDGET_UNAVAILABLE'); }
  }
  reserve({ costMicroUsd }) {
    if (!integer(costMicroUsd, 1)) throw new ServiceError('AI_INVALID_CONFIG');
    let transaction = false;
    try {
      this.db.exec('BEGIN IMMEDIATE'); transaction = true;
      const day = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(this.clock()));
      const daily = this.db.prepare('SELECT attempts,reserved FROM ai_daily WHERE day=?').get(day) || { attempts: 0, reserved: 0 };
      const total = this.db.prepare('SELECT reserved FROM ai_total WHERE id=1').get();
      if (!total || ![daily.attempts, daily.reserved, total.reserved].every(value => integer(value, 0))) throw new ServiceError('AI_BUDGET_UNAVAILABLE');
      if (daily.attempts >= this.limits.dailyRequests || costMicroUsd > this.limits.dailyBudgetMicroUsd - daily.reserved || costMicroUsd > this.limits.totalBudgetMicroUsd - total.reserved) throw new ServiceError('AI_CAPACITY_EXHAUSTED');
      this.db.prepare('INSERT INTO ai_daily(day,attempts,reserved) VALUES(?,1,?) ON CONFLICT(day) DO UPDATE SET attempts=attempts+1,reserved=reserved+excluded.reserved').run(day, costMicroUsd);
      this.db.prepare('UPDATE ai_total SET reserved=reserved+? WHERE id=1').run(costMicroUsd);
      this.db.exec('COMMIT'); transaction = false;
    } catch (error) {
      if (transaction) { try { this.db.exec('ROLLBACK'); } catch {} }
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('AI_BUDGET_UNAVAILABLE');
    }
  }
  close() { this.db.close(); }
}

