import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from '../src/server.js';
import { characterAssetFiles } from '../public/character-assets.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';

const files = {
  verka: ['welcome', 'thinking', 'explaining', 'warning', 'success'],
  robo: ['default', 'analyzing', 'searching', 'warning', 'success', 'tip', 'capacity', 'error'],
};
test('Schválené PNG zůstávají beze změny; explicitní WebP delivery má přesné bytes/MIME a legacy redirect', async t => {
  const server = createServer({ pipeline: new AnalysisPipeline(), staticBytesPerMinute: 8 * 1024 * 1024 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const hash = buffer => createHash('sha256').update(buffer).digest('hex');
  const paths = Object.entries(files).flatMap(([character, states]) =>
    states.map(state => `assets/characters/${character}/${character}-${state}.png`));
  paths.push('assets/characters/verkarob.png');
  assert.equal(characterAssetFiles.length, paths.length);
  for (const path of paths) {
    const asset = characterAssetFiles.find(item => item.source === path);
    assert.ok(asset);
    const original = await readFile(new URL(`../public/${path}`, import.meta.url));
    assert.equal(hash(original), asset.source_sha256);
    const redirect = await fetch(`${base}/${path}`, { redirect: 'manual' });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get('location'), asset.url);
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
