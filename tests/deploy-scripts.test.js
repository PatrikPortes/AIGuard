import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const previous = 'a'.repeat(40);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'verim-release-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'env')); await mkdir(join(root, 'bin'));
  const template = await readFile(new URL('../deploy/env/deployment.env.example', import.meta.url), 'utf8');
  await writeFile(join(root, 'env/deployment.env'), template.replaceAll('<APPROVED_FULL_COMMIT_SHA>', previous)
    .replace('<AUDITED_UNUSED_RFC1918_SUBNET>', '10.123.45.0/29').replace('<APP_IP_IN_THAT_SUBNET>', '10.123.45.2').replace('<CONNECTOR_IP_IN_THAT_SUBNET>', '10.123.45.3'));
  await writeFile(join(root, 'env/app.env'), 'AI_MODE=rules\n');
  await writeFile(join(root, 'compose.yaml'), 'name: verimtomu\n');
  await writeFile(join(root, 'previous-image'), `verimtomu:${previous}\n`);
  await writeFile(join(root, 'bin/docker'), `#!${process.execPath}
const fs=require('node:fs');const args=process.argv.slice(2);
fs.appendFileSync(process.env.CALLS,JSON.stringify(args)+'\\n');
if(args[0]==='image' && args[1]==='inspect')console.log('${previous}');
if(args[0]==='context')console.log('unix:///var/run/docker.sock');
if(args[0]==='version')console.log(process.env.ENGINE_VERSION||'28.4.0');
if(process.env.FAIL_UP==='true' && args.includes('up'))process.exit(1);
if(process.env.FAIL_SMOKE==='true' && args.includes('exec'))process.exit(1);
`, { mode: 0o755 });
  return { root, env: { ...process.env, VERIM_DEPLOY_ROOT: root, CALLS: join(root, 'calls'), PATH: `${join(root, 'bin')}:${process.env.PATH}` } };
}

test('Release helper při chybě Compose up nespustí smoke proti starému kontejneru', async t => {
  const { root, env } = await fixture(t);
  const common = fileURLToPath(new URL('../deploy/scripts/common.sh', import.meta.url));
  const result = spawnSync('bash', ['-c', 'source "$1"; if activate_image "$VERIM_APP_IMAGE"; then exit 0; else exit 7; fi', 'fixture', common], { env: { ...env, FAIL_UP: 'true' } });
  assert.equal(result.status, 7);
  const calls = (await readFile(join(root, 'calls'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(calls.some(call => call.includes('up')));
  assert.ok(!calls.some(call => call.includes('exec')));
});

test('Rollback aktivuje jen app ve vlastním projektu a uloží image až po smoke PASS', async t => {
  const { root, env } = await fixture(t);
  const rollback = fileURLToPath(new URL('../deploy/scripts/rollback.sh', import.meta.url));
  const result = spawnSync('bash', [rollback], { env });
  assert.equal(result.status, 0, result.stderr.toString());
  const calls = (await readFile(join(root, 'calls'), 'utf8')).trim().split('\n').map(JSON.parse);
  for (const call of calls.filter(call => call[0] === 'compose')) {
    assert.equal(call[call.indexOf('--project-name') + 1], 'verimtomu');
    assert.ok(!call.includes('cloudflared') && !call.includes('down') && !call.includes('restart'));
  }
  const up = calls.find(call => call.includes('up'));
  assert.ok(up.includes('--no-deps')); assert.equal(up.at(-1), 'app');
  assert.match(await readFile(join(root, 'env/deployment.env'), 'utf8'), new RegExp(`VERIM_APP_IMAGE=verimtomu:${previous}`));
});

test('Rollback s neúspěšným smoke neuloží změněné image nastavení', async t => {
  const { root, env } = await fixture(t);
  const settings = join(root, 'env/deployment.env');
  const original = await readFile(settings, 'utf8');
  const result = spawnSync('bash', [fileURLToPath(new URL('../deploy/scripts/rollback.sh', import.meta.url))], { env: { ...env, FAIL_SMOKE: 'true' } });
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(settings, 'utf8'), original);
});

test('Release helper odmítne starý Docker před jakoukoli Compose změnou', async t => {
  const { root, env } = await fixture(t);
  const result = spawnSync('bash', [fileURLToPath(new URL('../deploy/scripts/rollback.sh', import.meta.url))], { env: { ...env, ENGINE_VERSION: '27.5.0' } });
  assert.notEqual(result.status, 0);
  const calls = (await readFile(join(root, 'calls'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(!calls.some(call => call[0] === 'compose'));
});

test('Deployment lock brání souběžnému rollbacku před Docker mutací', async t => {
  const { root, env } = await fixture(t);
  const result = spawnSync('flock', ['-n', join(root, 'release.lock'), 'bash', fileURLToPath(new URL('../deploy/scripts/rollback.sh', import.meta.url))], { env });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr.toString(), /Another AIGuard release operation/);
  await assert.rejects(readFile(join(root, 'calls')));
});

test('Neúplná/plovoucí upstream image je odmítnuta před Compose operací', async t => {
  const { root, env } = await fixture(t);
  const settings = join(root, 'env/deployment.env');
  await writeFile(settings, (await readFile(settings, 'utf8')).replace(/VERIM_CLOUDFLARED_SOURCE_IMAGE=.*/, 'VERIM_CLOUDFLARED_SOURCE_IMAGE=cloudflare/cloudflared:latest'));
  const result = spawnSync('bash', [fileURLToPath(new URL('../deploy/scripts/rollback.sh', import.meta.url))], { env });
  assert.notEqual(result.status, 0);
  const calls = (await readFile(join(root, 'calls'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(!calls.some(call => call[0] === 'compose'));
});
