import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from '../src/server.js';
import { characterAssetFiles } from '../public/character-assets.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';
import { APPROVED_SOURCES, APPROVED_RESPONSIVE_SOURCES, MAX_STATE_BYTES, MAX_LEGACY_HERO_BYTES } from '../test-support/approved-character-assets.js';

test('Schválené PNG zůstávají beze změny; explicitní WebP delivery má přesné bytes/MIME a legacy redirect', async t => {
  const server = createServer({ pipeline: new AnalysisPipeline(), staticBytesPerMinute: 8 * 1024 * 1024 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const hash = buffer => createHash('sha256').update(buffer).digest('hex');
  // Exactly the reviewed manifest: no missing and no unexpected character asset.
  const paths = [...APPROVED_SOURCES];
  assert.deepEqual(characterAssetFiles.map(asset => asset.source).sort(), [...paths].sort());
  assert.equal(new Set(characterAssetFiles.map(asset => asset.url)).size, paths.length);
  for (const asset of characterAssetFiles) {
    const responsive = APPROVED_RESPONSIVE_SOURCES[asset.source];
    const ceiling = responsive ? responsive.maxBytes : asset.source === 'assets/characters/verkarob.png' ? MAX_LEGACY_HERO_BYTES : MAX_STATE_BYTES;
    assert.ok(asset.bytes <= ceiling, `${asset.source}: ${asset.bytes} > ${ceiling}`);
    if (responsive) assert.equal(asset.width, responsive.width, asset.source);
  }
  for (const path of paths) {
    const asset = characterAssetFiles.find(item => item.source === path);
    assert.ok(asset);
    const original = await readFile(new URL(`../public/${path}`, import.meta.url));
    assert.equal(hash(original), asset.source_sha256);
    const redirect = await fetch(`${base}/${path}`, { redirect: 'manual' });
    if (Object.hasOwn(APPROVED_RESPONSIVE_SOURCES, path)) {
      // Responsive sources were never public URLs: no legacy redirect and no PNG delivery.
      assert.equal(redirect.status, 404, path);
    } else {
      assert.equal(redirect.status, 301);
      assert.equal(redirect.headers.get('location'), asset.url);
    }
    const response = await fetch(`${base}${asset.url}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), asset.sha256);
  }
  for (const path of ['/assets/characters/verka/verka-default.png', '/assets/characters/verkarob-copy.png', '/assets/characters/robo/unknown.png', '/assets/characters/robo/', '/assets/characters/robo/%2e%2e/%2e%2e/%2e%2e/.env', '/docs/design/VERIM_CHARACTER_REFERENCE.png', '/.env', '/src/ai/runtime.js']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
});
