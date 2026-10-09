import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, intakeAgent, reusePreparedInput } from '../src/analysis.js';
import { AnalysisPipeline, validateInput } from '../src/ai/pipeline.js';
import { createServer } from '../src/server.js';
import { aiFixture, validOutput } from '../test-support/ai.js';

const deterministic = ({ id, ...result }) => result;
const source = '  Mami, mám nové číslo. Pošli ihned peníze. Nevolej mi.\u200b\r\n';
async function listen(t, options) {
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
const post = (base, input) => fetch(base + '/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });

test('CR03: prepared and raw analysis match; original bytes and matching state are immutable', async () => {
  const pipeline = new AnalysisPipeline();
  for (const content of [source, source.normalize('NFD'), '\uFDFA'.repeat(3000), 'aаč إa\u0301', 'https://example.com/']) {
    const input = { type: 'text', content }, prepared = pipeline.validate(input);
    assert.equal(prepared.content, content);
    assert.equal(intakeAgent(prepared), prepared);
    assert.equal(reusePreparedInput(input, prepared), prepared);
    assert.ok(Object.isFrozen(prepared) && Object.isFrozen(prepared.matching));
    assert.throws(() => { prepared.content = 'safe'; }, TypeError);
    assert.throws(() => { prepared.matching.content = 'safe'; }, TypeError);
    assert.deepEqual(deterministic(analyze(prepared)), deterministic(analyze(input)));
    assert.deepEqual(deterministic(await pipeline.analyze(input, { preparedInput: prepared })), deterministic(analyze(input)));
  }
  pipeline.close();
});

test('CR03: fabricated, cloned or serialized prepared state cannot bypass matching or validation', async () => {
  const pipeline = new AnalysisPipeline(), input = { type: 'text', content: source };
  const prepared = pipeline.validate(input), fake = { ...prepared, matching: { content: 'safe', hiddenCharacters: false, foldedConfusables: false } };
  for (const forged of [fake, JSON.parse(JSON.stringify(prepared)), Object.freeze({ ...prepared }), null, 42]) {
    assert.equal(reusePreparedInput(input, forged), input);
    assert.deepEqual(deterministic(await pipeline.analyze({ ...input, matching: fake.matching, preparedInput: forged }, { preparedInput: forged })), deterministic(analyze(input)));
  }
  assert.notEqual(intakeAgent({ ...prepared }), prepared);
  await assert.rejects(pipeline.analyze({ type: 'image', content: source }, { preparedInput: prepared }), { code: 'INVALID_INPUT' });
  pipeline.close();
});

test('CR03: stale preparation and tighter byte limits are revalidated', async () => {
  const pipeline = new AnalysisPipeline(), input = { type: 'text', content: source };
  const prepared = pipeline.validate(input);
  input.content = 'a'.repeat(10001);
  assert.equal(reusePreparedInput(input, prepared), input);
  await assert.rejects(pipeline.analyze(input, { preparedInput: prepared }), { code: 'INVALID_INPUT' });
  input.content = '漢'.repeat(6000);
  await assert.rejects(pipeline.analyze(input, { preparedInput: prepared }), { code: 'AI_INPUT_LIMIT' });
  const byteBoundary = { type: 'text', content: 'é'.repeat(8000) }, bounded = pipeline.validate(byteBoundary);
  assert.equal(validateInput(bounded).content, byteBoundary.content);
  assert.throws(() => validateInput(bounded, 15999), { code: 'AI_INPUT_LIMIT' });
  pipeline.maxContentBytes = 15999;
  await assert.rejects(pipeline.analyze(byteBoundary, { preparedInput: bounded }), { code: 'AI_INPUT_LIMIT' });
  pipeline.close();
});

test('CR03: full HTTP path performs NFKC once and ignores client matching/prepared fields', async t => {
  const pipeline = new AnalysisPipeline(), events = [];
  const validate = pipeline.validate.bind(pipeline), run = pipeline.analyze.bind(pipeline);
  pipeline.validate = input => { events.push('validate'); return validate(input); };
  pipeline.analyze = (...args) => { events.push('analyze'); return run(...args); };
  const base = await listen(t, { pipeline, requireBotCheck: true, botVerifier: async () => { events.push('bot'); return true; } });
  const expected = deterministic(analyze({ type: 'text', content: source }));
  const normalize = String.prototype.normalize;
  let nfkcCalls = 0;
  String.prototype.normalize = function(form) { if (form === 'NFKC') nfkcCalls++; return normalize.call(this, form); };
  try {
    const response = await post(base, { type: 'text', content: source, matching: { content: 'safe' }, preparedInput: { type: 'text', content: 'safe' } });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(deterministic(result), expected);
    assert.equal(nfkcCalls, 1);
    assert.deepEqual(events, ['validate', 'bot', 'analyze', 'validate']);
    assert.equal(result.content, undefined); assert.equal(result.matching, undefined); assert.equal(result.preparedInput, undefined);
  } finally { String.prototype.normalize = normalize; }
});

test('CR03: HTTP invalid input is rejected before bot, worker and global analysis quota', async t => {
  const pipeline = new AnalysisPipeline();
  let workers = 0, bots = 0;
  const run = pipeline.analyze.bind(pipeline);
  pipeline.analyze = (...args) => { workers++; return run(...args); };
  const base = await listen(t, { pipeline, globalApiRateLimit: 1, requireBotCheck: true, botVerifier: async () => { bots++; return true; } });
  for (const input of [{ type: 'image', content: source }, { type: 'text', content: 'a'.repeat(10001) }, { type: 'text', content: '漢'.repeat(6000) }]) {
    const response = await post(base, { ...input, matching: { content: 'safe' }, preparedInput: { type: 'text', content: 'safe' } });
    assert.equal(response.status, 400);
  }
  assert.equal(workers, 0); assert.equal(bots, 0);
  assert.equal((await post(base, { type: 'text', content: source })).status, 200);
  assert.equal(workers, 1); assert.equal(bots, 1);
  assert.equal((await post(base, { type: 'text', content: source })).status, 429);
});

test('CR03: dormant mock AI still requires raw consent and receives original unmodified content', async t => {
  const { pipeline, calls } = aiFixture(t);
  pipeline.worker.provider.complete = async request => { calls.push(request); return { ...validOutput(), risk_score: 0, signals: [], uncertainty: 'high' }; };
  const input = { type: 'text', content: source }, prepared = pipeline.validate(input);
  await assert.rejects(pipeline.analyze(input, { preparedInput: prepared }), { code: 'AI_CONSENT_REQUIRED' });
  assert.equal(calls.length, 0);
  await pipeline.analyze({ ...input, ai_consent: true }, { preparedInput: prepared });
  assert.equal(JSON.parse(calls[0].messages[1].content).untrusted_content, source);
  assert.equal(calls.length, 1);
});
