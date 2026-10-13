import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../src/ai/runtime.js';
import { createServer } from '../src/server.js';

const input = { type: 'text', content: 'Jsme vaše banka. Přesuňte peníze na bezpečný účet.' };
async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
function request(base, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + path, { method, headers }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function fixture(t, configuration) {
  const dir = mkdtempSync(join(tmpdir(), 'guard-startup-fallback-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const requests = [];
  const endpoint = await listen(t, http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    requests.push(Buffer.concat(chunks).toString('utf8'));
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      schema_version: 'observations-v1', observations: [], uncertainty: 'high', insufficient_information: true,
    }) } }] }));
  }));
  const key = 'synthetic-startup-fixture-key';
  const pipeline = createRuntime({ AI_MODE: 'ai', AI_BETA_ENABLED: 'true', AI_ALLOW_LOCAL: 'true', AI_ENDPOINT: endpoint,
    GUARD_LLM_API_KEY: key, AI_INPUT_USD_PER_MILLION: '1', AI_OUTPUT_USD_PER_MILLION: '2',
    AI_DAILY_REQUEST_LIMIT: '5', AI_DAILY_BUDGET_MICRO_USD: '1000000', AI_TOTAL_BUDGET_MICRO_USD: '1000000',
    // Opening a directory as SQLite is a real startup failure, independent of
    // permissions/root or mocks. Otherwise use a private disposable database.
    AI_BUDGET_DB: configuration === 'budget-failure' ? dir : join(dir, 'budget.sqlite'),
    ...(configuration === 'unconfigured' ? { AI_INPUT_USD_PER_MILLION: '' } : {}),
  });
  t.after(() => pipeline.close());
  const base = await listen(t, createServer({ pipeline, publicOrigin: 'https://startup.test' }));
  const session = await request(base, '/api/session', 'GET', { Host: 'startup.test' });
  assert.equal(session.status, 200); assert.match(session.headers['cache-control'], /no-store/);
  assert.ok(!JSON.stringify(session.body).includes(key));
  assert.ok(!JSON.stringify(session.body).includes(dir));
  assert.ok(!JSON.stringify(session.body).includes('AI_BUDGET_UNAVAILABLE'));
  const headers = { Host: 'startup.test', Origin: 'https://startup.test', 'Content-Type': 'application/json',
    Cookie: session.headers['set-cookie'][0].split(';')[0] };
  return { pipeline, requests, session: session.body, post: body => request(base, '/api/analyze', 'POST', headers, body) };
}

test('Startup HTTP: failed budget database never advertises consent-free rules fallback', async t => {
  const f = await fixture(t, 'budget-failure');
  assert.equal(f.pipeline.unavailableCode, 'AI_BUDGET_UNAVAILABLE');
  assert.equal(f.pipeline.worker, undefined); assert.equal(f.pipeline.queue, undefined);
  assert.equal(f.pipeline.isAIUnconfigured(), false);
  assert.equal(f.session.ai_configured, false);
  assert.equal(Object.hasOwn(f.session, 'rules_fallback'), false);
  for (const consent of [undefined, false]) {
    const response = await f.post({ ...input, ...(consent === false && { ai_consent: false }) });
    // Approved: rules-only 200 without consent, labelled 'declined', zero AI operations.
    assert.equal(response.status, 200); assert.equal(response.body.engine, 'rules-v1');
    assert.equal(response.body.ai_status, 'not_performed'); assert.equal(response.body.ai_fallback_reason, 'declined');
    assert.deepEqual(f.requests, []);
  }
  // Retain the existing explicitly consented, truthfully labelled fallback.
  const fallback = await f.post({ ...input, ai_consent: true });
  assert.equal(fallback.status, 200); assert.equal(fallback.body.engine, 'rules-v1');
  assert.equal(fallback.body.ai_status, 'not_performed');
  assert.equal(fallback.body.ai_fallback_reason, 'budget_unavailable');
  assert.ok(fallback.body.signals.some(signal => signal.id === 'safe_account_transfer'));
  assert.match(fallback.body.recommended_actions[0], /Peníze nepřevádějte/);
  assert.match(fallback.headers['cache-control'], /no-store/);
  assert.deepEqual(f.requests, []);
  t.diagnostic('actual SQLite directory-open failure; session fallback omitted; no worker/queue/provider requests; consent not bypassed');
});
test('Startup HTTP: genuinely unconfigured AI still offers zero-transmission fallback without consent', async t => {
  const f = await fixture(t, 'unconfigured');
  assert.equal(f.pipeline.isAIUnconfigured(), true);
  assert.equal(f.session.ai_configured, false); assert.equal(f.session.rules_fallback, true);
  assert.equal(f.session.provider_label, null);
  for (const consent of [undefined, false]) {
    const response = await f.post({ ...input, ...(consent === false && { ai_consent: false }) });
    assert.equal(response.status, 200); assert.equal(response.body.engine, 'rules-v1');
    assert.equal(response.body.ai_status, 'not_performed'); assert.equal(response.body.ai_fallback_reason, 'not_configured');
  }
  assert.deepEqual(f.requests, []); assert.equal(f.pipeline.worker, undefined);
});
test('Startup HTTP: configured AI never reserves or transmits without consent and answers rules-only', async t => {
  const f = await fixture(t, 'configured');
  assert.equal(f.session.ai_configured, true); assert.equal(f.session.rules_fallback, true);
  for (const consent of [undefined, false]) {
    const response = await f.post({ ...input, ...(consent === false && { ai_consent: false }) });
    assert.equal(response.status, 200); assert.equal(response.body.engine, 'rules-v1');
    assert.equal(response.body.ai_status, 'not_performed'); assert.equal(response.body.ai_fallback_reason, 'declined');
  }
  assert.deepEqual(f.requests, []);
  assert.equal(f.pipeline.worker.budget.db.prepare('SELECT count(*) AS n FROM ai_daily').get().n, 0);
  assert.equal(f.pipeline.worker.budget.db.prepare('SELECT reserved FROM ai_total WHERE id=1').get().reserved, 0);
  const response = await f.post({ ...input, ai_consent: true });
  assert.equal(response.status, 200); assert.equal(response.body.ai_status, 'performed');
  assert.equal(f.requests.length, 1);
  assert.equal(f.pipeline.worker.budget.db.prepare('SELECT attempts FROM ai_daily').get().attempts, 1);
});
