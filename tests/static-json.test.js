import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from '../src/server.js';

// Static JSON assets are served byte-for-byte; they must never be re-serialised
// (a Buffer passed through JSON.stringify becomes {"type":"Buffer","data":[…]}).
test('static JSON assets are served verbatim, the legal catalogue stays []', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const catalogue = await fetch(base + '/contract-legal-catalog.json');
    assert.equal(catalogue.status, 200);
    assert.match(catalogue.headers.get('content-type'), /^application\/json/);
    const body = await catalogue.text();
    assert.equal(body, await readFile(new URL('../public/contract-legal-catalog.json', import.meta.url), 'utf8'));
    assert.deepEqual(JSON.parse(body), []);
    // API JSON objects are still serialised.
    const health = await fetch(base + '/api/health');
    assert.equal((await health.json()).status, 'ok');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
