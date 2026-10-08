import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(`${dir}/${entry.name}`) : /\.(js|mjs)$/.test(entry.name) ? [`${dir}/${entry.name}`] : []); }
for (const file of ['src', 'public', 'tests', 'scripts'].flatMap(files)) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
