import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const dir of ['server', 'public', 'scripts', 'companion']) for (const file of readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('JavaScript syntax checks passed.');
