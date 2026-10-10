import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { analyze, loanUncertainties } from '../src/analysis.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
import { ObservationAIWorker } from '../src/ai/observation-worker.js';
import { OpenAICompatibleProvider } from '../src/ai/provider.js';
import { SqliteBudgetStore } from '../src/ai/budget.js';
import { BoundedQueue } from '../src/ai/queue.js';
import { createServer } from '../src/server.js';

const answerSets = [undefined, {}, ...['yes', 'no', 'unsure'].map(advance_payment => ({ advance_payment })),
  ...['id_document', 'bank_login', 'sms_code', 'card_details', 'remote_access', 'none', 'unsure'].map(value => ({ requests: [value] })),
  { advance_payment: 'yes', requests: ['id_document', 'bank_login', 'sms_code', 'card_details', 'remote_access'] }];
const assessment = uncertainty => ({ schema_version: 'observations-v1', observations: [], uncertainty, insufficient_information: false });
async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
function request(base, path, method, headers, value) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${path}`, { method, headers }, res => {
      const parts = []; res.on('data', part => parts.push(part));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(parts)) }));
    });
    req.on('error', reject); req.end(value === undefined ? undefined : JSON.stringify(value));
  });
}
function pipelineFor(endpoint, retries = 0) {
  const budget = new SqliteBudgetStore({ path: ':memory:', dailyRequests: 4, dailyBudgetMicroUsd: 1000000, totalBudgetMicroUsd: 1000000 });
  const worker = new ObservationAIWorker({ provider: new OpenAICompatibleProvider({ endpoint, apiKey: 'synthetic-test-key', allowLocal: true }), budget,
    config: { simpleModel: 'simple-model', complexModel: 'complex-model', inputPrice: 1, outputPrice: 2,
      maxInputTokens: 24000, maxOutputTokens: 800, retries, criticEnabled: false } });
  return { budget, pipeline: new AnalysisPipeline({ mode: 'ai', worker, queue: new BoundedQueue({ concurrency: 1, capacity: 2 }),
    timeoutMs: 10000, fallbackToRules: true }) };
}

test('AI/Loan: raw provider HTTP bytes, routing, retries, critic and reservations are independent of all local answers', async t => {
  let raw = [], attempt = 0, scenario;
  const provider = http.createServer(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    raw.push(Buffer.concat(parts)); attempt++;
    if (scenario.retry && attempt === 1) { res.writeHead(503); res.end(); return; }
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(assessment(scenario.uncertainty)) } }] }));
  });
  const endpoint = `${await listen(provider)}/v1/chat/completions`;
  let analyses = 0, providerCalls = 0;
  try {
    for (const content of ['Zítra se uvidíme.', 'Nabízíme půjčku bez registru, poplatek předem.', 'Ma\u200bmi, mám nové číslo. Pošli ihned peníze.']) {
      for (scenario of [{ uncertainty: 'low', retry: false }, { uncertainty: 'high', retry: false }, { uncertainty: 'high', retry: true }]) {
        let expected;
        for (const answers of answerSets) {
          // A fresh default-limited app per case keeps all real admission,
          // Origin/session and per-IP limits enabled, without cross-case quota pollution.
          raw = []; attempt = 0;
          const { pipeline, budget } = pipelineFor(endpoint, scenario.retry ? 1 : 0);
          const server = createServer({ pipeline, publicOrigin: 'https://loan.integration.test' });
          const base = await listen(server);
          try {
            const session = await request(base, '/api/session', 'GET', { Host: 'loan.integration.test' });
            assert.equal(session.status, 200);
            const cookie = session.headers['set-cookie'][0].split(';')[0];
            const input = { type: 'text', content, ai_consent: true,
              ...(answers !== undefined ? { topic: 'loan', loan_context: answers } : {}) };
            const response = await request(base, '/api/analyze', 'POST', { Host: 'loan.integration.test', Origin: 'https://loan.integration.test',
              Cookie: cookie, 'Content-Type': 'application/json' }, input);
            assert.equal(response.status, 200);
            assert.match(response.headers['cache-control'], /no-store/);
            const result = response.body, rules = analyze(input);
            assert.equal(result.engine, 'rules+ai-v1'); assert.equal(result.ai_status, 'performed');
            assert.equal(result.critic_used, false);
            assert.equal(result.topic, rules.topic);
            for (const field of ['recommended_actions', 'verification_steps']) assert.deepEqual(result[field], rules[field]);
            if (rules.topic === 'loan') {
              assert.equal(result.summary, rules.summary);
              for (const note of loanUncertainties(pipeline.validate(input))) assert.ok(result.uncertainties.includes(note), note);
            }
            for (const signal of rules.signals) assert.deepEqual(result.signals.find(item => item.id === signal.id), { ...signal, source: 'rules' });
            assert.equal(raw.length, scenario.retry ? 2 : 1);
            const reservation = { ...budget.db.prepare('SELECT attempts,reserved FROM ai_daily').get(),
              total: budget.db.prepare('SELECT reserved FROM ai_total WHERE id=1').get().reserved };
            const captured = { bodies: raw.map(body => body.toString('utf8')), reservation };
            if (expected) assert.deepEqual(captured, expected, 'all serialized bytes and reserved cost must match no-questionnaire baseline');
            else expected = captured;
            for (const body of raw) {
              const serialized = JSON.parse(body);
              assert.deepEqual(JSON.parse(serialized.messages[1].content), { untrusted_content: content });
              assert.equal(serialized.store, false); assert.equal(serialized.max_completion_tokens, 800);
              assert.equal(serialized.response_format.json_schema.strict, true);
              assert.doesNotMatch(body.toString('utf8'), /loan_context|advance_payment|bank_login|card_details|synthetic-test-key/);
            }
            analyses++; providerCalls += raw.length;
          } finally { await close(server); pipeline.close(); }
        }
        t.diagnostic(`content SHA256=${createHash('sha256').update(content).digest('hex')}; uncertainty=${scenario.uncertainty}; retry=${scenario.retry}; raw-body SHA256=${createHash('sha256').update(expected.bodies[0]).digest('hex')}; attempts=${expected.reservation.attempts}; reserved=${expected.reservation.reserved}; all ${answerSets.length} answer variants identical`);
      }
    }
  } finally { await close(provider); }
  t.diagnostic(`${analyses} secured HTTP analyses; ${providerCalls} loopback provider requests; no external AI`);
});

test('AI/Loan: explicit unavailable fallback preserves complete local Loan guidance and still requires consent', async () => {
  const pipeline = new AnalysisPipeline({ mode: 'ai', unavailableCode: 'AI_INVALID_CONFIG', fallbackToRules: true });
  const input = { type: 'text', content: 'Nabídka půjčky.', topic: 'loan', loan_context: { advance_payment: 'yes', requests: ['bank_login'] }, ai_consent: true };
  try {
    const result = await pipeline.analyze(input), rules = analyze(input);
    for (const key of ['topic', 'summary', 'signals', 'recommended_actions', 'verification_steps']) assert.deepEqual(result[key], rules[key]);
    for (const note of rules.uncertainties) assert.ok(result.uncertainties.includes(note));
    assert.equal(result.engine, 'rules-v1'); assert.equal(result.ai_status, 'not_performed'); assert.equal(result.ai_fallback_reason, 'not_configured');
    assert.equal(pipeline.status().rules_fallback, true); assert.equal(pipeline.status().ai_configured, false);
    await assert.rejects(pipeline.analyze({ ...input, ai_consent: false }), error => error.code === 'AI_CONSENT_REQUIRED');
  } finally { pipeline.close(); }
});
