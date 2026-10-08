import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { SqliteBudgetStore } from '../src/ai/budget.js';

function temp(t) { const dir = mkdtempSync(join(tmpdir(), 'guard-budget-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return join(dir, 'budget.sqlite'); }
const limits = { dailyRequests: 5, dailyBudgetMicroUsd: 50, totalBudgetMicroUsd: 70 };
test('Rezervace přežije restart, půlnoc obnoví jen denní budget', t => {
  const path = temp(t);
  let now = Date.UTC(2026, 9, 7, 23, 59);
  let store = new SqliteBudgetStore({ path, ...limits, clock: () => now });
  for (let i = 0; i < 5; i++) store.reserve({ costMicroUsd: 10 });
  assert.throws(() => store.reserve({ costMicroUsd: 1 }), error => error.code === 'AI_CAPACITY_EXHAUSTED');
  store.close();
  store = new SqliteBudgetStore({ path, ...limits, clock: () => now });
  assert.throws(() => store.reserve({ costMicroUsd: 1 }), error => error.code === 'AI_CAPACITY_EXHAUSTED');
  now += 120000;
  store.reserve({ costMicroUsd: 20 });
  assert.throws(() => store.reserve({ costMicroUsd: 1 }), error => error.code === 'AI_CAPACITY_EXHAUSTED');
  assert.equal(store.db.prepare('SELECT reserved FROM ai_total').get().reserved, 70);
  store.close();
});
test('Cena rezervace se nemůže vejít přes hranici denního budgetu', () => {
  const store = new SqliteBudgetStore({ path: ':memory:', ...limits, dailyRequests: 100 });
  assert.throws(() => store.reserve({ costMicroUsd: 51 }), error => error.code === 'AI_CAPACITY_EXHAUSTED');
  assert.equal(store.db.prepare('SELECT reserved FROM ai_total').get().reserved, 0);
  store.reserve({ costMicroUsd: 50 });
  assert.throws(() => store.reserve({ costMicroUsd: 1 }), error => error.code === 'AI_CAPACITY_EXHAUSTED');
  store.close();
});
test('Nedostupná nebo poškozená účetní evidence nedovolí rezervaci', () => {
  const store = new SqliteBudgetStore({ path: ':memory:', ...limits });
  store.db.exec('DROP TABLE ai_total');
  assert.throws(() => store.reserve({ costMicroUsd: 1 }), error => error.code === 'AI_BUDGET_UNAVAILABLE');
  store.close();
  assert.throws(() => store.reserve({ costMicroUsd: 1 }), error => error.code === 'AI_BUDGET_UNAVAILABLE');
});
test('Čtyři souběžné workers nemohou překročit stejný atomický budget', async t => {
  const path = temp(t);
  const store = new SqliteBudgetStore({ path, ...limits }); store.close();
  const moduleUrl = new URL('../src/ai/budget.js', import.meta.url).href;
  const code = `const {parentPort,workerData}=require('node:worker_threads');
    (async()=>{ const {SqliteBudgetStore}=await import(workerData.moduleUrl);
    const store=new SqliteBudgetStore({path:workerData.path,...workerData.limits});
    let accepted=0; for(let i=0;i<30;i++){try{store.reserve({costMicroUsd:10});accepted++;}catch(e){if(e.code!=='AI_CAPACITY_EXHAUSTED')throw e;}}
    store.close();parentPort.postMessage(accepted); })().catch(()=>process.exit(1));`;
  const counts = await Promise.all(Array.from({ length: 4 }, () => new Promise((resolve, reject) => {
    const worker = new Worker(code, { eval: true, workerData: { moduleUrl, path, limits } });
    worker.on('message', resolve); worker.on('error', reject); worker.on('exit', status => { if (status !== 0) reject(new Error('Worker failed')); });
  })));
  assert.equal(counts.reduce((a, b) => a + b, 0), 5);
  const result = new SqliteBudgetStore({ path, ...limits });
  assert.equal(result.db.prepare('SELECT reserved FROM ai_total').get().reserved, 50);
  result.close();
});
