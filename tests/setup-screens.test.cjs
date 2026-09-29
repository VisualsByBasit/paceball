const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

/** The file without its comments, for asserting what the screen does not say. */
const code = (file) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test('setup keeps its order: player, how it works, then where to stand', () => {
  assert.match(read('app/setup/player.tsx'), /router\.push\(\{ pathname: '\/setup\/how-it-works', params: \{ name: trimmed \} \}\)/);
  assert.match(read('app/setup/how-it-works.tsx'), /router\.push\(\{ pathname: '\/setup\/camera', params: \{ name \} \}\)/);
  // The profile is still created, and the onboarding offer still weighed, on the last step.
  const camera = read('app/setup/camera.tsx');
  assert.match(camera, /await createPlayer\(name\);/);
  assert.match(camera, /const offerPro = shouldShowOnboardingPaywall\(\{/);
  for (const [file, step] of [['player', 1], ['how-it-works', 2], ['camera', 3]]) {
    assert.match(read(`app/setup/${file}.tsx`), new RegExp(`Step ${step} of 3`), file);
  }
});

test('the player step asks only what it can use', () => {
  const player = read('app/setup/player.tsx');
  assert.match(player, /Who's bowling\?/);
  // No height or shoe field here, so no line about measuring either.
  assert.doesNotMatch(code('app/setup/player.tsx'), /heel to toe|reference lengths later/i);
  assert.equal((player.match(/<TextInput\b/g) ?? []).length, 1);
  assert.match(player, /disabledReason=\{canContinue \? null : 'Enter a name to continue\.'\}/);
});

test('how it works names the four marks and says plainly what a reading is', () => {
  const how = read('app/setup/how-it-works.tsx');
  assert.match(how, /Four marks\. An honest estimate\./);
  for (const title of ['One end of a known distance', 'The other end', 'The ball at release', 'The ball at bounce']) {
    assert.ok(how.includes(`title: '${title}'`), title);
  }
  assert.match(how, /'Average speed from release to bounce, not release speed\.'/);
  assert.match(how, /'No visible bounce means no speed\.'/);
});

test('where to stand draws no ball path, and the last step says "Let\'s bowl"', () => {
  const camera = read('app/setup/camera.tsx');
  assert.match(camera, /Film side-on\. Keep it steady\./);
  assert.doesNotMatch(camera, /ballPath|ballDot|BALL_DOTS/);
  assert.match(camera, /label=\{isOnboarding \? "Let's bowl" : 'Got it'\}/);
  // Its three tips are the existing ones, now in the shared guide.
  const guide = read('src/ui/WhereToStand.tsx');
  assert.doesNotMatch(guide, /ballPath|ballDot|BALL_DOTS|Ball3D|pointsAlong/);
  const tips = guide.slice(guide.indexOf('export const PLACEMENT_REQUIREMENTS'), guide.indexOf('];', guide.indexOf('export const PLACEMENT_REQUIREMENTS')));
  assert.equal(tips.split("',").length - 1, 3);
});

test('the placement guide is one component, in setup and in How it works', () => {
  assert.match(read('app/setup/camera.tsx'), /<WhereToStand \/>/);
  const how = read('app/setup/how-it-works.tsx');
  assert.match(how, /\{isOnboarding \? null : \(\s*<View style=\{styles\.where\}>[\s\S]*?<WhereToStand \/>/);
  // Drawn once, in one place, with the 3D kit: the pitch side-on, both wickets, the phone.
  for (const file of ['app/setup/camera.tsx', 'app/setup/how-it-works.tsx']) {
    assert.doesNotMatch(read(file), /function Diagram|PLACEMENT_REQUIREMENTS = /, file);
  }
  const guide = read('src/ui/WhereToStand.tsx');
  assert.match(guide, /<Pitch3D [^>]*across \/>/);
  assert.match(guide, /l\.wickets\.map\(\(w, i\) => \(\s*<Wicket3D /);
  assert.match(guide, />Stand here</);
  assert.match(guide, /5–8 m back/);
  require('./register.cjs');
  const { placementLayout } = require('../src/ui/placement.ts');
  const l = placementLayout(340);
  assert.equal(l.standOff, 6.5, 'inside the 5 to 8 m the guide asks for');
  assert.ok(l.wickets[0].x > 0 && l.wickets[1].x < 340, 'both wickets in the picture');
  assert.ok(l.phone.y > l.pitchY && l.phone.y < l.height, 'the phone in front of the pitch');
});

test('the setup screens take every colour and size from tokens', () => {
  // The placement diagram's zero offsets predate this stage and are geometry,
  // so that file is held to tokens for colour only.
  assert.doesNotMatch(read('app/setup/camera.tsx'), /#[0-9a-f]{3,8}\b/i);
  for (const file of ['app/setup/player.tsx', 'app/setup/how-it-works.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, file);
    const styles = source.slice(source.indexOf('StyleSheet.create'));
    assert.doesNotMatch(styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''), /:\s*-?\d+(\.\d+)?\s*[,}\n]/, file);
  }
});
