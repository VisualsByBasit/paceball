const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
// A merge-base diff cannot show that this branch would revert newer main work.
// Refresh the remote tracking branch first, and fail closed if it cannot be read.
try {
  git('fetch', '--quiet', 'origin');
  const behind = Number(git('rev-list', '--count', 'HEAD..origin/main'));
  if (!Number.isSafeInteger(behind) || behind < 0) {
    throw new Error('Could not determine how far this branch is behind main.');
  }
  if (behind > 0) {
    console.error(`Review boundary FAILED. Branch is ${behind} commit(s) behind origin/main. Rebase before review.`);
    process.exit(1);
  }
} catch (error) {
  console.error('Review boundary FAILED. Could not fetch or check origin/main.', error);
  process.exit(1);
}
// Compare only this branch's work with current main. A fixed historical commit
// eventually treats Basit's already-merged changes as Mustafa's changes.
const base = git('merge-base', 'HEAD', 'origin/main');
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
