import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Loan cold start: first pipeline analysis in a fresh process stays below unchanged 20ms CPU', t => {
  // No warmup, preceding analysis, GC flags or runner-concurrency override.
  // Import/constructor startup is reported separately from the existing
  // per-analysis process-CPU criterion; wall time does not replace that budget.
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { AnalysisPipeline } from './src/ai/pipeline.js';
    const pipeline = new AnalysisPipeline();
    const content = ('pujcka ' + 'schvaleni'.repeat(2000)).slice(0, 10000);
    const heapBefore = process.memoryUsage().heapUsed;
    const startup = process.cpuUsage();
    const before = process.cpuUsage(), start = performance.now();
    const result = await pipeline.analyze({ type: 'text', content });
    const used = process.cpuUsage(before), wallMs = performance.now() - start;
    const measurement = { node: process.version, chars: content.length, warmupCalls: 0,
      cpuMs: (used.user + used.system) / 1000, wallMs,
      startupCpuMs: (startup.user + startup.system) / 1000,
      heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore, topic: result.topic };
    pipeline.close();
    console.log(JSON.stringify(measurement));
  `], { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, AI_MODE: 'rules' } });
  assert.equal(child.status, 0, child.stderr || String(child.error || child.signal));
  const measurement = JSON.parse(child.stdout);
  t.diagnostic(JSON.stringify(measurement));
  assert.equal(measurement.chars, 10000); assert.equal(measurement.warmupCalls, 0);
  assert.equal(measurement.topic, 'loan');
  assert.ok(measurement.cpuMs < 20, `Cold first-analysis CPU ${measurement.cpuMs} ms; threshold 20 ms`);
});
