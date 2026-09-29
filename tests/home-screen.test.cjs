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
  // The hero: the Result speedometer, small, and the reading with its range.
  assert.match(home, /<ReadingBlock reading=\{bestView\} size="heroCompact" \/>/);
  assert.match(home, /<SpeedGauge reading=\{bestView\} unit=\{unit\} width=\{size\.gaugeSmall\} \/>/);
  // Only inside the measured branch: no gauge without a measured best.
  const measured = home.slice(home.indexOf("best && bestView?.kind === 'measured' ? ("), home.indexOf('Nothing measured yet'));
  assert.match(measured, /<SpeedGauge/);
  assert.equal((home.match(/<SpeedGauge /g) ?? []).length, 1);
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
  assert.deepEqual(on.sort(), ['app/history.tsx', 'app/index.tsx', 'app/settings.tsx']);
  assert.match(read(HOME), /<TabBar current="home" \/>/);
  assert.match(read('app/settings.tsx'), /<TabBar current="settings" \/>/);
});

test('Home takes every colour and size from tokens', () => {
  const source = read(HOME);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i);
  const styles = source.slice(source.indexOf('StyleSheet.create'));
  assert.doesNotMatch(styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''), /:\s*-?\d+(\.\d+)?\s*[,}\n]/);
});

test('Home leads with the hero, then a large record button, then recent cards', () => {
  const home = read(HOME);
  const hero = home.indexOf('PERSONAL BEST');
  const record = home.indexOf('label="Record a delivery"');
  const allowance = home.indexOf('<AllowanceLine');
  const recent = home.indexOf('Recent deliveries');
  assert.ok(hero > 0 && hero < record && record < allowance && allowance < recent);
  assert.match(home, /label="Record a delivery"\s+onPress=\{\(\) => router\.push\('\/capture'\)\}\s+large/);
  // Recent deliveries are cards with their release frame.
  assert.match(home, /<DeliveryCard\s+thumb=\{releaseFrameUri\(d\.session\)\}\s+reading=\{view\}/);
  // The empty state takes the hero's place; no sample data anywhere.
  assert.match(home, /sessions\.length === 0 \? \(\s*<View style=\{styles\.hero\}>\s*<EmptyState/);
  assert.doesNotMatch(home, /MOCK_|SAMPLE_|mockOffering/);
  // The avatar still opens Stats.
  assert.match(home, /onPress=\{\(\) => router\.push\('\/stats'\)\}/);
});

test('a delivery card shows a speed only with its range, and no speed as words', () => {
  const card = read('src/ui/DeliveryCard.tsx');
  const measured = card.slice(card.indexOf("reading.kind === 'measured' ? ("), card.indexOf(') : ('));
  assert.match(measured, /\{reading\.speed\}/);
  assert.match(measured, /\{reading\.range\}/);
  assert.match(card, /No speed · bounce not seen/);
  assert.equal((card.match(/reading\.speed/g) ?? []).length, 1);
});
