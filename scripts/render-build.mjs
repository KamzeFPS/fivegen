import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const build = spawnSync(process.execPath, ['node_modules/vinext/dist/cli.js', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, FIVEGEN_RUNTIME: 'render', NODE_ENV: 'production' },
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
writeFileSync('dist/fivegen-runtime.json', JSON.stringify({ runtime: 'render', version: 1 }) + '\n');
