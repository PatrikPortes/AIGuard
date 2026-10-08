import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from '../src/server.js';
import { AnalysisPipeline } from '../src/ai/pipeline.js';

const files = {
  verka: ['welcome', 'thinking', 'explaining', 'warning', 'success'],
  robo: ['default', 'analyzing', 'searching', 'warning', 'success', 'tip', 'capacity', 'error'],
};
test('Schválené PNG se servírují s přesnými bytes a správným MIME, jiné cesty zůstávají uzavřené', async t => {
  const server = createServer({ pipeline: new AnalysisPipeline() });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const hash = buffer => createHash('sha256').update(buffer).digest('hex');
  const paths = Object.entries(files).flatMap(([character, states]) =>
    states.map(state => `assets/characters/${character}/${character}-${state}.png`));
  paths.push('assets/characters/verkarob.png');
  for (const path of paths) {
    const response = await fetch(`${base}/${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const original = await readFile(new URL(`../public/${path}`, import.meta.url));
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(original));
  }
  for (const path of ['/assets/characters/verka/verka-default.png', '/assets/characters/verkarob-copy.png', '/assets/characters/robo/unknown.png', '/assets/characters/robo/', '/assets/characters/robo/%2e%2e/%2e%2e/%2e%2e/.env', '/docs/design/VERIM_CHARACTER_REFERENCE.png', '/.env', '/src/ai/runtime.js']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
});
