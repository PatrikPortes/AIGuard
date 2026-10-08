import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
const original = assert.ok;
assert.ok = function (...args) {
  if (typeof args[1] === 'string' && /^Maximum CPU [0-9.]+ ms; threshold 20 ms$/.test(args[1])) {
    writeSync(1, `CR03_CPU_OBSERVATION ${args[1]}\n`);
  }
  return Reflect.apply(original, this, args);
};
