// Local configuration regression check; never starts services or reads secrets.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertRulesProduction } from '../src/production-config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = await mkdtemp(join(tmpdir(), 'verim-config-check-'));
try {
  await mkdir(join(dir, 'env'));
  const app = await readFile(join(root, 'deploy/env/app.env.example'), 'utf8');
  await writeFile(join(dir, 'env/app.env'), app);
  const environment = Object.fromEntries(app.split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split('=')));
  assertRulesProduction({ ...environment, GUARD_TRUSTED_PROXY_IP: '10.123.45.3' });
  const env = { ...process.env, VERIM_APP_IMAGE: `sha256:${'a'.repeat(64)}`,
    VERIM_NODE_IMAGE: 'node:24-bookworm-slim@sha256:' + 'a'.repeat(64),
    VERIM_CLOUDFLARED_IMAGE: 'sha256:' + 'a'.repeat(64),
    VERIM_NETWORK_SUBNET: '10.123.45.0/29', VERIM_APP_IP: '10.123.45.2', VERIM_INGRESS_IP: '10.123.45.3' };
  const output = spawnSync('docker', ['compose', '--project-directory', dir, '-f', join(root, 'deploy/compose.yaml'), '--profile', 'cloudflare', 'config', '--format', 'json'], { env, encoding: 'utf8' });
  assert.equal(output.status, 0, 'Compose configuration failed');
  const config = JSON.parse(output.stdout);
  assert.deepEqual(Object.keys(config.services).sort(), ['app', 'cloudflared']);
  for (const service of Object.values(config.services)) {
    assert.equal(service.read_only, true); assert.equal(service.init, true);
    assert.notEqual(service.user.split(':')[0], '0');
    assert.ok(service.cap_drop.includes('ALL')); assert.ok(service.security_opt.includes('no-new-privileges:true'));
    assert.equal(service.restart, 'unless-stopped');
    assert.ok(service.mem_limit > 0 && Number(service.cpus) > 0 && service.pids_limit > 0);
    assert.equal(service.privileged, undefined); assert.notEqual(service.network_mode, 'host');
    assert.equal(service.volumes, undefined); assert.ok(service.logging.options['max-size']);
    assert.ok(service.tmpfs.every(path => path.includes('noexec') && path.includes('size=')));
  }
  assert.equal(config.services.app.ports, undefined);
  assert.equal(config.networks.ingress.internal, true);
  assert.deepEqual(Object.keys(config.services.app.networks), ['ingress']);
  assert.equal(config.services.app.platform, 'linux/amd64');
  assert.equal(config.services.cloudflared.platform, 'linux/amd64');
  assert.equal(config.services.cloudflared.ports, undefined);
  assert.equal(config.services.app.secrets, undefined);
  assert.equal(config.services.cloudflared.secrets[0].source, 'cloudflared_token');
  assert.ok(config.services.app.healthcheck.test.includes('scripts/healthcheck.js'));
  assert.ok(config.services.cloudflared.healthcheck.test.includes('ready'));
  assert.equal(Object.keys(config.networks).length, 2);
  assert.ok(Object.values(config.networks).every(network => !network.external));
  assert.ok(!JSON.stringify(config).includes('docker.sock'));
  console.log('Security config: PASS (rules guard, internal app network, no published ports, resource limits, isolation, no socket/host mounts)');
} finally { await rm(dir, { recursive: true, force: true }); }
