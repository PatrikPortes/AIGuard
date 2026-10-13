import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lookupAres, aresRelayFromEnv, ARES_RELAY_URL, validateRegistryInput } from '../src/eshop-sources.js';

const ARES = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/';
const token = 'sk-' + 'r'.repeat(32);

// Start the real relay source with the isolated fake upstream (no network).
async function relay(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ares-relay-')), file = join(dir, 'relay.cjs');
  writeFileSync(file, readFileSync(new URL('../ai-proxy.cjs', import.meta.url), 'utf8')
    .replace("server.listen(8080,'0.0.0.0');", "server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));"));
  const child = fork(file, [], { silent: true, execArgv: ['--require', new URL('../test-support/contract/relay-fetch.cjs', import.meta.url).pathname],
    env: { ...process.env, OPENAI_API_KEY: token, AI_CONTRACT_MODEL: 'contract-test-model' } });
  const upstream = [];
  child.on('message', message => { if (message.upstream) upstream.push(message); });
  const port = await new Promise((resolve, reject) => { child.once('message', m => resolve(m.port)); child.once('exit', code => reject(Error('Relay failed ' + code))); });
  t.after(async () => { child.kill('SIGTERM'); await new Promise(r => child.once('exit', r)); rmSync(dir, { recursive: true }); });
  const base = 'http://127.0.0.1:' + port;
  const post = (body, { key = token, path = '/v1/registry/ares', raw } = {}) => fetch(base + path, {
    method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: raw ?? JSON.stringify(body) });
  return { base, post, upstream };
}

test('ARES relay: a valid IČO is looked up at the fixed endpoint and only displayed fields are forwarded', async t => {
  const { post, upstream } = await relay(t);
  const r = await post({ ico: '00006947' });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ico, '00006947'); assert.equal(body.obchodniJmeno, 'Ministerstvo financí');
  assert.equal(body.secretInternal, undefined);
  assert.deepEqual(Object.keys(body).sort(), ['ico', 'obchodniJmeno', 'pravniForma', 'seznamRegistraci', 'sidlo']);
  assert.deepEqual(upstream, [{ upstream: ARES + '00006947', redirect: 'error' }]);
  assert.equal((await post({ ico: '00020869' })).status, 404);
});

test('ARES relay: invalid IČO, extra fields, URL/hostname/path injection and wrong auth never reach upstream', async t => {
  const { post, base, upstream } = await relay(t);
  for (const ico of ['0000694', '000069470', '00006948', 'abcdefgh', '0000694a', ' 00006947', '00006947 ', '00006947/../../x', '../00006947', 'https://evil.invalid', '00006947?x=1', '00006947#x', 6947, null, ['00006947']]) {
    assert.equal((await post({ ico })).status, 400, JSON.stringify(ico));
  }
  for (const extra of [{ url: 'https://evil.invalid/' }, { hostname: 'evil.invalid' }, { host: '127.0.0.1' }, { path: '/admin' }, { protocol: 'http:' }, { endpoint: ARES }]) {
    assert.equal((await post({ ico: '00006947', ...extra })).status, 400, JSON.stringify(extra));
  }
  for (const raw of ['', '{', '[]', '"00006947"', 'null', '{"ico":"00006947","ico":"00006947","x":1}', '{"ico":"' + '0'.repeat(80) + '"}']) {
    assert.equal((await post(null, { raw })).status, 400, raw);
  }
  assert.equal((await post({ ico: '00006947' }, { key: 'sk-wrong' })).status, 403);
  for (const path of ['/v1/registry/ares/00006947', '/v1/registry/ares?url=https://evil.invalid', '/v1/registry/', '/v1/registry/ares/../../v1/chat/completions']) {
    assert.equal((await post({ ico: '00006947' }, { path })).status, 403, path);
  }
  assert.equal((await fetch(base + '/v1/registry/ares', { method: 'GET', headers: { Authorization: 'Bearer ' + token } })).status, 403);
  assert.deepEqual(upstream, []);
});

test('ARES relay: redirect, oversized, non-JSON, mismatched and slow upstream answers fail closed', async t => {
  const { post, upstream } = await relay(t);
  for (const ico of ['00023221', '00023264', '00023272', '00023281']) assert.equal((await post({ ico })).status, 502, ico);
  const started = Date.now();
  assert.equal((await post({ ico: '00023299' })).status, 502);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 3000 && elapsed < 4000, 'relay upstream timeout below the app 4 s budget: ' + elapsed);
  assert.ok(upstream.every(call => call.upstream.startsWith(ARES) && call.redirect === 'error'));
});

test('ARES relay: at most 2 concurrent lookups and 20 per minute; AI relay routes keep their own profile', async t => {
  const { post } = await relay(t);
  const slow = [post({ ico: '00023299' }), post({ ico: '00023299' })];
  await new Promise(r => setTimeout(r, 150));
  assert.equal((await post({ ico: '00006947' })).status, 429);
  assert.deepEqual((await Promise.all(slow)).map(r => r.status), [502, 502]);
  const statuses = [];
  for (let i = 0; i < 20; i++) statuses.push((await post({ ico: '00006947' })).status);
  // The two slow lookups used 2 of the 20 slots; the rejected concurrent call used none.
  assert.deepEqual(statuses, [...Array(18).fill(200), 429, 429]);
  const message = { model: 'gpt-4.1-mini-2025-04-14', max_completion_tokens: 800, store: false, stream: false, response_format: { type: 'json_schema', json_schema: { strict: true, schema: { type: 'object' } } }, messages: [{ role: 'user', content: 'synthetic' }] };
  assert.equal((await post(message, { path: '/v1/chat/completions' })).status, 200);
  assert.equal((await post({ ico: '00006947' }, { path: '/v1/chat/completions' })).status, 400);
});

test('ARES client: relay mode sends only the IČO to the fixed private relay and degrades to NEOVĚŘENO', async () => {
  assert.equal(ARES_RELAY_URL, 'http://172.30.41.3:8080/v1/registry/ares');
  assert.equal(aresRelayFromEnv({}), null);
  assert.equal(aresRelayFromEnv({ AI_INTERNAL_PROXY: 'true' }), null);
  assert.deepEqual(aresRelayFromEnv({ AI_INTERNAL_PROXY: 'true', OPENAI_API_KEY: token }), { authorization: 'Bearer ' + token });
  const relay = aresRelayFromEnv({ AI_INTERNAL_PROXY: 'true', OPENAI_API_KEY: token });
  const calls = [];
  const ok = await lookupAres('00006947', { relay, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ ico: '00006947', obchodniJmeno: 'Ministerstvo financí', sidlo: { textovaAdresa: 'Letenská 525/15' }, pravniForma: '325', seznamRegistraci: {} }), { status: 200 });
  } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ARES_RELAY_URL); assert.equal(calls[0].options.method, 'POST'); assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.body, '{"ico":"00006947"}'); assert.ok(calls[0].options.signal);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + token);
  assert.equal(ok.status, 'NEOVĚŘENO'); assert.equal(ok.domainAssociationVerified, false); assert.equal(ok.entity.name, 'Ministerstvo financí');
  for (const failure of [async () => { throw Error('offline'); }, async () => new Response('{}', { status: 502 }), async () => new Response('{}', { status: 429 }),
    async () => new Response('{"ico":"00006947","obchodniJmeno":"' + 'x'.repeat(130000) + '"}', { status: 200 }), async () => new Response('not json', { status: 200 })]) {
    const result = await lookupAres('00006947', { relay, fetchImpl: failure });
    assert.equal(result.status, 'NEOVĚŘENO'); assert.equal(result.entity, undefined);
    assert.match(result.registryFinding, /ARES je nedostupný/);
  }
  const missing = await lookupAres('00020869', { relay, fetchImpl: async () => new Response('{}', { status: 404 }) });
  assert.equal(missing.status, 'NEOVĚŘENO'); assert.match(missing.registryFinding, /nebyl v ARES nalezen/);
  // An invalid IČO never leaves the application.
  let called = false;
  const invalid = await lookupAres('00006948', { relay, fetchImpl: async () => { called = true; } });
  assert.equal(called, false); assert.equal(invalid.status, 'NEOVĚŘENO');
  assert.throws(() => validateRegistryInput({ ico: '00006947', url: 'https://evil.invalid' }));
  const started = Date.now();
  const slow = await lookupAres('00006947', { relay, fetchImpl: (url, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })) });
  assert.equal(slow.status, 'NEOVĚŘENO'); assert.ok(Date.now() - started < 4600, 'app timeout 4 s');
});
