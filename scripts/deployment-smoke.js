import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { characterAssetFiles } from '../public/character-assets.js';
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
  // Loan flow UI, loaded on demand by app.js: legitimate exact routes with their
  // own types; look-alike paths stay outside the allowlist.
  for (const [path, type] of [['/loan.js', 'text/javascript; charset=utf-8'], ['/loan.css', 'text/css; charset=utf-8']]) {
    const response = await request(path);
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), type);
    const body = await response.text();
    if (mode === 'local') assert.equal(body, await readFile(new URL(`../public${path}`, import.meta.url), 'utf8'));
  }
  for (const path of ['/LOAN.JS', '/Loan.css', '/loan.js/', '/loan.js.', '/loan.mjs', '/loan', '/public/loan.js', '/assets/loan.js', '/loan.css.map']) {
    assert.ok([400, 404].includes((await request(path)).status));
  }
  for (const path of ['/.env', '/.git/HEAD', '/docs/ARCHITECTURE.md', '/tests/ingress.test.js', '/scripts/production-guard.js', '/src/server.js', '/assets/characters/', '/assets/characters/unknown.png']) {
    assert.equal((await request(path)).status, 404);
  }
  const hash = b => createHash('sha256').update(b).digest('hex');
  // Conditional validation transfers no body and cannot exhaust the public
  // client's image-byte bucket merely by running a health/release smoke check.
  for (const asset of characterAssetFiles) {
    if (mode === 'local') {
      const bytes = await readFile(new URL('../public'+asset.url,import.meta.url));
      assert.equal(bytes.length,asset.bytes); assert.equal(hash(bytes),asset.sha256);
    }
    const alias = await request('/'+asset.source);
    assert.equal(alias.status, 301); assert.equal(alias.headers.get('location'),asset.url);
    const response = await request(asset.url, {headers:{'If-None-Match':`"${asset.sha256}"`}});
    assert.equal(response.status,304); assert.match(response.headers.get('cache-control'),/immutable/);
  }
  // Verify actual byte integrity of one delivery too (the server checks every
  // first file load against the manifest). Others were checked during build.
  const asset = characterAssetFiles[0], delivery = await request(asset.url);
  assert.equal(delivery.status,200); assert.equal(delivery.headers.get('content-type'),'image/webp');
  assert.equal(hash(Buffer.from(await delivery.arrayBuffer())),asset.sha256);
  const input = { type: 'text', content: 'Ahoj, zítra se sejdeme u knihovny.' };
  if (mode === 'local') {
    // An in-container loopback request is NOT an authenticated ingress, even with forged CF headers.
    assert.equal((await request('/api/session', { headers: { 'CF-Connecting-IP': '203.0.113.10' } })).status, 403);
    assert.equal((await request('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' }, body: JSON.stringify(input) })).status, 403);
  } else {
    const session = await request('/api/session'); assert.equal(session.status, 200);
    const cookie = session.headers.get('set-cookie'); assert.match(cookie, /^__Host-guard_session=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /; Secure/);
    assert.equal((await request('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://attacker.invalid', Cookie: cookie.split(';')[0] }, body: JSON.stringify(input) })).status, 403);
    const response = await request('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json', Origin: base, Cookie: cookie.split(';')[0] }, body: JSON.stringify(input) });
    assert.equal(response.status, 200); assert.equal((await response.json()).engine, 'rules-v1');
  }
  console.log(`Deployment smoke ${mode}: PASS (rules, private paths, loan UI assets + look-alikes, 14 immutable WebP routes + legacy aliases, ingress)`);
} catch {
  // Fixed text only; never expose response bodies or credentials from failed checks.
  console.error(`Deployment smoke ${['local', 'https'].includes(mode) ? mode : 'invalid mode'}: FAIL`);
  process.exitCode = 1;
}
