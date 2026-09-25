const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

test('README describes the crash reporting the app actually ships', () => {
  const readme = read('README.md');
  assert.match(readme, /JavaScript and native crash reports are supported/);
  assert.match(readme, /off by default, and nothing is sent unless/);
  assert.match(readme, /Native reports .* may contain limited technical device and crash state that the app cannot filter/);
  assert.match(readme, /Development builds do not upload source maps/);
  assert.doesNotMatch(readme, /Native crash handling[^.]*disabled|sends scrubbed JavaScript errors only/);
  // The code it describes: native handling on, source maps off in development.
  assert.match(read('src/diagnostics/index.ts'), /enableNativeCrashHandling: true/);
  assert.equal(JSON.parse(read('eas.json')).build.development.env.SENTRY_DISABLE_AUTO_UPLOAD, 'true');
});

test('README names everything that can leave the phone, and the website', () => {
  const readme = read('README.md');
  for (const claim of [/RevenueCat and Google Play, on every launch/, /Sentry, only after opting in/, /microphone, optional/, /https:\/\/paceballpro\.vercel\.app/]) {
    assert.match(readme, claim);
  }
  assert.match(readme, /muted by default on every clip/);
  assert.match(readme, /silent by default/);
  // The suite grows, so no count is pinned.
  assert.doesNotMatch(readme, /\b\d+ (passing )?tests\b/);
});

test('CLAUDE.md matches the app, and AGENTS.md points at it', () => {
  const claude = read('CLAUDE.md');
  assert.doesNotMatch(claude, /Nothing routes to it yet|practice \(throwaway\)|compare \(droppable\)/);
  assert.match(claude, /on every launch of a build with a RevenueCat key/);
  assert.match(claude, /## Sound/);
  assert.match(claude, /website\/ is the public site/);
  assert.match(claude, /MU owns: src\/data\/, src\/export\/, src\/diagnostics\//);
  assert.doesNotMatch(claude, /—/);
  assert.match(read('AGENTS.md'), /See CLAUDE\.md\./);
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'app', 'practice.tsx')), 'the practice screen is gone');
});
