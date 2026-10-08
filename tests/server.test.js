import test from 'node:test';
import assert from 'node:assert/strict';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
import { createServer } from '../src/server.js';

async function fixture(t, options) {
  const server = createServer({ pipeline: new AnalysisPipeline(), ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test('Homepage, privacy, health a skutečný HTTP textový scénář', async t => {
  const base = await fixture(t);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Co chcete ověřit/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(`${base}/privacy`)).status, 200);
  assert.equal((await (await fetch(`${base}/api/health`)).json()).status, 'ok');
  const response = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'text', content: 'Mami, mám nové číslo. Pošli ihned peníze.' }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.risk_level, 'very_high');
  assert.equal(result.engine, 'rules-v1');
  assert.ok(result.verification_steps.length > 0);
});
test('Neplatný JSON, MIME, velikost, nepodporovaný upload a cesta', async t => {
  const base = await fixture(t);
  const post = (body, contentType = 'application/json') => fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': contentType }, body });
  assert.equal((await post('{')).status, 400);
  assert.equal((await post('{}', 'text/plain')).status, 415);
  assert.equal((await post(JSON.stringify({ type: 'image', content: 'abc' }))).status, 400);
  assert.equal((await post('x'.repeat(66000))).status, 413);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
});
test('Limiter odmítne překročení a po expiraci znovu pustí požadavek', async t => {
  let now = 1000;
  const base = await fixture(t, { rateLimit: 1, windowMs: 50, limiterClock: () => now });
  const post = () => fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'text', content: 'Ahoj.' }) });
  assert.equal((await post()).status, 200);
  const limited = await post();
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
  now += 51;
  assert.equal((await post()).status, 200);
});

test('Podepsaná anonymní session má samostatný limit a cookie není klientem čitelná', async t => {
  const base = await fixture(t, { rateLimit: 20, sessionRateLimit: 1 });
  const session = await fetch(`${base}/api/session`);
  const cookie = session.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  const post = (value = cookie.split(';')[0]) => fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: value }, body: JSON.stringify({ type: 'text', content: 'Ahoj.' }) });
  assert.equal((await post()).status, 200);
  assert.equal((await post()).status, 429);
  const forged = cookie.split(';')[0].slice(0, -1) + (cookie.split(';')[0].endsWith('A') ? 'B' : 'A');
  const response = await post(forged);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('set-cookie'));
});
test('X-Forwarded-For ani nové cookies neobcházejí IP limit', async t => {
  const base = await fixture(t, { rateLimit: 1 });
  const post = ip => fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ type: 'text', content: 'Ahoj.' }) });
  assert.equal((await post('1.2.3.4')).status, 200);
  assert.equal((await post('2.3.4.5')).status, 429);
});
test('Vyžadovaná bot ochrana bez verifikátoru selže bezpečně', async t => {
  const base = await fixture(t, { requireBotCheck: true });
  const response = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'text', content: 'Ahoj.' }) });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'BOT_CHECK_REQUIRED');
});
