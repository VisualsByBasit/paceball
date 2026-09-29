require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  armCelebration,
  armedCelebration,
  celebrationExit,
  clearCelebration,
} = require('../src/ui/celebration.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

/** The file without its comments, for asserting what the code does not do. */
const code = (file) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('the celebration shows once, and only when a confirmed purchase armed it', () => {
  clearCelebration();
  assert.equal(armedCelebration(), null);
  armCelebration('export');
  // Read as often as mounting needs, then spent.
  assert.equal(armedCelebration(), 'export');
  assert.equal(armedCelebration(), 'export');
  clearCelebration();
  assert.equal(armedCelebration(), null);

  const route = read('app/celebration.tsx');
  assert.match(route, /const \[from\] = useState<CelebrationFrom \| null>\(armedCelebration\);/);
  assert.match(route, /useEffect\(\(\) => \{\s*clearCelebration\(\);\s*\}, \[\]\);/);
  assert.match(route, /if \(from === null\) return <Redirect href="\/" \/>;/);
});

test('only the purchased branch arms it, and a restore never does', () => {
  const paywall = read('app/paywall.tsx');
  assert.equal((code('app/paywall.tsx').match(/armCelebration\(/g) ?? []).length, 1);
  assert.match(
    paywall,
    /if \(outcome\.status === 'purchased'\) \{[\s\S]*?armCelebration\(context\);\s*router\.replace\('\/celebration'\);/,
  );
  const restore = paywall.slice(paywall.indexOf('const onRestore'), paywall.indexOf('const leave'));
  assert.doesNotMatch(restore, /celebration/i);
  // 'purchased' is the outcome the store reports only with the entitlement active.
  assert.match(read('src/purchases/entitlement.ts'), /The store took the purchase AND the entitlement it grants is active\./);
  // Nothing else in the app opens the route.
  const opened = ['app', 'src'].flatMap(function walk(dir) {
    return fs.readdirSync(path.join(__dirname, '..', dir), { withFileTypes: true }).flatMap((e) => {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) return walk(rel);
      return /\.tsx?$/.test(e.name) && /'\/celebration'/.test(read(rel)) ? [rel] : [];
    });
  });
  assert.deepEqual(opened, [path.join('app', 'paywall.tsx')]);
});

test('the button goes back to what started the purchase', () => {
  assert.deepEqual(celebrationExit('onboarding'), { label: "Let's bowl", to: 'capture' });
  assert.deepEqual(celebrationExit('limit'), { label: "Let's bowl", to: 'back' });
  assert.deepEqual(celebrationExit('export'), { label: 'Continue export', to: 'back' });
  assert.deepEqual(celebrationExit('compare'), { label: 'Compare deliveries', to: 'back' });
  assert.equal(celebrationExit('pro').to, 'back');
  const route = read('app/celebration.tsx');
  assert.match(route, /You're on Pro/);
  assert.match(route, /More deliveries\. The same honest readings\./);
  // Works from the first frame: the button is never faded or held back, and
  // leaving through it skips whatever is left of the scene.
  const button = route.indexOf('<ActionButton label={exit.label} onPress={go} />');
  assert.ok(button > 0);
  const before = route.slice(route.lastIndexOf('<View style={[styles.bottom', button), button);
  assert.equal((before.match(/<Animated\.View/g) ?? []).length, (before.match(/<\/Animated\.View>/g) ?? []).length, 'not inside an animated view');
});

// tokens.ts reads Platform for its mono face; stand in the one thing it touches.
const rn = require.resolve('react-native');
require.cache[rn] = { id: rn, filename: rn, loaded: true, exports: { Platform: { select: (o) => o.default } } };
const scene = require('../src/ui/celebrationScene.ts');

test('the scene runs about 2.5 s: hit, badge, copy, then the list, each after the last', () => {
  const c = scene.CELEBRATE;
  assert.ok(c.total >= 2300 && c.total <= 2700);
  assert.ok(c.ball < c.impact && c.impact < c.badge && c.badge < c.land && c.land <= c.copy && c.copy < c.list);
  // The last item has ticked in before the end.
  assert.ok(c.list + (scene.UNLOCKED.length - 1) * c.stagger + c.tick <= c.total);
  assert.deepEqual([...scene.UNLOCKED], [
    'Unlimited analyses', 'Watermark-free exports', 'Higher recording quality', 'Compare deliveries', 'Your stats',
  ]);
  for (let i = 0; i < scene.UNLOCKED.length; i++) {
    assert.equal(scene.itemAt(c.list + i * c.stagger - 1, i), 0);
    assert.equal(scene.itemAt(c.total, i), 1);
  }
  assert.equal(scene.copyAt(c.total), 1);
});

test('the ball meets the stumps at impact; they kick back and the bails fly, spin and land', () => {
  const c = scene.CELEBRATE;
  const hit = scene.ballAt(c.impact);
  assert.ok(Math.abs(hit.x) < 1e-9 && hit.y > 0 && hit.y < 1, 'on the middle stump');
  for (let t = c.ball; t < c.impact; t += 10) assert.ok(scene.ballAt(t).x < 0, 'comes in from one side');
  assert.equal(scene.ballAt(c.impact + 400).opacity, 0);
  for (let i = 0; i < 3; i++) {
    assert.equal(scene.stumpKick(c.impact, i), 0);
    assert.notEqual(scene.stumpKick(c.impact + 300, i), 0);
  }
  for (let i = 0; i < 2; i++) {
    assert.equal(scene.bailAt(c.impact, i).dx, 0);
    const late = scene.bailAt(c.total, i);
    assert.ok(Math.abs(late.dy - 1) < 1e-9, 'resting on the ground a stump height down');
    assert.equal(late.onGround, 1);
    assert.notEqual(late.turn, 0);
  }
  // Light off the hit, gone before the copy arrives; the badge lands and is swept once.
  assert.ok(scene.PARTICLES.some((p) => p.kind === 'spark') && scene.PARTICLES.some((p) => p.kind === 'lime'));
  for (const p of scene.PARTICLES) {
    assert.equal(scene.particleAt(p, c.impact).opacity, 0);
    assert.equal(scene.particleAt(p, c.copy).opacity, 0);
  }
  assert.equal(scene.badgeAt(c.land).rise, 1);
  assert.ok(scene.badgeAt(c.badge + 100).rise < 1);
  for (let t = c.badge; t <= c.total; t += 10) assert.ok(scene.badgeAt(t).rise <= 1, 'never past its mark');
});

test('a heavy hit and a success as the badge lands, each once, silent, never sprung', () => {
  const route = read('app/celebration.tsx');
  assert.match(route, /Haptics\.ImpactFeedbackStyle\.Heavy/);
  assert.match(route, /Haptics\.NotificationFeedbackType\.Success/);
  assert.match(route, /if \(hit\.current\) return;\s*hit\.current = true;/);
  assert.match(route, /if \(landed\.current\) return;\s*landed\.current = true;/);
  assert.match(route, /was < CELEBRATE\.impact && now >= CELEBRATE\.impact\) scheduleOnRN\(onHit\)/);
  assert.match(route, /was < CELEBRATE\.land && now >= CELEBRATE\.land\) scheduleOnRN\(onLand\)/);
  for (const file of ['app/celebration.tsx', 'src/ui/CelebrationStage.tsx', 'src/ui/celebrationScene.ts']) {
    assert.doesNotMatch(read(file), /expo-av|expo-audio|Sound|playAsync/, file);
    assert.doesNotMatch(code(file), /withSpring/, file);
  }
  const pkg = JSON.parse(read('package.json'));
  for (const dep of ['expo-av', 'expo-audio']) assert.equal(pkg.dependencies[dep], undefined, dep);
});

test('reduced motion shows the finished scene: no travel, no particles, no hit', () => {
  const route = read('app/celebration.tsx');
  assert.match(route, /const t = useSharedValue\(reduced \? CELEBRATE\.total : 0\);/);
  assert.match(route, /if \(reduced\) \{\s*t\.value = CELEBRATE\.total;\s*return;/);
  assert.match(route, /if \(!reduced && was < CELEBRATE\.impact/);
  const c = scene.CELEBRATE;
  for (const p of scene.PARTICLES) assert.equal(scene.particleAt(p, c.total).opacity, 0);
  assert.equal(scene.ballAt(c.total).opacity, 0);
});

test('the scene is the 3D kit: stadium, wicket, ball and a metal PRO badge with a sweep', () => {
  const stage = read('src/ui/CelebrationStage.tsx');
  assert.match(stage, /<Stadium3D /);
  assert.match(stage, /<Pitch3D /);
  assert.match(stage, /<Wicket3D x=\{l\.x\} y=\{l\.foot\} height=\{H\} lean=\{lean\} bails=\{bails\} \/>/);
  assert.match(stage, /<Ball3D /);
  assert.match(stage, /const plate = effect\('plate'\);/);
  assert.match(stage, /sweep: b\.value\.sweep,/);
  assert.match(stage, /\['P', 'R', 'O'\]/);
  // The static backdrop is its own canvas, drawn once.
  const backdrop = stage.slice(stage.indexOf('export function CelebrationBackdrop'), stage.indexOf('export function CelebrationScene'));
  assert.doesNotMatch(backdrop, /useDerivedValue|t\.value/);
});

test('the celebration takes every colour and size from tokens', () => {
  for (const file of ['app/celebration.tsx', 'src/ui/CelebrationStage.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, file);
    const styles = source.slice(source.indexOf('StyleSheet.create'));
    if (source.includes('StyleSheet.create')) {
      assert.doesNotMatch(styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''), /:\s*-?\d+(\.\d+)?\s*[,}\n]/, file);
    }
    assert.doesNotMatch(source, /—/, file);
  }
});
