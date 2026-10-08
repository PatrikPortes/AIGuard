import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const mode = process.argv[2];
const base = mode === 'local' ? 'http://127.0.0.1:3000' : 'https://verimtomu.fyi';
const request = (path, options = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(8000), redirect: 'manual' });
try {
  assert.ok(['local', 'https'].includes(mode));
  const health = await request('/api/health');
  assert.equal(health.status, 200);
  const state = await health.json();
  assert.equal(state.mode, 'rules'); assert.equal(state.engine, 'rules-v1'); assert.equal(state.ai_configured, false);
  for (const path of ['/', '/privacy', '/app.js', '/style.css']) assert.equal((await request(path)).status, 200);
  for (const path of ['/.env', '/.git/HEAD', '/docs/ARCHITECTURE.md', '/tests/ingress.test.js', '/scripts/production-guard.js', '/src/server.js', '/assets/characters/', '/assets/characters/unknown.png']) {
    assert.equal((await request(path)).status, 404);
  }
  const files = [
    ...['welcome', 'thinking', 'explaining', 'warning', 'success'].map(state => `verka/verka-${state}.png`),
    ...['default', 'analyzing', 'searching', 'warning', 'success', 'tip', 'capacity', 'error'].map(state => `robo/robo-${state}.png`), 'verkarob.png',
  ];
  const hash = b => createHash('sha256').update(b).digest('hex');
  for (const file of files) {
    const response = await request(`/assets/characters/${file}`);
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(await readFile(new URL(`../public/assets/characters/${file}`, import.meta.url))));
  }
  const input = { type: 'text', content: 'Ahoj, zítra se sejdeme u knihovny.' };
  if (mode === 'local') {
    // Published loopback port is NOT an authenticated ingress, even with forged CF headers.
    assert.equal((await request('/api/session', { headers: { 'CF-Connecting-IP': '203.0.113.10' } })).status, 403);
    assert.equal((await request('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' }, body: JSON.stringify(input) })).status, 403);
  } else {
    const session = await request('/api/session'); assert.equal(session.status, 200);
    const cookie = session.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/); assert.match(cookie, /; Secure/);
    assert.equal((await request('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://attacker.invalid', Cookie: cookie.split(';')[0] }, body: JSON.stringify(input) })).status, 403);
    const response = await request('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json', Origin: base, Cookie: cookie.split(';')[0] }, body: JSON.stringify(input) });
    assert.equal(response.status, 200); assert.equal((await response.json()).engine, 'rules-v1');
  }
  console.log(`Deployment smoke ${mode}: PASS (rules, private paths, 14 exact PNGs, ingress)`);
} catch {
  // Fixed text only; never expose response bodies or credentials from failed checks.
  console.error(`Deployment smoke ${['local', 'https'].includes(mode) ? mode : 'invalid mode'}: FAIL`);
  process.exitCode = 1;
}
