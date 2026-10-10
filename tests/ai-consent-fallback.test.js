import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../src/server.js';
import { createRuntime } from '../src/ai/runtime.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
import { ObservationAIWorker } from '../src/ai/observation-worker.js';
import { OpenAICompatibleProvider } from '../src/ai/provider.js';
import { SqliteBudgetStore } from '../src/ai/budget.js';
import { BoundedQueue } from '../src/ai/queue.js';

const value = { type: 'text', content: 'Nabídka půjčky.', topic: 'loan', loan_context: { advance_payment: 'yes', requests: ['bank_login'] } };
const output = { schema_version: 'observations-v1', observations: [], uncertainty: 'high', insufficient_information: true };
function request(base, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + path, { method, headers }, res => {
      const parts = []; res.on('data', part => parts.push(part));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(parts)) }));
    });
    req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
async function fixture(t, { configured = false, fallback = true, fails = false } = {}) {
  const counters = { provider: 0, reservations: 0, routing: 0, critic: 0, queue: 0 }, raw = [];
  const providerBase = await listen(t, http.createServer(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    raw.push(Buffer.concat(parts).toString('utf8')); counters.provider++;
    if (fails) { res.writeHead(503); res.end(); return; }
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }));
  }));
  const budget = new SqliteBudgetStore({ path: ':memory:', dailyRequests: 10, dailyBudgetMicroUsd: 1000000, totalBudgetMicroUsd: 1000000 });
  const reserve = budget.reserve.bind(budget);
  budget.reserve = options => { counters.reservations++; return reserve(options); };
  const worker = new ObservationAIWorker({ provider: new OpenAICompatibleProvider({ endpoint: providerBase, apiKey: 'synthetic-test-key', allowLocal: true }), budget,
    config: { simpleModel: 'simple-model', complexModel: 'complex-model', inputPrice: 1, outputPrice: 2,
      maxInputTokens: 24000, maxOutputTokens: 800, retries: 0, criticEnabled: false } });
  const route = worker.rulesForProvider.bind(worker);
  worker.rulesForProvider = (...args) => { counters.routing++; return route(...args); };
  const call = worker.call.bind(worker);
  worker.call = args => { if (args.critic) counters.critic++; return call(args); };
  const queue = new BoundedQueue({ concurrency: 1, capacity: 2 }), submit = queue.submit.bind(queue);
  queue.submit = (...args) => { counters.queue++; return submit(...args); };
  const pipeline = new AnalysisPipeline({ mode: 'ai', worker: configured ? worker : undefined, queue,
    unavailableCode: configured ? undefined : 'AI_INVALID_CONFIG', timeoutMs: 10000, fallbackToRules: fallback });
  t.after(() => { const ownsBudget = pipeline.worker === worker; pipeline.close(); if (!ownsBudget) budget.close(); });
  const base = await listen(t, createServer({ pipeline, publicOrigin: 'https://consent.test' }));
  const session = await request(base, '/api/session', 'GET', { Host: 'consent.test' });
  assert.equal(session.status, 200);
  const headers = { Host: 'consent.test', Origin: 'https://consent.test', 'Content-Type': 'application/json', Cookie: session.headers['set-cookie'][0].split(';')[0] };
  const post = body => request(base, '/api/analyze', 'POST', headers, body);
  return { pipeline, worker, queue, budget, counters, raw, session: session.body, post, base, headers };
}
function zero(f) {
  assert.deepEqual(f.counters, { provider: 0, reservations: 0, routing: 0, critic: 0, queue: 0 });
  assert.deepEqual(f.raw, []);
  assert.equal(f.budget.db.prepare('SELECT count(*) AS n FROM ai_daily').get().n, 0);
  assert.equal(f.budget.db.prepare('SELECT reserved FROM ai_total WHERE id=1').get().reserved, 0);
}
function fallback(response) {
  assert.equal(response.status, 200); assert.equal(response.body.engine, 'rules-v1');
  assert.equal(response.body.ai_status, 'not_performed'); assert.equal(response.body.ai_fallback_reason, 'not_configured');
  assert.equal(response.body.topic, 'loan'); assert.match(response.headers['cache-control'], /no-store/);
}

test('Consent HTTP: genuinely unconfigured fallback accepts false and absent consent without any AI-side operation', async t => {
  const f = await fixture(t);
  assert.equal(f.session.ai_configured, false); assert.equal(f.session.rules_fallback, true); assert.equal(f.session.provider_label, null);
  fallback(await f.post({ ...value, ai_consent: false })); zero(f);
  fallback(await f.post(value)); zero(f);
  fallback(await f.post({ ...value, ai_consent: true })); zero(f);
  t.diagnostic('real HTTP: 3 fallback responses, provider=0, reservations=0, routing=0, critic=0, queue=0');
});
test('Consent HTTP: configured AI rejects false/missing/spoofed consent and works with explicit boolean true', async t => {
  const f = await fixture(t, { configured: true });
  assert.equal(f.session.ai_configured, true); assert.equal(f.session.provider_label, 'OpenAI');
  for (const consent of [undefined, false, 'true', 1]) {
    const response = await f.post({ ...value, ...(consent !== undefined && { ai_consent: consent }), ai_configured: false, rules_fallback: true });
    assert.equal(response.status, 400); assert.equal(response.body.code, 'AI_CONSENT_REQUIRED'); zero(f);
  }
  const response = await f.post({ ...value, ai_consent: true });
  assert.equal(response.status, 200); assert.equal(response.body.engine, 'rules+ai-v1'); assert.equal(response.body.ai_status, 'performed');
  assert.equal(f.counters.provider, 1); assert.equal(f.counters.reservations, 1); assert.equal(f.counters.routing, 1); assert.equal(f.counters.critic, 0);
  assert.deepEqual(JSON.parse(JSON.parse(f.raw[0]).messages[1].content), { untrusted_content: value.content });
});
test('Consent HTTP: configured runtime provider failure cannot bypass consent before or after labelled fallback', async t => {
  const f = await fixture(t, { configured: true, fails: true });
  const denied = await f.post({ ...value, ai_consent: false });
  assert.equal(denied.status, 400); assert.equal(denied.body.code, 'AI_CONSENT_REQUIRED'); zero(f);
  const response = await f.post({ ...value, ai_consent: true });
  assert.equal(response.status, 200); assert.equal(response.body.ai_fallback_reason, 'provider_unavailable');
  assert.equal(response.body.ai_status, 'not_performed'); assert.equal(f.counters.provider, 1); assert.equal(f.counters.reservations, 1);
  const before = { ...f.counters };
  assert.equal((await f.post(value)).body.code, 'AI_CONSENT_REQUIRED'); assert.deepEqual(f.counters, before);
});
test('Consent HTTP: old backend without fallback support still requires consent and returns its unavailable error', async t => {
  const f = await fixture(t, { fallback: false });
  assert.equal(Object.hasOwn(f.session, 'rules_fallback'), false);
  assert.equal((await f.post(value)).body.code, 'AI_CONSENT_REQUIRED'); zero(f);
  const response = await f.post({ ...value, ai_consent: true });
  assert.equal(response.status, 503); assert.equal(response.body.code, 'AI_INVALID_CONFIG'); zero(f);
});
test('Consent HTTP: stale unconfigured session cannot authorize a newly configured worker', async t => {
  const f = await fixture(t);
  assert.equal(f.session.ai_configured, false);
  f.pipeline.worker = f.worker; f.pipeline.unavailableCode = undefined;
  assert.equal(f.pipeline.status().ai_configured, true);
  const denied = await f.post({ ...value, ai_consent: false });
  assert.equal(denied.status, 400); assert.equal(denied.body.code, 'AI_CONSENT_REQUIRED'); zero(f);
  assert.equal((await f.post({ ...value, ai_consent: true })).body.ai_status, 'performed');
  assert.equal(f.counters.provider, 1); assert.equal(f.counters.reservations, 1);
});
test('Consent HTTP: existing worker plus unavailable marker or missing queue is never genuinely unconfigured', async t => {
  const f = await fixture(t, { configured: true });
  for (const code of ['AI_TIMEOUT', 'AI_OVERLOADED', 'AI_PROVIDER_UNAVAILABLE', 'AI_INVALID_CONFIG']) {
    f.pipeline.unavailableCode = code;
    assert.equal(f.pipeline.isAIUnconfigured(), false);
    assert.equal((await f.post(value)).body.code, 'AI_CONSENT_REQUIRED'); zero(f);
  }
  f.pipeline.unavailableCode = undefined; f.pipeline.queue = undefined;
  assert.equal((await f.post(value)).body.code, 'AI_CONSENT_REQUIRED'); zero(f);
  // Restore the fixture's queue for lifecycle cleanup, not to alter admission.
  f.pipeline.queue = f.queue;
});
test('Consent HTTP: absence of a worker after operational failure does not turn that failure into configuration-based consent bypass', async t => {
  const f = await fixture(t);
  for (const code of ['AI_TIMEOUT', 'AI_OVERLOADED', 'AI_PROVIDER_UNAVAILABLE', 'AI_BUDGET_UNAVAILABLE']) {
    f.pipeline.unavailableCode = code;
    assert.equal(f.pipeline.isAIUnconfigured(), false);
    const response = await f.post(value);
    assert.equal(response.status, 400); assert.equal(response.body.code, 'AI_CONSENT_REQUIRED'); zero(f);
  }
});
test('Consent HTTP: fallback without AI still rejects invalid input, forged Origin and missing session', async t => {
  const f = await fixture(t);
  assert.equal((await f.post({ type: 'text', content: '' })).body.code, 'INVALID_INPUT');
  assert.equal((await f.post({ ...value, loan_context: { unexpected: true } })).body.code, 'INVALID_INPUT');
  assert.equal((await request(f.base, '/api/analyze', 'POST', { ...f.headers, Origin: 'https://evil.invalid' }, value)).status, 403);
  const headers = { ...f.headers }; delete headers.Cookie;
  assert.equal((await request(f.base, '/api/analyze', 'POST', headers, value)).status, 403); zero(f);
});
test('Consent: default runtime stays rules-only; unconfigured beta metadata is null and caller cancellation remains an error', async () => {
  const rules = createRuntime({ AI_MODE: 'rules' });
  const beta = createRuntime({ AI_MODE: 'ai', AI_BETA_ENABLED: 'true' });
  try {
    assert.equal(rules.status().provider_label, null); assert.equal((await rules.analyze(value)).engine, 'rules-v1');
    assert.equal(beta.isAIUnconfigured(), true); assert.equal(beta.status().provider_label, null);
    assert.equal((await beta.analyze(value)).ai_fallback_reason, 'not_configured');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(beta.analyze(value, { signal: controller.signal }), error => error.code === 'AI_TIMEOUT');
  } finally { rules.close(); beta.close(); }
});
