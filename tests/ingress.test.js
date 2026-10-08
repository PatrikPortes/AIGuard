import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { clientIpResolver, normalizeIp } from '../src/client-ip.js';
import { assertRulesProduction } from '../src/production-config.js';
import { createServer } from '../src/server.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
import { readFile } from 'node:fs/promises';

const req = (peer, values) => ({ socket: { remoteAddress: peer },
  headers: { 'cf-connecting-ip': values.join(', ') },
  rawHeaders: values.flatMap(value => ['CF-Connecting-IP', value]),
});

test('Pouze přesný trusted ingress a právě jeden platný CF header; socket ignoruje všechny headery', () => {
  const resolve = clientIpResolver({ mode: 'cloudflare', trustedProxyIp: '10.1.2.3' });
  assert.equal(resolve(req('::ffff:10.1.2.3', ['203.0.113.10'])), '203.0.113.10');
  assert.throws(() => resolve(req('10.1.2.4', ['203.0.113.10'])), { code: 'INGRESS_REQUIRED' });
  assert.throws(() => resolve(req('127.0.0.1', ['203.0.113.10'])), { code: 'INGRESS_REQUIRED' });
  for (const values of [[], [''], ['unknown'], [' 203.0.113.1'], ['203.0.113.1, 203.0.113.2'], ['203.0.113.1', '203.0.113.2'], ['fe80::1%eth0']]) {
    assert.throws(() => resolve(req('10.1.2.3', values)), { code: 'INGRESS_REQUIRED' });
  }
  assert.equal(clientIpResolver()(req('127.0.0.1', ['203.0.113.10'])), '127.0.0.1');
  assert.throws(() => clientIpResolver({ mode: 'anything' }));
  assert.throws(() => clientIpResolver({ mode: 'cloudflare' }));
});

test('Ekvivalentní IPv6 a IPv4-mapped adresy mají stejný limiter key', () => {
  assert.equal(normalizeIp('2001:0DB8:0000:0000:0000:0000:0000:0001'), '2001:db8::1');
  for (const ip of ['::ffff:192.0.2.1', '::ffff:c000:201', '0:0:0:0:0:ffff:192.0.2.1']) {
    assert.equal(normalizeIp(ip), '192.0.2.1');
  }
  assert.equal(normalizeIp('192.000.2.1'), null);
});

function request(server, peer, headers = {}, path = '/api/analyze') {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'text', content: 'Ahoj, uvidíme se zítra.' });
    const request = http.request({ host: '127.0.0.1', port: server.address().port, localAddress: peer,
      path, method: path === '/api/analyze' ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', ...headers } }, response => {
      let data = ''; response.setEncoding('utf8'); response.on('data', chunk => data += chunk);
      response.on('end', () => resolve({ status: response.statusCode, data: JSON.parse(data), headers: response.headers }));
    });
    request.on('error', reject); request.end(path === '/api/analyze' ? body : undefined);
  });
}

test('HTTP: klienti za jedním ingress mají vlastní IP kvóty; direct spoof je odmítnut před analýzou', async t => {
  let calls = 0;
  const pipeline = new AnalysisPipeline();
  const analyze = pipeline.analyze.bind(pipeline);
  pipeline.analyze = (...args) => { calls++; return analyze(...args); };
  const server = createServer({ pipeline, clientIpMode: 'cloudflare', trustedProxyIp: '127.0.0.2', rateLimit: 1 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  assert.equal((await request(server, '127.0.0.1', { 'CF-Connecting-IP': '203.0.113.1' })).status, 403);
  assert.equal((await request(server, '127.0.0.2')).status, 403);
  assert.equal((await request(server, '127.0.0.2', { 'CF-Connecting-IP': 'invalid' }, '/api/session')).status, 403);
  assert.equal(calls, 0);
  assert.equal((await request(server, '127.0.0.2', { 'CF-Connecting-IP': '203.0.113.1' })).status, 200);
  const limited = await request(server, '127.0.0.2', { 'CF-Connecting-IP': '203.0.113.1', 'X-Forwarded-For': '203.0.113.99' });
  assert.equal(limited.status, 429); assert.equal(limited.headers['retry-after'], '60');
  assert.equal((await request(server, '127.0.0.2', { 'CF-Connecting-IP': '203.0.113.2' })).status, 200);
  assert.equal(calls, 2);
  assert.equal((await request(server, '127.0.0.1', {}, '/api/health')).data.mode, 'rules');
});

test('HTTP: IPv6 spelling a nové anonymní cookies neobcházejí IP kvótu', async t => {
  const server = createServer({ pipeline: new AnalysisPipeline(), clientIpMode: 'cloudflare', trustedProxyIp: '127.0.0.2', rateLimit: 1 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  assert.equal((await request(server, '127.0.0.2', { 'CF-Connecting-IP': '2001:db8::1' })).status, 200);
  assert.equal((await request(server, '127.0.0.2', { 'CF-Connecting-IP': '2001:0db8:0:0:0:0:0:1' })).status, 429);
});

test('Production guard odmítne AI, secrets, budget, vypnuté Secure i neurčitý ingress', async () => {
  const env = Object.fromEntries((await readFile(new URL('../deploy/env/app.env.example', import.meta.url), 'utf8'))
    .split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split('=')));
  env.GUARD_TRUSTED_PROXY_IP = '10.1.2.3';
  assert.doesNotThrow(() => assertRulesProduction(env));
  for (const [key, value] of Object.entries({ AI_MODE: 'ai', GUARD_LLM_API_KEY: 'synthetic-test-key', AI_DAILY_REQUEST_LIMIT: '1',
    AI_DAILY_BUDGET_MICRO_USD: '1', AI_TOTAL_BUDGET_MICRO_USD: '1', AI_CRITIC_ENABLED: 'true', AI_MAX_RETRIES: '1',
    GUARD_COOKIE_SECURE: 'false', GUARD_TRUSTED_PROXY_IP: '127.0.0.1', GUARD_CLIENT_IP_MODE: 'socket',
    NODE_OPTIONS: '--inspect', GUARD_IP_RATE_LIMIT: '0', OPENAI_API_KEY: 'synthetic-only', ANTHROPIC_API_KEY: 'synthetic-only' })) {
    assert.throws(() => assertRulesProduction({ ...env, [key]: value }), /configuration rejected/);
  }
});
