import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedQueue } from '../src/ai/queue.js';

test('Spike 10 000 jobů je omezen na jednoho workera a dvě čekající položky', async () => {
  const queue = new BoundedQueue({ concurrency: 1, capacity: 2 });
  let release; const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const outcomes = Array.from({ length: 10000 }, () => queue.submit(async () => { calls++; await gate; return 'ok'; }, { signal: new AbortController().signal }).catch(error => error.code));
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(queue.pending.length, 2);
  release();
  const results = await Promise.all(outcomes);
  assert.equal(results.filter(item => item === 'ok').length, 3);
  assert.equal(results.filter(item => item === 'AI_OVERLOADED').length, 9997);
  assert.equal(calls, 3);
  queue.close();
});
test('Zrušený čekající job nespustí task a uvolní payload', async () => {
  const queue = new BoundedQueue({ concurrency: 1, capacity: 1 });
  let release; const gate = new Promise(resolve => { release = resolve; });
  const active = queue.submit(() => gate, { signal: new AbortController().signal });
  const controller = new AbortController();
  let called = false;
  const pending = queue.submit(() => { called = true; }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error.code === 'AI_TIMEOUT');
  assert.equal(queue.pending.length, 0);
  release(); await active;
  assert.equal(called, false);
  queue.close();
});
test('Abort běžícího jobu neuvolní slot, dokud provider skutečně neskončí', async () => {
  const queue = new BoundedQueue({ concurrency: 1, capacity: 0 });
  let release; const gate = new Promise(resolve => { release = resolve; });
  const controller = new AbortController();
  const active = queue.submit(() => gate, { signal: controller.signal });
  await Promise.resolve(); controller.abort();
  await assert.rejects(active, error => error.code === 'AI_TIMEOUT');
  await assert.rejects(queue.submit(() => 'not called', { signal: new AbortController().signal }), error => error.code === 'AI_OVERLOADED');
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(queue.running, 0); queue.close();
});
