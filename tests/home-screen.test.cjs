const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const HOME = 'app/index.tsx';

test('Home greets the active bowler and leads with recording', () => {
  const home = read(HOME);
  assert.match(home, /const player = await getActivePlayer\(\);/);
  assert.match(home, /Ready, \{loaded\.bowler\}\?/);
  assert.match(home, /label="Record a delivery"\s+onPress=\{\(\) => router\.push\('\/capture'\)\}/);
  assert.match(home, /<AllowanceLine line=\{allowanceNote\}/);
  assert.match(home, /const allowanceNote = isPro \? null : allowanceLine\(allowance, weekdayOf\);/);
  // The avatar is the first letter of the name, outlined in lime, never a photo.
  assert.match(home, /bowler\.trim\(\)\.charAt\(0\)\.toUpperCase\(\)/);
  assert.doesNotMatch(home, /<Image\b/);
});

test('the personal best is a measured reading with its range, or it says there is none', () => {
  const home = read(HOME);
  assert.match(home, /state: measurementState\(s\)/);
  assert.match(home, /const best = useMemo\(\(\) => personalBest\(listed\), \[listed\]\);/);
  assert.match(home, /<ReadingBlock reading=\{bestView\} size="reading" \/>/);
  assert.match(home, /Highest estimate/);
  assert.match(home, /Nothing measured yet\. The fastest saved delivery shows here\./);
  assert.doesNotMatch(home, /formatSpeed|errorIn\(/);
});

test('the latest three deliveries, with See all, and an empty state that invents nothing', () => {
  const home = read(HOME);
  assert.match(home, /const RECENT = 3;/);
  assert.match(home, /listed\.slice\(0, RECENT\)/);
  assert.match(home, /See all/);
  assert.match(home, /title="Your first reading starts here\."\s+body="Film a delivery and mark what you can see\."/);
  assert.match(home, /Loading deliveries…/);
  assert.doesNotMatch(home, /ActivityIndicator/);
});

test('the tab bar is on Home, History and Settings, and nowhere else', () => {
  const on = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(__dirname, '..', dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx$/.test(e.name) && /<TabBar\b/.test(read(rel))) on.push(rel.replace(/\\/g, '/'));
    }
  };
  walk('app');
  assert.deepEqual(on.sort(), ['app/index.tsx', 'app/settings.tsx']);
  assert.match(read(HOME), /<TabBar current="home" \/>/);
  assert.match(read('app/settings.tsx'), /<TabBar current="settings" \/>/);
});

test('Home takes every colour and size from tokens', () => {
  const source = read(HOME);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i);
  const styles = source.slice(source.indexOf('StyleSheet.create'));
  assert.doesNotMatch(styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''), /:\s*-?\d+(\.\d+)?\s*[,}\n]/);
});
