const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = '6048ba7';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const changed = new Set([
  ...git('diff', '--name-only', base, '--').split('\n'),
  ...git('ls-files', '--others', '--exclude-standard').split('\n'),
].filter(Boolean));
const allowed = ['src/data/', 'src/export/', 'src/diagnostics/', 'tests/', 'docs/'];
const forbidden = [...changed].filter((file) =>
  file !== 'scripts/check-review-boundary.cjs' && !allowed.some((prefix) => file.startsWith(prefix)));
if (forbidden.length) {
  console.error('Review boundary FAILED. Unexpected changes:', forbidden.join(', '));
  process.exitCode = 1;
} else {
  console.log(`Review boundary PASS against ${base}: ${changed.size} changed/new files, no AB app, capture, UI, physics, types, native module or build/config changes.`);
}
