import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const previous = 'a'.repeat(40);
const previousId = 'sha256:' + 'b'.repeat(64);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'verim-release-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'env')); await mkdir(join(root, 'bin'));
  const template = await readFile(new URL('../deploy/env/deployment.env.example', import.meta.url), 'utf8');
  await writeFile(join(root, 'env/deployment.env'), template.replace('<APPROVED_APP_IMAGE_ID>', 'b'.repeat(64)).replace('<APPROVED_CONNECTOR_IMAGE_ID>', 'c'.repeat(64))
    .replace('<AUDITED_UNUSED_RFC1918_SUBNET>', '10.123.45.0/29').replace('<APP_IP_IN_THAT_SUBNET>', '10.123.45.2').replace('<CONNECTOR_IP_IN_THAT_SUBNET>', '10.123.45.3'));
  await writeFile(join(root, 'env/app.env'), 'AI_MODE=rules\n');
  await writeFile(join(root, 'compose.yaml'), 'name: verimtomu\n');
  await writeFile(join(root, 'previous-image'), `${previousId}\n`);
  await writeFile(join(root, 'bin/docker'), `#!${process.execPath}
const fs=require('node:fs');const args=process.argv.slice(2);
fs.appendFileSync(process.env.CALLS,JSON.stringify(args)+'\\n');
if(args[0]==='image' && args[1]==='inspect')console.log(args.includes('{{.Id}}')?(process.env.BAD_IMAGE_ID||args.at(-1)):'${previous}');
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
  assert.match(await readFile(join(root, 'env/deployment.env'), 'utf8'), new RegExp(`VERIM_APP_IMAGE=${previousId}`));
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

async function buildFixture(t) {
  const f = await fixture(t);
  const revision = 'd'.repeat(40), id = 'sha256:' + 'd'.repeat(64);
  await mkdir(join(f.root, 'source'));
  await mkdir(join(f.root, 'approved-export'));
  await writeFile(join(f.root, 'approved-export/approved-source'), 'from-approved-commit\n');
  await writeFile(join(f.root, 'source/approved-source'), 'dirty-worktree-must-not-be-built\n');
  await writeFile(join(f.root, 'bin/git'), `#!${process.execPath}
const fs=require('node:fs'),cp=require('node:child_process'),args=process.argv.slice(2);
fs.appendFileSync(process.env.GIT_CALLS,JSON.stringify(args)+'\\n');
if(args.includes('rev-parse'))console.log(args.at(-1).endsWith('^{tree}')?'${'e'.repeat(40)}':'${revision}');
else if(args.includes('archive')){const r=cp.spawnSync('tar',['-c','-C',process.env.APPROVED_EXPORT,'.'],{stdio:['ignore','inherit','inherit']});process.exit(r.status);}
else process.exit(9);
`, {mode:0o755});
  await writeFile(join(f.root, 'bin/docker'), `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),args=process.argv.slice(2);
fs.appendFileSync(process.env.CALLS,JSON.stringify(args)+'\\n');
if(args[0]==='context')console.log('unix:///var/run/docker.sock');
if(args[0]==='version')console.log('28.4.0');
// Every cached tag exists and lies about having the correct revision.
if(args[0]==='image' && args[1]==='inspect')console.log(args.includes('{{.Id}}')?(process.env.BAD_IMAGE_ID||args.at(-1)):'${revision}');
if(args[0]==='build'){
 const source=fs.readFileSync(path.join(args.at(-1),'approved-source'),'utf8');if(source!=='from-approved-commit\\n')process.exit(8);
 if(process.env.MISSING_IID!=='true')fs.writeFileSync(args[args.indexOf('--iidfile')+1],'${id}\\n');
}
if(args.includes('up'))fs.appendFileSync(process.env.ACTIVE_IMAGES,process.env.VERIM_APP_IMAGE+'\\n');
`, {mode:0o755});
  return {...f, revision, id, env:{...f.env, GIT_CALLS:join(f.root,'git-calls'), APPROVED_EXPORT:join(f.root,'approved-export'), ACTIVE_IMAGES:join(f.root,'active-images')}};
}
test('CR-10: existing SHA-like tag never bypasses clean Git archive/build; activation uses captured immutable ID', async t => {
  const {root,env,revision,id} = await buildFixture(t);
  const result=spawnSync('bash',[fileURLToPath(new URL('../deploy/scripts/deploy.sh',import.meta.url)),revision],{env});
  assert.equal(result.status,0,result.stderr.toString());
  const calls=(await readFile(join(root,'calls'),'utf8')).trim().split('\n').map(JSON.parse);
  const build=calls.find(c=>c[0]==='build'); assert.ok(build); assert.ok(build.includes('--iidfile'));
  assert.equal(build[build.indexOf('--platform')+1],'linux/amd64');
  assert.ok(calls.find(c=>c[0]==='run').includes(id));
  assert.equal((await readFile(join(root,'active-images'),'utf8')).trim(),id);
  assert.match(await readFile(join(root,'env/deployment.env'),'utf8'),new RegExp(`VERIM_APP_IMAGE=${id}`));
  assert.match(await readFile(join(build.at(-1),'release-manifest'),'utf8'),new RegExp(`source_commit=${revision}\\nsource_tree=${'e'.repeat(40)}\\nimage_id=${id}`));
  const gitCalls=(await readFile(join(root,'git-calls'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(gitCalls.some(c=>c.includes('archive') && c.at(-1)===revision));
});
test('CR-10: mismatching immutable inspect ID aborts before container activation', async t => {
  const {root,env,revision}=await buildFixture(t);
  const original=await readFile(join(root,'env/deployment.env'),'utf8');
  const result=spawnSync('bash',[fileURLToPath(new URL('../deploy/scripts/deploy.sh',import.meta.url)),revision],{env:{...env,BAD_IMAGE_ID:'sha256:'+'f'.repeat(64)}});
  assert.notEqual(result.status,0);
  await assert.rejects(readFile(join(root,'active-images')));
  assert.equal(await readFile(join(root,'env/deployment.env'),'utf8'),original);
});
test('CR-10: missing build IID fails closed even when build returned zero', async t => {
  const {root,env,revision}=await buildFixture(t);
  const result=spawnSync('bash',[fileURLToPath(new URL('../deploy/scripts/deploy.sh',import.meta.url)),revision],{env:{...env,MISSING_IID:'true'}});
  assert.notEqual(result.status,0); await assert.rejects(readFile(join(root,'active-images')));
});
test('CR-10: connector builds every clean archive and reports an immutable ID without activating services', async t => {
  const {root,env,revision,id}=await buildFixture(t);
  const result=spawnSync('bash',[fileURLToPath(new URL('../deploy/scripts/build-connector.sh',import.meta.url)),revision],{env});
  assert.equal(result.status,0,result.stderr.toString()); assert.match(result.stdout.toString(),new RegExp(id));
  const calls=(await readFile(join(root,'calls'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(calls.some(c=>c[0]==='build')); assert.ok(!calls.some(c=>c.includes('up')));
  assert.ok(calls.find(c=>c[0]==='run').includes(id));
});
test('CR-10: SHA-like mutable deployment pointers are rejected before Compose', async t => {
  const {root,env}=await fixture(t),settings=join(root,'env/deployment.env');
  await writeFile(settings,(await readFile(settings,'utf8')).replace(/VERIM_APP_IMAGE=.*/,'VERIM_APP_IMAGE=verimtomu:'+previous));
  const result=spawnSync('bash',[fileURLToPath(new URL('../deploy/scripts/rollback.sh',import.meta.url))],{env});
  assert.notEqual(result.status,0);
  const calls=(await readFile(join(root,'calls'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(!calls.some(c=>c[0]==='compose'));
});
