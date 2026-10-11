import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createServer } from '../src/server.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
import { AnonymousSessions } from '../src/limits.js';
import { requestPath } from '../src/http-security.js';
import { analyze } from '../src/analysis.js';

async function fixture(t, options = {}) {
  const server = createServer({ pipeline: new AnalysisPipeline(), ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
const body = JSON.stringify({ type: 'text', content: 'Ahoj, zítra se sejdeme.' });
const post = (base, options = {}) => fetch(base + '/api/analyze', {
  method: 'POST', body, ...options, headers: { 'content-type': 'application/json', ...options.headers },
});
function raw(server, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(server.address().port, '127.0.0.1');
    let received = '';
    socket.setTimeout(2000, () => socket.destroy(new Error('Test socket timeout')));
    socket.on('connect', () => socket.write(payload));
    socket.on('data', data => received += data);
    socket.on('end', () => resolve(received)); socket.on('error', reject);
  });
}

test('Opakované fráze zachovávají ordered rules význam včetně hranic řádků', () => {
  const has = (content, id) => analyze({ type: 'text', content }).signals.some(signal => signal.id === id);
  assert.equal(has('pošli '.repeat(1500), 'money'), false);
  assert.equal(has('POŠLI '.repeat(1500) + 'KČ', 'money'), true);
  assert.equal(has('peníze ' + 'pošli '.repeat(1500), 'money'), false);
  assert.equal(has('pošli\npeníze', 'money'), false);
  assert.equal(has('dnes '.repeat(1500) + 'zaplatíme', 'urgency'), true);
  assert.equal(has('dnes\nzaplatíme', 'urgency'), false);
});

test('Strict routing odmítá traversal, encoded separators a absolute-form target', async t => {
  const { server } = await fixture(t);
  for (const path of ['/docs/../', '/%2e%2e/', '/%252e%252e/', '/%2f', '/a\\b', '//api/session', 'http://evil.invalid/api/session']) {
    assert.throws(() => requestPath(path), { code: 'INVALID_REQUEST' });
    assert.match(await raw(server, `GET ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`), /^HTTP\/1.1 400/);
  }
});

test('Interní soubory ani nepovolené obrázky nelze servírovat', async t => {
  const { base } = await fixture(t);
  for (const path of ['/.env', '/.git/HEAD', '/Dockerfile', '/package.json', '/deploy/env/app.env', '/src/server.js', '/tests/security.test.js', '/docs/security/THREAT_MODEL.md', '/assets/', '/assets/characters/unapproved.png']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
});

test('HTTP method abuse: 405 a přesný Allow; neznámé endpointy 404', async t => {
  const { base } = await fixture(t);
  for (const [path, method, allowed] of [['/api/analyze', 'GET', 'POST'], ['/api/analyze', 'PUT', 'POST'], ['/api/analyze', 'OPTIONS', 'POST'], ['/api/session', 'POST', 'GET'], ['/', 'DELETE', 'GET'], ['/', 'HEAD', 'GET']]) {
    const response = await fetch(base + path, { method });
    assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), allowed);
  }
  assert.equal((await fetch(base + '/api/upload', { method: 'POST' })).status, 404);
});

test('Oversize Content-Length a chunked tělo, malformed UTF8/JSON, MIME a encoding', async t => {
  const { base, server } = await fixture(t);
  assert.equal((await post(base, { body: 'a'.repeat(65537) })).status, 413);
  assert.equal((await post(base, { body: '{' })).status, 400);
  assert.equal((await post(base, { body: Buffer.from([0xc0, 0xaf]) })).status, 400);
  assert.equal((await post(base, { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await post(base, { headers: { 'content-encoding': 'gzip' } })).status, 415);
  const prefix = 'POST /api/analyze HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n';
  assert.match(await raw(server, prefix + `10001\r\n${'x'.repeat(65537)}\r\n0\r\n\r\n`), /^HTTP\/1.1 413/);
});

test('Slow body má vlastní deadline a uvolní admission slot', async t => {
  const { server, base } = await fixture(t, { bodyTimeoutMs: 50, maxConcurrentAnalyses: 1 });
  const response = await raw(server, 'POST /api/analyze HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{');
  assert.match(response, /^HTTP\/1.1 408/);
  assert.equal((await post(base)).status, 200);
});

test('Cross-origin JSON POST, same-site subdoména a falešný forwarded host jsou odmítnuty', async t => {
  const { base } = await fixture(t);
  for (const headers of [{ Origin: 'https://attacker.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }, { Origin: 'https://attacker.invalid', 'X-Forwarded-Host': 'attacker.invalid' }]) {
    assert.equal((await post(base, { headers })).status, 403);
  }
  assert.equal((await post(base, { headers: { Origin: base, 'Sec-Fetch-Site': 'same-origin' } })).status, 200);
});

test('Produkční origin a platná Secure session jsou povinné, útok nerozhýbe pipeline', async t => {
  let calls = 0;
  const pipeline = new AnalysisPipeline();
  const analyze = pipeline.analyze.bind(pipeline);
  pipeline.analyze = (...args) => { calls++; return analyze(...args); };
  const { server } = await fixture(t, { pipeline, publicOrigin: 'https://verimtomu.fyi', sessions: new AnonymousSessions({ secure: true }) });
  const request = (method, path, headers = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, method, path, headers: { Host: 'verimtomu.fyi', 'content-type': 'application/json', ...headers } }, res => {
      res.resume(); res.on('end', () => resolve({ status: res.statusCode, cookie: res.headers['set-cookie']?.[0] }));
    }); req.on('error', reject); req.end(method === 'POST' ? body : undefined);
  });
  assert.equal((await request('POST', '/api/analyze')).status, 403);
  assert.equal((await request('POST', '/api/analyze', { Origin: 'https://verimtomu.fyi' })).status, 403);
  const session = await request('GET', '/api/session');
  assert.match(session.cookie, /HttpOnly; SameSite=Strict;.*; Secure/);
  const cookie = session.cookie.split(';')[0];
  await t.test('Markdown v Origin je odmítnut i s platnou Secure session', async () => {
    assert.equal((await request('POST', '/api/analyze', {
      Cookie: cookie, Origin: '[https://verimtomu.fyi](https://verimtomu.fyi)',
    })).status, 403);
    assert.equal(calls, 0);
  });
  assert.equal((await request('POST', '/api/analyze', { Cookie: cookie, Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await request('POST', '/api/analyze', { Cookie: cookie, Origin: 'https://verimtomu.fyi', Host: 'evil.invalid' })).status, 403);
  assert.equal(calls, 0);
  assert.equal((await request('POST', '/api/analyze', { Cookie: cookie, Origin: 'https://verimtomu.fyi' })).status, 200);
  assert.equal(calls, 1);
});

test('Globální analysis quota funguje i při rotaci klientských IP', async t => {
  const { server } = await fixture(t, { clientIpMode: 'cloudflare', trustedProxyIp: '127.0.0.1', globalApiRateLimit: 2 });
  const get = ip => raw(server, `POST /api/analyze HTTP/1.1\r\nHost: localhost\r\nCF-Connecting-IP: ${ip}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
  assert.match(await get('203.0.113.1'), /^HTTP\/1.1 200/);
  assert.match(await get('203.0.113.2'), /^HTTP\/1.1 200/);
  assert.match(await get('203.0.113.3'), /^HTTP\/1.1 429/);
});

test('Timeout neotevře další slot, pokud worker ignoruje cancellation', async t => {
  let complete, started, calls = 0;
  const pipeline = { status: () => ({ mode: 'rules' }), close() {}, analyze: () => { calls++; return new Promise(resolve => { complete = resolve; started?.(); }); } };
  const { base } = await fixture(t, { pipeline, analysisTimeoutMs: 50, maxConcurrentAnalyses: 1 });
  assert.equal((await post(base)).status, 503);
  assert.equal((await post(base)).status, 503);
  assert.equal(calls, 1);
  complete({ engine: 'rules-v1' });
  await new Promise(resolve => setImmediate(resolve));
  const ready = new Promise(resolve => { started = resolve; });
  const final = post(base); await ready;
  complete({ engine: 'rules-v1' }); assert.equal((await final).status, 200);
});

test('Request smuggling CL/TE, duplicate CL/Host a příliš velké headers selžou', async t => {
  const { server } = await fixture(t);
  const requests = [
    'Content-Length: 0\r\nTransfer-Encoding: chunked\r\n',
    'Content-Length: 0\r\nContent-Length: 1\r\n',
    'Host: other.invalid\r\n',
  ];
  for (const extra of requests) assert.match(await raw(server, `POST /api/analyze HTTP/1.1\r\nHost: localhost\r\n${extra}Connection: close\r\n\r\n`), /^HTTP\/1.1 400/);
  assert.match(await raw(server, `GET / HTTP/1.1\r\nHost: localhost\r\nX-Large: ${'x'.repeat(9000)}\r\n\r\n`), /^HTTP\/1.1 431/);
});

test('XSS a URL vstup nejsou odraženy do rules výsledku a URL se nefetchuje', async t => {
  const { base } = await fixture(t);
  const marker = '<img src=x onerror=alert("SECRET-MARKER")>';
  const response = await post(base, { body: JSON.stringify({ type: 'text', content: marker }) });
  assert.equal(response.status, 200); assert.doesNotMatch(await response.text(), /SECRET-MARKER|<img/);
  let visits = 0;
  const target = http.createServer((req, res) => { visits++; res.end('private'); });
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve)); t.after(() => target.close());
  const url = `http://127.0.0.1:${target.address().port}/private`;
  assert.equal((await post(base, { body: JSON.stringify({ type: 'url', content: url }) })).status, 200);
  assert.equal(visits, 0);
});

test('Bezpečné chyby, CSP podle frontend závislostí a citlivé no-store', async t => {
  const pipeline = { status: () => ({ mode: 'rules' }), close() {}, analyze: () => { throw new Error('private-message secret-key stacktrace'); } };
  const { base } = await fixture(t, { pipeline });
  const response = await post(base); assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private-message|secret-key|stacktrace|Error:/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('content-security-policy'), /script-src 'self';.*frame-ancestors 'none'/);
  assert.doesNotMatch(response.headers.get('content-security-policy'), /unsafe-inline|unsafe-eval|https:/);
});

test('Graceful shutdown nechá dokončit rozpracovaný požadavek', async t => {
  let complete;
  const pipeline = { status: () => ({}), close() {}, analyze: () => new Promise(resolve => { complete = resolve; }) };
  const { base, server } = await fixture(t, { pipeline });
  const pending = post(base);
  while (!complete) await new Promise(resolve => setImmediate(resolve));
  const stopped = server.shutdown(500);
  complete({ engine: 'rules-v1' });
  assert.equal((await pending).status, 200); await stopped;
});
