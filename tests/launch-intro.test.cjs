require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

// tokens.ts reads Platform for its mono face; node cannot load react-native
// itself, so this file stands in the one thing tokens.ts touches.
const rn = require.resolve('react-native');
require.cache[rn] = { id: rn, filename: rn, loaded: true, exports: { Platform: { select: (o) => o.default } } };

const intro = require('../src/ui/introScene.ts');
const { motion } = require('../src/ui/tokens.ts');
const COMPONENT = 'src/ui/LaunchIntro.tsx';

test('the intro lasts at most 1.5 s, and its beats land in order inside it', () => {
  const t = motion.intro;
  assert.ok(t.total <= 1500);
  assert.ok(t.impact < t.wordmark && t.wordmark < t.fadeOut && t.fadeOut < t.total);
  // Every letter has resolved before the fade to the app begins.
  const lastLetter = t.wordmark + (intro.WORDMARK.length - 1) * t.letterStagger + t.letter;
  assert.ok(lastLetter <= t.fadeOut, `${lastLetter} > ${t.fadeOut}`);
  assert.equal(intro.introOpacity(0), 1);
  assert.equal(intro.introOpacity(t.total), 0);
  for (let i = 0; i < intro.WORDMARK.length; i++) assert.equal(intro.letterAt(t.fadeOut, i).opacity, 1);
});

test('the ball comes in on a straight line and never passes the stumps before it hits them', () => {
  const view = intro.viewFor(400, 800);
  const start = intro.project(intro.ballAt(0).p, view);
  const end = intro.project(intro.ballAt(motion.intro.impact).p, view);
  let lastZ = Infinity;
  for (let t = 0; t <= motion.intro.impact; t += 10) {
    const b = intro.ballAt(t);
    assert.ok(b.p.z < lastZ, 'always coming closer');
    assert.ok(b.p.z > intro.STUMP_Z - 0.2, 'never through the wicket');
    lastZ = b.p.z;
    // On the screen, on the line from where it starts to where it hits.
    const s = intro.project(b.p, view);
    const cross = (end.x - start.x) * (s.y - start.y) - (end.y - start.y) * (s.x - start.x);
    assert.ok(Math.abs(cross) < 1e-6 * Math.hypot(end.x - start.x, end.y - start.y) * 1000, `off the line at ${t}`);
  }
  // Gone soon after impact.
  assert.equal(intro.ballAt(motion.intro.impact + 250).opacity, 0);
});

test('the seam draws only the half facing the camera, and the stumps lean only after impact', () => {
  const pts = intro.seamPoints(0, 0, 10, 0.3, 0, 24);
  assert.equal(pts.length, 25);
  for (const p of pts) assert.ok(Math.hypot(p.x, p.y) <= 10 + 1e-9, 'inside the ball');
  for (let i = 0; i < 3; i++) {
    assert.equal(intro.stumpLean(motion.intro.impact, i), 0);
    assert.equal(intro.bailAt(motion.intro.impact - 1, i % 2).dx, 0);
  }
  assert.ok(intro.stumpLean(motion.intro.impact + 400, 1) > 0);
  assert.equal(intro.bailAt(motion.intro.fadeOut, 0).opacity, 0);
});

test('cold start only, tap to skip, and reduced motion never plays it', () => {
  const source = read(COMPONENT);
  assert.match(source, /^let played = false;/m);
  assert.match(source, /useState\(\(\) => played \|\| reduced\)/);
  assert.match(source, /onPress=\{\(\) => setDone\(true\)\}/);
  assert.match(source, /if \(done \|\| width === 0 \|\| height === 0\) return null;/);
  assert.match(source, /withTiming\(INTRO\.total, \{ duration: INTRO\.total/);
  // Over the root stack, so the app is already there underneath.
  const layout = read('app/_layout.tsx');
  assert.ok(layout.indexOf('<LaunchIntro />') > layout.indexOf('<Stack'));
});

test('the intro is a picture, never a reading, and adds no 3D library', () => {
  const source = read(COMPONENT) + read('src/ui/introScene.ts');
  assert.doesNotMatch(source, /km\/h|mph|formatSpeed|readingView|speedKmh/);
  // The only text it draws is the wordmark.
  assert.equal(intro.WORDMARK, 'PACEBALL');
  assert.equal((read(COMPONENT).match(/<SkiaText\b/g) ?? []).length, 1);
  assert.doesNotMatch(source, /expo-gl|from 'three'|expo-three/);
  const pkg = JSON.parse(read('package.json'));
  for (const dep of ['expo-gl', 'three', 'expo-three']) assert.equal(pkg.dependencies[dep], undefined, dep);
  assert.doesNotMatch(source, /—/);
  assert.doesNotMatch(read(COMPONENT), /#[0-9a-f]{3,8}\b/i);
});
