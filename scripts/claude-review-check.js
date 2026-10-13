// The independently authored suite is immutable, including its TODO metadata.
// Re-pinned 2026-10-13 (owner-approved maintenance): CR-08 now enforces the same
// no-JS GET invariant on every public page instead of only index.html.
// Previous pin: 94eabe970bc359b2fc03e5ea70cca199524c432e680af4eb3a31d5ffcb2bc748.
// Node treats failing TODO tests as exit 0: reject every TAP `not ok` ourselves.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const suite = new URL('../tests/adversarial/claude-review.adversarial.mjs', import.meta.url);
assert.equal(createHash('sha256').update(readFileSync(suite)).digest('hex'), 'b21400ada3989bc3cfb9e03dbab6fd84ceaa32b317cbb3558c927619eed1c61e', 'Claude suite changed');
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite.pathname], { encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
const output = result.stdout || '';
const failures = output.match(/^not ok \d+ /gm) || [];
const passes = output.match(/^ok \d+ /gm) || [];
if (result.status !== 0 || result.error || failures.length || passes.length !== 16 || /^ok .*# SKIP/m.test(output)) {
  console.error(`Claude strict gate: FAIL (${passes.length} passing assertions, ${failures.length} failures, exit ${result.status})`);
  process.exit(1);
}
console.log('Claude strict gate: PASS (16/16 executed assertions; 9 original TODO labels retained, no assertion failure permitted)');
