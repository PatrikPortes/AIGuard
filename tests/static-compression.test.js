import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createServer } from '../src/server.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
import { characterAssetFiles } from '../public/character-assets.js';

async function fixture(t) {
  const server = createServer({ pipeline: new AnalysisPipeline() });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return (path, encoding) => new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: server.address().port, path,
      headers: encoding === undefined ? {} : { 'Accept-Encoding': encoding } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
}

test('LUX-03: all allowlisted static text uses real gzip with exact decoded bytes and no-store', async t => {
  const get = await fixture(t);
  for (const [path, file] of [['/', 'index.html'], ['/privacy', 'privacy.html'], ['/uz-se-to-stalo', 'uz-se-to-stalo.html'],
    ['/app.js', 'app.js'], ['/style.css', 'style.css'], ['/loan.js', 'loan.js'], ['/loan.css', 'loan.css'], ['/character-assets.js', 'character-assets.js']]) {
    const expected = await readFile(new URL(`../public/${file}`, import.meta.url));
    const plain = await get(path, 'identity');
    const compressed = await get(path, 'br, gzip, deflate');
    assert.equal(plain.status, 200); assert.equal(compressed.status, 200);
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.equal(compressed.headers['content-encoding'], 'gzip');
    assert.equal(plain.headers.vary, 'Accept-Encoding');
    assert.equal(compressed.headers.vary, 'Accept-Encoding');
    assert.deepEqual(plain.body, expected); assert.deepEqual(gunzipSync(compressed.body), expected);
    assert.ok(compressed.body.length < expected.length, path);
    for (const header of ['content-type', 'content-security-policy', 'x-content-type-options', 'referrer-policy',
      'x-frame-options', 'cache-control', 'permissions-policy']) assert.equal(compressed.headers[header], plain.headers[header], header);
    assert.equal(compressed.headers['cache-control'], 'no-store');
  }
});

test('LUX-03: gzip negotiation respects explicit tokens, quality and identity fallback', async t => {
  const get = await fixture(t);
  for (const encoding of [undefined, 'identity', '*', 'xgzip', 'gzip;q=0', 'gzip;q=0.000', 'gzip;q=2',
    'gzip;q=garbage', 'gzip;q=0.5;other=1', 'gzip;q=0.1234']) {
    const response = await get('/style.css', encoding);
    assert.equal(response.status, 200); assert.equal(response.headers['content-encoding'], undefined, String(encoding));
  }
  for (const encoding of ['gzip', 'GZIP', 'br, gzip;q=0.5', 'gzip; q=1.000', 'gzip;q=0.001']) {
    assert.equal((await get('/style.css', encoding)).headers['content-encoding'], 'gzip', encoding);
  }
});

test('LUX-03: APIs, character bytes, forbidden routes and rejected requests never become compressed', async t => {
  const get = await fixture(t);
  // /favicon.ico is now an approved binary icon: served, never compressed, no-store.
  const favicon = await get('/favicon.ico', 'gzip');
  assert.equal(favicon.status, 200); assert.equal(favicon.headers['content-type'], 'image/x-icon');
  assert.equal(favicon.headers['content-encoding'], undefined); assert.equal(favicon.headers['cache-control'], 'no-store');
  for (const path of ['/api/session', '/api/health', '/.env', '/.git/config', '/docs/security/SECURITY_RELEASE_GATE.md',
    '/assets/unapproved.webp', '/assets/characters/optimized/../unapproved.webp', '/%2e%2e/.env']) {
    const response = await get(path, 'gzip');
    assert.equal(response.headers['content-encoding'], undefined, path);
    assert.equal(response.headers['cache-control'], 'no-store', path);
    const invalidPath = path.includes('/../') || path.includes('%');
    assert.equal(response.status, path.startsWith('/api/') ? 200 : invalidPath ? 400 : 404, path);
  }
  const asset = characterAssetFiles.find(item => item.url.includes('robo-default.'));
  const response = await get(asset.url, 'gzip');
  assert.equal(response.status, 200); assert.equal(response.headers['content-encoding'], undefined);
  assert.deepEqual(response.body, await readFile(new URL(`../public/${asset.url.slice(1)}`, import.meta.url)));
  assert.equal(response.headers.etag, `"${asset.sha256}"`);
  assert.equal(response.headers['cache-control'], 'public, max-age=31536000, immutable');
});
