const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const sourceScript = path.join(__dirname, '..', 'scripts', 'check-review-boundary.cjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
const check = (cwd) => spawnSync(process.execPath, [path.join(cwd, 'scripts', 'check-review-boundary.cjs')], {
  cwd, encoding: 'utf8',
});

test('review boundary fetches main, refuses a stale branch, and fails closed without a remote', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paceball-review-boundary-'));
  t.after(() => {
    // Only remove the test directory we created directly under the OS temp dir.
    if (path.dirname(fs.realpathSync(root)) === fs.realpathSync(os.tmpdir())) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  const remote = path.join(root, 'remote.git');
  const local = path.join(root, 'local');
  const other = path.join(root, 'other');
  fs.mkdirSync(local);
  git(root, 'init', '--bare', '--initial-branch=main', remote);
  git(local, 'init', '--initial-branch=main');
  git(local, 'config', 'user.name', 'Paceball Test');
  git(local, 'config', 'user.email', 'test@example.invalid');
  fs.mkdirSync(path.join(local, 'scripts'));
  fs.copyFileSync(sourceScript, path.join(local, 'scripts', 'check-review-boundary.cjs'));
  git(local, 'add', '.');
  git(local, 'commit', '-m', 'chore: add boundary check');
  git(local, 'remote', 'add', 'origin', remote);
  git(local, 'push', '-u', 'origin', 'main');
  git(local, 'switch', '-c', 'codex/review');
  assert.equal(check(local).status, 0, 'an up-to-date branch passes');

  git(root, 'clone', remote, other);
  git(other, 'config', 'user.name', 'Paceball Test');
  git(other, 'config', 'user.email', 'test@example.invalid');
  fs.mkdirSync(path.join(other, 'docs'));
  fs.writeFileSync(path.join(other, 'docs', 'new.md'), 'New work on main.\n');
  git(other, 'add', '.');
  git(other, 'commit', '-m', 'docs: advance main');
  git(other, 'push', 'origin', 'main');

  const behind = check(local);
  assert.equal(behind.status, 1, 'a stale branch cannot pass even with no changed files');
  assert.match(behind.stderr, /1 commit\(s\) behind origin\/main/);
  assert.equal(git(local, 'rev-list', '--count', 'HEAD..origin/main'), '1', 'the check fetched the new commit');

  git(local, 'merge', '--ff-only', 'origin/main');
  assert.equal(check(local).status, 0, 'a rebased or fast-forwarded branch passes again');

  git(local, 'remote', 'set-url', 'origin', path.join(root, 'missing.git'));
  const noRemote = check(local);
  assert.equal(noRemote.status, 1, 'a failed fetch cannot pass using stale tracking data');
  assert.match(noRemote.stderr, /Could not fetch or check origin\/main/);
});
