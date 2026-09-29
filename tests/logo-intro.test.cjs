require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  INTRO_VIDEO,
  badgeTop,
  containedVideo,
  introStart,
  nextIntroPhase,
} = require('../src/ui/logoIntroPlan.ts');
const { DEFAULT_SETTINGS, parseSettings } = require('../src/settings/settings.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const VIDEO = path.join(__dirname, '..', 'assets', 'intro', 'logo-reveal.mp4');

test('the intro video: 1080 x 1920, H.264 and AAC, faststart, under 3 MB', () => {
  const bytes = fs.readFileSync(VIDEO);
  assert.ok(bytes.length < 3 * 1024 * 1024, `${bytes.length} bytes`);
  const at = (box) => bytes.indexOf(Buffer.from(box, 'latin1'));
  // Faststart: the index comes before the media, so playback starts at once.
  assert.ok(at('moov') > 0 && at('moov') < at('mdat'), 'moov before mdat');
  assert.ok(at('avc1') > 0, 'H.264');
  assert.ok(at('mp4a') > 0, 'AAC');
  // The video track's size, as 16.16 fixed point at the end of its tkhd.
  let found = false;
  for (let i = bytes.indexOf('tkhd'); i > 0; i = bytes.indexOf('tkhd', i + 4)) {
    const w = bytes.readUInt32BE(i + 4 + 76) / 65536;
    const h = bytes.readUInt32BE(i + 4 + 80) / 65536;
    if (w > 0) {
      assert.deepEqual([w, h], [INTRO_VIDEO.width, INTRO_VIDEO.height]);
      found = true;
    }
  }
  assert.ok(found, 'a video track');
  // Its length: the whole reveal, shorter than the cap.
  const mvhd = at('mvhd');
  const seconds = bytes.readUInt32BE(mvhd + 4 + 16) / bytes.readUInt32BE(mvhd + 4 + 12);
  assert.ok(seconds > 6 && seconds < 8, `${seconds} s`);
  // Only the converted file ships; the source and ffmpeg stay out.
  for (const file of ['.gitignore', '.easignore']) assert.match(read(file), /^assets\/intro\/logo-reveal-source\.mp4$/m, file);
  const pkg = JSON.parse(read('package.json'));
  for (const dep of ['ffmpeg-static', 'ffmpeg', 'fluent-ffmpeg']) {
    assert.equal(pkg.dependencies[dep], undefined, dep);
    assert.equal(pkg.devDependencies?.[dep], undefined, dep);
  }
  assert.ok(pkg.dependencies['expo-video'], 'expo-video was already installed');
});

test('once per cold start, never with reduced motion', () => {
  assert.equal(introStart({ played: false, reduced: false }), 'playing');
  assert.equal(introStart({ played: true, reduced: false }), 'done');
  assert.equal(introStart({ played: false, reduced: true }), 'done');
  const source = read('src/ui/LogoIntro.tsx');
  assert.match(source, /^let played = false;/m);
  assert.match(source, /useState<IntroPhase>\(\(\) => introStart\(\{ played, reduced \}\)\)/);
  assert.match(read('app/_layout.tsx'), /<LogoIntro \/>/);
});

test('full length, then Pro sees the badge, then Home; a tap, an error or the cap end it', () => {
  // Free: the video ends, the intro fades, it is gone.
  assert.equal(nextIntroPhase('playing', 'ended', false), 'leaving');
  assert.equal(nextIntroPhase('leaving', 'left', false), 'done');
  // Pro: the badge first.
  assert.equal(nextIntroPhase('playing', 'ended', true), 'badge');
  assert.equal(nextIntroPhase('badge', 'badgeShown', true), 'leaving');
  // Nothing else moves the video on early: it plays full length.
  for (const event of ['badgeShown', 'left']) assert.equal(nextIntroPhase('playing', event, true), 'playing');
  // A tap skips it, and the cap stops it, from anywhere.
  for (const phase of ['playing', 'badge', 'leaving', 'fallback']) {
    assert.equal(nextIntroPhase(phase, 'tap', true), 'done', phase);
    assert.equal(nextIntroPhase(phase, 'cap', false), 'done', phase);
  }
  // A video that cannot play hands over to the drawn intro.
  assert.equal(nextIntroPhase('playing', 'error', false), 'fallback');
  assert.equal(nextIntroPhase('done', 'ended', true), 'done');

  const source = read('src/ui/LogoIntro.tsx');
  assert.match(source, /onPress=\{\(\) => send\('tap'\)\}/);
  assert.match(source, /player\.addListener\('playToEnd', \(\) => send\('ended'\)\)/);
  assert.match(source, /if \(now === 'error'\) send\('error'\);/);
  assert.match(source, /if \(phase === 'fallback'\) return <LaunchIntro \/>;/);
  // Never longer than 8 s, and Pro's badge only ever takes what is left of it.
  assert.match(read('src/ui/tokens.ts'), /logoIntro: \{ badge: 600, fade: 300, cap: 8000 \}/);
  assert.match(source, /setTimeout\(\(\) => send\('cap'\), motion\.logoIntro\.cap\)/);
  assert.match(source, /Math\.max\(0, Math\.min\(motion\.logoIntro\.badge, left\)\)/);
  // The badge is Pro's alone: read from the entitlement, kept only on a run that reached it.
  assert.match(source, /const \{ isPro \} = usePurchases\(\);/);
  assert.match(source, /if \(phase === 'badge'\) badged\.current = true;/);
});

test('the video is contained, and the PRO badge sits under the logo on any screen', () => {
  for (const [w, h] of [[360, 640], [412, 915], [360, 800], [800, 1280]]) {
    const v = containedVideo(w, h);
    assert.ok(v.x >= 0 && v.y >= 0 && v.w <= w + 1e-9 && v.h <= h + 1e-9, `${w}x${h} fits`);
    const top = badgeTop(w, h, 16);
    assert.ok(top > v.y + INTRO_VIDEO.logoFoot * v.scale, 'below the wordmark');
    assert.ok(top < v.y + v.h - 48, 'on screen, inside the video');
  }
  const source = read('src/ui/LogoIntro.tsx');
  assert.match(source, /contentFit="contain"/);
  assert.match(source, /<Text style=\{styles\.badgeText\}>PRO<\/Text>/);
  assert.match(source, /badgeText: \{ \.\.\.type\.label, color: colors\.accent \}/);
});

test('Intro sound: on by default, a Settings switch, and muted when off', () => {
  assert.equal(DEFAULT_SETTINGS.introSound, true);
  assert.equal(parseSettings({}).introSound, true);
  assert.equal(parseSettings({ introSound: false }).introSound, false);
  const source = read('src/ui/LogoIntro.tsx');
  assert.match(source, /p\.muted = !getSettings\(\)\.introSound;/);
  assert.match(source, /p\.audioMixingMode = 'mixWithOthers';/);
  const settings = read('app/settings.tsx');
  assert.match(settings, /<Text style=\{styles\.rowTitle\}>Intro sound<\/Text>/);
  assert.match(settings, /value=\{settings\.introSound\}/);
  assert.match(settings, /updateSettings\(\{ introSound: on \}\);/);
  assert.doesNotMatch(source + settings, /—/);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i);
});
