// Independent review (Claude) — temporary adversarial checks. NOT part of `npm test`
// (file name does not match node --test default patterns; excluded by .dockerignore).
// Run: node --test --test-reporter=spec tests/adversarial/claude-review.adversarial.mjs
//
// "INVARIANT" tests assert a claimed security property and are expected to PASS.
// "FINDING" tests assert the property the service SHOULD have; they are marked
// `todo` because they currently FAIL and reproduce a review finding. A todo
// failure does not fail the run; it is reported as "# TODO" in the output.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createServer } from '../../src/server.js';
import { AnalysisPipeline } from '../../src/ai/pipeline.js';
import { AnonymousSessions } from '../../src/limits.js';
import { analyze } from '../../src/analysis.js';

const ORIGIN = 'https://verimtomu.fyi';
async function fixture(t, options = {}) {
  let calls = 0;
  const pipeline = new AnalysisPipeline();
  const original = pipeline.analyze.bind(pipeline);
  pipeline.analyze = (...args) => { calls++; return original(...args); };
  const server = createServer({ pipeline, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { server, port: server.address().port, calls: () => calls };
}
// Production-equivalent createServer options (values from deploy/env/app.env.example),
// with the test client socket (127.0.0.1) acting as the trusted connector.
const production = () => ({
  publicOrigin: ORIGIN, sessions: new AnonymousSessions({ secure: true }),
  clientIpMode: 'cloudflare', trustedProxyIp: '127.0.0.1',
  rateLimit: 20, sessionRateLimit: 10, globalApiRateLimit: 600, maxActiveRequests: 64, maxConcurrentAnalyses: 8,
});
function raw(port, payload, { timeout = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let received = '';
    socket.setTimeout(timeout, () => { socket.destroy(); resolve(received); });
    socket.on('connect', () => socket.write(payload));
    socket.on('data', data => { received += data; });
    socket.on('end', () => resolve(received)); socket.on('close', () => resolve(received)); socket.on('error', reject);
  });
}
const agent = new http.Agent({ keepAlive: true, maxSockets: 32 });
function request(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, agent, headers: { Host: 'verimtomu.fyi', ...headers } }, res => {
      let data = ''; res.setEncoding('utf8'); res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
    });
    req.on('error', reject); req.end(body);
  });
}
async function session(port, ip) {
  const res = await request(port, { path: '/api/session', headers: { 'CF-Connecting-IP': ip } });
  assert.equal(res.status, 200);
  return res.headers['set-cookie'][0].split(';')[0];
}
const analyzeBody = JSON.stringify({ type: 'text', content: 'Ahoj, zítra se sejdeme u knihovny.' });
async function legitAnalyze(port, ip) {
  const cookie = await session(port, ip);
  return request(port, { method: 'POST', path: '/api/analyze', body: analyzeBody,
    headers: { 'CF-Connecting-IP': ip, Cookie: cookie, Origin: ORIGIN, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' } });
}

// ───────────────────────── INVARIANTS (expected PASS) ─────────────────────────

test('INVARIANT parser: ambiguous framing / malformed headers are rejected with 400', async t => {
  const { port, calls } = await fixture(t);
  const head = 'POST /api/analyze HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nConnection: close\r\n';
  const cases = {
    'TE chunked twice': 'Transfer-Encoding: chunked\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n',
    'TE xchunked': 'Transfer-Encoding: xchunked\r\n\r\n',
    'TE chunked, identity': 'Transfer-Encoding: chunked, identity\r\n\r\n',
    'TE obs-fold': 'Transfer-Encoding:\r\n chunked\r\n\r\n0\r\n\r\n',
    'space before colon': 'Content-Length : 2\r\n\r\n{}',
    'CL list': 'Content-Length: 2, 2\r\n\r\n{}',
    'CL plus sign': 'Content-Length: +2\r\n\r\n{}',
    'CL negative': 'Content-Length: -1\r\n\r\n',
    'NUL in header': 'X-A: a\x00b\r\nContent-Length: 2\r\n\r\n{}',
    'bare CR': 'X-A: a\rb\r\nContent-Length: 2\r\n\r\n{}',
  };
  for (const [name, extra] of Object.entries(cases)) {
    assert.match(await raw(port, head + extra), /^HTTP\/1.1 400/, name);
  }
  assert.match(await raw(port, 'POST /api/analyze HTTP/1.1\nHost: localhost\nContent-Length: 2\n\n{}'), /^HTTP\/1.1 400/, 'bare LF');
  assert.equal(calls(), 0);
});

test('INVARIANT parser: duplicate Origin / Content-Type / Cookie / Content-Encoding headers are rejected', async t => {
  const { port, calls } = await fixture(t);
  for (const dup of ['Origin: http://localhost\r\nOrigin: http://localhost', 'Content-Type: application/json\r\nContent-Type: text/plain',
    'Cookie: a=1\r\nCookie: b=2', 'Content-Encoding: identity\r\nContent-Encoding: gzip', 'host: localhost']) {
    const res = await raw(port, `POST /api/analyze HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\n${dup.startsWith('Content-Type') ? dup.split('\r\n')[1] : dup}\r\nContent-Length: ${analyzeBody.length}\r\nConnection: close\r\n\r\n${analyzeBody}`);
    assert.match(res, /^HTTP\/1.1 400/, dup);
  }
  assert.equal(calls(), 0);
});

test('INVARIANT smuggling: body of a rejected request is never parsed as a second request', async t => {
  const { port } = await fixture(t);
  const smuggled = 'GET /api/health HTTP/1.1\r\nHost: localhost\r\n\r\n';
  for (const first of [`POST /does-not-exist HTTP/1.1\r\nHost: localhost\r\nContent-Length: ${smuggled.length}\r\n\r\n`,
    `GET /api/analyze HTTP/1.1\r\nHost: localhost\r\nContent-Length: ${smuggled.length}\r\n\r\n`,
    `POST /api/analyze HTTP/1.1\r\nHost: localhost\r\nContent-Type: text/plain\r\nContent-Length: ${smuggled.length}\r\n\r\n`]) {
    const res = await raw(port, first + smuggled);
    assert.equal((res.match(/HTTP\/1.1 \d{3}/g) || []).length, 1, first.split('\r\n')[0]);
    assert.doesNotMatch(res, /"status":"ok"/);
  }
});

test('INVARIANT production session: forged, expired, wrong-secret and truncated cookies never reach the pipeline', async t => {
  const { port, calls } = await fixture(t, production());
  const ip = '198.51.100.7';
  const valid = await session(port, ip);
  const [name, value] = valid.split('=');
  const [id, expires, sig] = value.split('.');
  const other = new AnonymousSessions({ secure: true });
  const otherPayload = `${id}.${Date.now() + 3600000}`;
  const candidates = [
    `${name}=${id}.${expires}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`,
    `${name}=${id}.${Number(expires) + 1}.${sig}`,
    `${name}=${id}.${Date.now() - 1000}.${new AnonymousSessions().sign(`${id}.${Date.now() - 1000}`)}`,
    `${name}=${otherPayload}.${other.sign(otherPayload)}`,
    `${name}=${id}.${expires}`,
    `${name}=${'0'.repeat(36)}.${expires}.${sig}`,
  ];
  for (const cookie of candidates) {
    const res = await request(port, { method: 'POST', path: '/api/analyze', body: analyzeBody,
      headers: { 'CF-Connecting-IP': ip, Cookie: cookie, Origin: ORIGIN, 'Content-Type': 'application/json' } });
    assert.equal(res.status, 403, cookie);
    assert.equal(JSON.parse(res.data).code, 'SESSION_REQUIRED');
  }
  assert.equal(calls(), 0);
});

test('INVARIANT production origin: null / scheme / port / case variants of Origin and Host are rejected', async t => {
  const { port, calls } = await fixture(t, production());
  const ip = '198.51.100.8';
  const cookie = await session(port, ip);
  for (const [origin, host] of [['null', 'verimtomu.fyi'], ['http://verimtomu.fyi', 'verimtomu.fyi'], ['https://verimtomu.fyi:443', 'verimtomu.fyi'],
    ['https://VERIMTOMU.FYI', 'verimtomu.fyi'], ['https://verimtomu.fyi.', 'verimtomu.fyi'], [ORIGIN, 'verimtomu.fyi:443'], [ORIGIN, 'www.verimtomu.fyi']]) {
    const res = await request(port, { method: 'POST', path: '/api/analyze', body: analyzeBody,
      headers: { Host: host, 'CF-Connecting-IP': ip, Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' } });
    assert.equal(res.status, 403, `${origin} @ ${host}`);
  }
  assert.equal(calls(), 0);
});

test('INVARIANT body: malformed UTF-8 variants and deep JSON nesting are rejected without crashing', async t => {
  const { port } = await fixture(t);
  const post = body => raw(port, `POST /api/analyze HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`
    + body.toString('latin1'));
  const wrap = bytes => Buffer.concat([Buffer.from('{"type":"text","content":"'), Buffer.from(bytes), Buffer.from('"}')]);
  for (const bytes of [[0xed, 0xa0, 0x80], [0xe0, 0x80, 0xaf], [0xf4, 0x90, 0x80, 0x80], [0xc3], [0xff]]) {
    assert.match(await post(wrap(bytes)), /^HTTP\/1.1 400/, Buffer.from(bytes).toString('hex'));
  }
  assert.match(await post(Buffer.from('['.repeat(65000))), /^HTTP\/1.1 400/);
  assert.match(await post(Buffer.from('{"type":"text","content":"x","__proto__":{"type":"url"}}')), /^HTTP\/1.1 200/);
  assert.equal((await request(port, { path: '/api/health', headers: { Host: 'localhost' } })).status, 200);
});

test('INVARIANT routing: no static file outside the 18-entry map, including case/encoding/dot variants', async t => {
  const { port } = await fixture(t);
  for (const path of ['/APP.JS', '/app.js/', '/app.js.', '/./app.js', '/assets/characters/../../src/server.js', '/%61pp.js',
    '/assets/characters/verkarob.png;.js', '/privacy.html', '/index.html', '/public/app.js', '/..%2fsrc/server.js']) {
    const res = await raw(port, `GET ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
    assert.match(res, /^HTTP\/1.1 (400|404)/, path);
  }
});

// ─────────────────── FINDINGS (todo: currently FAIL = reproduced) ───────────────────

test('FINDING CR-01: one IPv6 /64 can exhaust the shared global API quota and deny every other user', { todo: 'CR-01 reproduced' }, async t => {
  const { port } = await fixture(t, production());
  // Attacker: 600 distinct addresses in ONE /64, unauthenticated GET /api/session, no cookie/Origin needed.
  await Promise.all(Array.from({ length: 600 }, (_, i) => request(port, { path: '/api/session', headers: { 'CF-Connecting-IP': `2001:db8:1:2::${(i + 1).toString(16)}` } })));
  const victim = await request(port, { path: '/api/session', headers: { 'CF-Connecting-IP': '203.0.113.50' } });
  assert.equal(victim.status, 200, `legitimate unrelated client got ${victim.status}`);
});

test('FINDING CR-01b: 10 000 distinct client IPs fill the IP limiter map; new legitimate clients get 503 for a full window', { todo: 'CR-01b reproduced' }, async t => {
  const { port } = await fixture(t, production());
  for (let batch = 0; batch < 10000; batch += 500) {
    await Promise.all(Array.from({ length: 500 }, (_, i) => request(port, { path: '/api/session', headers: { 'CF-Connecting-IP': `2001:db8:1:2::${(batch + i + 1).toString(16)}` } })));
  }
  const victim = await request(port, { path: '/api/session', headers: { 'CF-Connecting-IP': '203.0.113.51' } });
  assert.notEqual(victim.status, 503, 'limiter key exhaustion returns AI_OVERLOADED to new clients');
});

test('FINDING CR-02: 8 slow-body POSTs from ONE client pin all analysis slots (production config)', { todo: 'CR-02 reproduced' }, async t => {
  const { port } = await fixture(t, production());
  const ip = '198.51.100.20';
  const sockets = [];
  for (let i = 0; i < 8; i++) {
    const cookie = await session(port, ip);
    const socket = net.connect(port, '127.0.0.1');
    socket.on('error', () => {});
    await new Promise(resolve => socket.on('connect', resolve));
    socket.write(`POST /api/analyze HTTP/1.1\r\nHost: verimtomu.fyi\r\nCF-Connecting-IP: ${ip}\r\nOrigin: ${ORIGIN}\r\nCookie: ${cookie}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{`);
    sockets.push(socket);
  }
  t.after(() => sockets.forEach(socket => socket.destroy()));
  await new Promise(resolve => setTimeout(resolve, 100));
  const victim = await legitAnalyze(port, '203.0.113.60');
  assert.equal(victim.status, 200, `victim got ${victim.status} ${victim.data}`);
});

test('FINDING CR-03: a single 10 000-char input blocks the event loop for >100 ms (super-linear rule regex)', { todo: 'CR-03 reproduced' }, async () => {
  const histogram = monitorEventLoopDelay({ resolution: 1 }); histogram.enable();
  const start = performance.now();
  analyze({ type: 'text', content: 'ztrati' + 'l'.repeat(9994) });
  const elapsed = performance.now() - start; histogram.disable();
  assert.ok(elapsed < 20, `rules analysis took ${elapsed.toFixed(0)} ms synchronously on the event loop`);
});

test('FINDING CR-04: invisible / homoglyph characters remove every rules signal from an obvious scam', { todo: 'CR-04 reproduced' }, () => {
  const scam = 'Mami, mám nové číslo a rozbitý telefon. Pošli mi ihned 12 000 Kč na nový účet. Nevolej mi.';
  assert.equal(analyze({ type: 'text', content: scam }).risk_level, 'very_high');
  for (const [name, variant] of [['zero-width space', [...scam].join('​')], ['soft hyphen', scam.replace(/([aeiouáíé])/g, '$1­')],
    ['word joiner', [...scam].join('⁠')], ['Cyrillic a/o', scam.replace(/o/g, 'о').replace(/a/g, 'а')]]) {
    const result = analyze({ type: 'text', content: variant });
    assert.notEqual(result.risk_level, 'low', `${name}: score ${result.risk_score}`);
  }
});

test('FINDING CR-05: arbitrary phishing-style HTTPS URL is reported as "low" risk (shown with success character)', { todo: 'CR-05 reproduced' }, () => {
  for (const url of ['https://csas-overeni-ucet.com/login', 'https://www.ceskasporitelna.cz.secure-login.top/ib', 'https://[::1]/admin']) {
    const result = analyze({ type: 'url', content: url });
    assert.notEqual(result.risk_level, 'low', `${url}: ${result.risk_score}`);
  }
});

test('FINDING CR-06: a tossed guard_session cookie (sibling subdomain) denies the victim; no __Host- prefix', { todo: 'CR-06 reproduced' }, async t => {
  const { port } = await fixture(t, production());
  const ip = '198.51.100.30';
  const cookie = await session(port, ip);
  // Browser orders the more specific Path=/api cookie first; server reads only the first guard_session.
  const res = await request(port, { method: 'POST', path: '/api/analyze', body: analyzeBody,
    headers: { 'CF-Connecting-IP': ip, Cookie: `guard_session=tossed; ${cookie}`, Origin: ORIGIN, 'Content-Type': 'application/json' } });
  assert.equal(res.status, 200, `victim with valid session + tossed cookie got ${res.status} ${res.data}`);
  assert.match(cookie, /^__Host-/, 'session cookie should use the __Host- prefix');
});

test('FINDING CR-07: multi-MB static PNGs are unthrottled and Cache-Control: no-store (no edge caching)', { todo: 'CR-07 reproduced' }, async t => {
  const { port } = await fixture(t, production());
  let bytes = 0; let last;
  for (let i = 0; i < 100; i++) {
    last = await request(port, { path: '/assets/characters/verkarob.png', headers: { 'CF-Connecting-IP': '198.51.100.40' } });
    bytes += Buffer.byteLength(last.data, 'latin1');
  }
  assert.ok(last.status === 429 || !/no-store/.test(last.headers['cache-control']),
    `100 requests from one IP all ${last.status}, ~${(bytes / 1e6).toFixed(0)} MB egress, cache-control=${last.headers['cache-control']}`);
});

test('FINDING CR-08: without JavaScript the analysis form submits the private message via GET query string', { todo: 'CR-08 reproduced' }, async () => {
  const html = await readFile(new URL('../../public/index.html', import.meta.url), 'utf8');
  const form = html.match(/<form id="analysis-form"[^>]*>/)[0];
  const button = html.match(/<button id="submit"[^>]*>/)[0];
  assert.ok(/method="post"/i.test(form) || /\sdisabled/.test(button), `${form} … ${button}`);
});
