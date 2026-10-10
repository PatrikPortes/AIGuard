import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { analyze, intakeAgent, matchingRepresentation } from '../src/analysis.js';
import { matchingRepresentation as referenceMatching } from '../test-support/cr03-reference.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
import { createServer } from '../src/server.js';
import { AnonymousSessions } from '../src/limits.js';

const attacks = ['schvaleni', 'garant', 'poplat'].map(token => ({
  token, content: ('pujcka ' + token.repeat(2000)).slice(0, 10000),
}));
const cpuMs = before => { const used = process.cpuUsage(before); return (used.user + used.system) / 1000; };

test('LUX-01: request-local token folding preserves Unicode flags and full content past cache bounds', () => {
  const distinct = Array.from({ length: 160 }, (_, i) => 'půjčka' + String.fromCharCode(97 + Math.floor(i / 26), 97 + i % 26));
  const corpus = [
    ('půjčka úvěr údaje '.repeat(600)).slice(0, 7900),
    ('půjčka\u200b schvаleni garant fótkа občаnky '.repeat(250)).slice(0, 9500),
    distinct.join(' ') + ' ' + distinct.reverse().join(' ') + ' аhој',
    'é'.repeat(4100) + ' аhој úvěr půjčka úvěr půjčka',
    '\uFDFA'.repeat(3000), 'půjčka\r\n' + 'e\u0301 '.repeat(2000),
  ];
  for (const content of corpus) {
    assert.deepEqual(matchingRepresentation(content), referenceMatching(content));
    assert.equal(intakeAgent({ type: 'text', content }).content, content);
  }
  // No matching representation or flag survives from a previous request.
  matchingRepresentation('půjčka аhој\u200b');
  assert.deepEqual(matchingRepresentation('půjčka ahoj'), referenceMatching('půjčka ahoj'));
});

test('LUX-01: repeated loan roots stay within the unchanged 20ms process-CPU budget', async t => {
  const pipeline = new AnalysisPipeline();
  t.after(() => pipeline.close());
  const measurements = [];
  for (const input of attacks) {
    const request = { type: 'text', content: input.content };
    for (let i = 0; i < 20; i++) await pipeline.analyze(request);
    for (let run = 1; run <= 10; run++) {
      const before = process.cpuUsage(), start = performance.now();
      const result = await pipeline.analyze(request);
      measurements.push({ token: input.token, run, cpuMs: cpuMs(before), wallMs: performance.now() - start });
      assert.equal(result.topic, 'loan');
    }
  }
  t.diagnostic(JSON.stringify(measurements));
  const maximum = Math.max(...measurements.map(row => row.cpuMs));
  assert.ok(maximum < 20, `Maximum CPU ${maximum} ms; threshold 20 ms`);
});

test('LUX-01: hostile loan text leaves the real secured HTTP endpoint and event loop responsive', async t => {
  const pipeline = new AnalysisPipeline();
  const stages = [];
  const originalAnalyze = pipeline.analyze.bind(pipeline);
  pipeline.analyze = async (...args) => {
    const before = process.cpuUsage(), thread = process.threadCpuUsage(), start = performance.now();
    try { return await originalAnalyze(...args); }
    finally {
      const used = process.threadCpuUsage(thread);
      stages.push({ cpuMs: cpuMs(before), threadCpuMs: (used.user + used.system) / 1000, wallMs: performance.now() - start });
    }
  };
  // Warm the same analysis operation without spending or overriding HTTP
  // quotas. All server security/body/session/admission defaults stay intact.
  for (const input of attacks) for (let i = 0; i < 20; i++) analyze({ type: 'text', content: input.content });
  const origin = 'https://loan-test.invalid';
  const server = createServer({ pipeline, publicOrigin: origin, clientIpMode: 'cloudflare',
    trustedProxyIp: '127.0.0.1', sessions: new AnonymousSessions({ secure: true }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const headers = { Host: 'loan-test.invalid', Origin: origin, 'CF-Connecting-IP': '203.0.113.10' };
  const request = (path, body, extra = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path,
      method: body === undefined ? 'GET' : 'POST', headers: { ...headers, ...extra, 'Content-Type': 'application/json' } }, res => {
      const chunks = []; res.on('data', part => chunks.push(part));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const session = await request('/api/session');
  assert.equal(session.status, 200);
  const Cookie = session.headers['set-cookie'][0].split(';')[0];
  assert.match(session.headers['set-cookie'][0], /__Host-guard_session=/);
  assert.match(session.headers['set-cookie'][0], /Secure/);
  // Warm only HTTP plumbing with one ordinary request, below default quotas.
  assert.equal((await request('/api/analyze', { type: 'text', content: 'Ahoj.' }, { Cookie })).status, 200);
  const measurements = [];
  for (const input of attacks) {
    const before = process.cpuUsage(), thread = process.threadCpuUsage(), start = performance.now();
    let timerWallMs;
    const timer = new Promise(resolve => setTimeout(() => { timerWallMs = performance.now() - start; resolve(); }, 20));
    const result = await request('/api/analyze', { type: 'text', content: input.content }, { Cookie });
    const used = cpuMs(before), wallMs = performance.now() - start;
    const threadUsed = process.threadCpuUsage(thread);
    const health = await request('/api/health');
    await timer;
    measurements.push({ token: input.token, cpuMs: used, threadCpuMs: (threadUsed.user + threadUsed.system) / 1000,
      wallMs, timerWallMs, analysis: stages.at(-1) });
    assert.equal(result.status, 200); assert.equal(result.body.topic, 'loan');
    assert.equal(health.status, 200);
  }
  t.diagnostic(JSON.stringify(measurements));
  assert.ok(measurements.every(row => row.cpuMs < 20), 'secured full HTTP path exceeded 20ms process CPU');
  assert.ok(measurements.every(row => row.timerWallMs < 40), '20ms timer delayed by more than the 20ms execution budget');
});
