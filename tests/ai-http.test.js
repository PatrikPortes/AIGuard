import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.js';
import { createRuntime } from '../src/ai/runtime.js';
import { aiFixture, input, validOutput } from '../test-support/ai.js';

async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
const post = (base, content = input) => fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content) });
test('Celý HTTP textový tok s opravdovým adaptérem a simulovaným LLM serverem', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-http-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let providerCalls = 0;
  const providerBase = await listen(t, http.createServer(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    const payload = JSON.parse(Buffer.concat(parts)); providerCalls++;
    assert.equal(payload.model, 'synthetic-model');
    assert.equal(payload.messages[0].role, 'system');
    assert.equal(JSON.parse(payload.messages[1].content).untrusted_content, input.content);
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(validOutput()) } }] }));
  }));
  const pipeline = createRuntime({
    AI_MODE: 'ai', AI_ENDPOINT: `${providerBase}/v1/chat/completions`, AI_ALLOW_LOCAL: 'true',
    AI_MODEL_SIMPLE: 'synthetic-model', AI_INPUT_USD_PER_MILLION: '1', AI_OUTPUT_USD_PER_MILLION: '2',
    AI_DAILY_REQUEST_LIMIT: '1', AI_DAILY_BUDGET_MICRO_USD: '100000', AI_TOTAL_BUDGET_MICRO_USD: '100000',
    AI_BUDGET_DB: join(dir, 'budget.sqlite'),
  });
  const base = await listen(t, createServer({ pipeline }));
  const response = await post(base);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.engine, 'rules+ai-v1'); assert.equal(result.risk_level, 'very_high');
  assert.equal(result.uncertainty, 'medium'); assert.ok(result.verification_steps.length > 0);
  const overloaded = await post(base);
  assert.equal(overloaded.status, 503);
  assert.equal((await overloaded.json()).code, 'AI_CAPACITY_EXHAUSTED');
  assert.equal(providerCalls, 1);
});
test('HTTP selhání providera neunikne s obsahem a klíčem, ani nepřejde na pravidla', async t => {
  const { pipeline } = aiFixture(t, { provider: { complete: async () => { throw Error('SECRET_KEY raw user content'); } } });
  // Avoid double-close in fixture teardown; SQLite close is safely handled here.
  const originalClose = pipeline.close.bind(pipeline); let closed = false;
  pipeline.close = () => { if (!closed) { closed = true; originalClose(); } };
  const base = await listen(t, createServer({ pipeline }));
  const response = await post(base);
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.doesNotMatch(body, /SECRET_KEY|raw user content|rules-v1/);
  assert.match(body, /nedostupné/);
});
test('HTTP souhlas a neplatný vstup jsou odmítnuty před AI', async t => {
  const { pipeline, calls } = aiFixture(t);
  const originalClose = pipeline.close.bind(pipeline); let closed = false;
  pipeline.close = () => { if (!closed) { closed = true; originalClose(); } };
  const base = await listen(t, createServer({ pipeline }));
  assert.equal((await post(base, { type: 'text', content: input.content })).status, 400);
  assert.equal((await post(base, { ...input, content: '' })).status, 400);
  assert.equal(calls.length, 0);
});
