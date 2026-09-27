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
  // Works from the first frame: the button is never faded or held back.
  assert.match(route, /<\/Animated\.View>\s*<\/View>\s*<ActionButton label=\{exit\.label\} onPress=\{go\} \/>/);
});

test('the emblem is timed to 1100 ms, never sprung, silent, with one success haptic as the bail settles', () => {
  const emblem = read('src/ui/PurchaseEmblem.tsx');
  const tokens = read('src/ui/tokens.ts');
  assert.match(tokens, /celebrate: \{ stumps: 180, ball: 650, bail: 850, copy: 1100 \}/);
  assert.match(tokens, /emblem: 96,/);
  assert.doesNotMatch(code('src/ui/PurchaseEmblem.tsx'), /withSpring/);
  assert.doesNotMatch(code('app/celebration.tsx'), /withSpring/);
  // The bail's own timing callback is where the haptic fires.
  assert.match(emblem, /withTiming\(1, \{ duration: BAIL_END - BALL_END, easing: SETTLE \}, \(finished\) => \{\s*if \(finished\) scheduleOnRN\(tap\);/);
  assert.match(emblem, /Haptics\.NotificationFeedbackType\.Success/);
  assert.match(emblem, /if \(tapped\.current\) return;\s*tapped\.current = true;/);
  // Straight along one baseline, and silent.
  assert.match(emblem, /transform: \[\{ translateX: ball\.value \* BALL_TRAVEL \}\]/);
  for (const file of ['src/ui/PurchaseEmblem.tsx', 'app/celebration.tsx']) {
    assert.doesNotMatch(read(file), /expo-av|expo-audio|Sound|playAsync/, file);
  }
  // Reduced motion shows it finished.
  assert.match(emblem, /if \(reduced\) \{\s*stumps\.value = 1;\s*ball\.value = 1;\s*bail\.value = 1;\s*tap\(\);/);
});

test('the celebration takes every colour and size from tokens', () => {
  for (const file of ['app/celebration.tsx', 'src/ui/PurchaseEmblem.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, file);
    const styles = source.slice(source.indexOf('StyleSheet.create'));
    assert.doesNotMatch(styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''), /:\s*-?\d+(\.\d+)?\s*[,}\n]/, file);
  }
});
