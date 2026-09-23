require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const WEBSITE = path.join(__dirname, '..', 'website');
const read = (...parts) => fs.readFileSync(path.join(WEBSITE, ...parts), 'utf8');
const { betaFlow, BETA_NOTES, BETA_REQUEST_NOTES } = require('../website/lib/beta.ts');
const { BETA_URL, CONTACT_EMAIL } = require('../website/lib/site.ts');

const GROUP = 'https://groups.google.com/g/paceball-testers';
const PLAY = 'https://play.google.com/apps/testing/com.paceball.app';

/** Every source file of the site that renders something. */
function sources(dir = WEBSITE) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.next', 'out'].includes(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}
const rel = (file) => path.relative(WEBSITE, file).split(path.sep).join('/');

/**
 * Google Play refuses anyone who is not in the tester group, so the opt-in
 * link on its own is broken for every visitor. It may only appear as step 2.
 */
test('with a group link, the group is step 1 and Google Play is step 2', () => {
  const flow = betaFlow(GROUP, PLAY, CONTACT_EMAIL);
  assert.equal(flow.kind, 'steps');
  assert.deepEqual(flow.steps.map((step) => step.href), [GROUP, PLAY]);
  assert.equal(flow.steps[0].label, 'Join the tester group');
  assert.equal(flow.steps[1].label, 'Become a tester and install from Google Play');
});

test('an empty group link falls back to an email request, with no Play link at all', () => {
  for (const empty of ['', '   ']) {
    const flow = betaFlow(empty, PLAY, 'paceballpro@gmail.com');
    assert.equal(flow.kind, 'request');
    assert.equal(flow.request.label, 'Request access');
    assert.equal(flow.request.href, 'mailto:paceballpro@gmail.com?subject=Paceball%20beta');
    assert.doesNotMatch(JSON.stringify(flow), /play\.google\.com/);
  }
});

test('the site never links to the Play opt-in except through the beta flow', () => {
  for (const file of sources()) {
    const name = rel(file);
    if (name === 'lib/site.ts' || name === 'lib/beta.ts') continue;
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\bBETA_URL\b/, `${name} uses BETA_URL directly`);
    assert.doesNotMatch(source, /play\.google\.com\/apps\/testing/, `${name} links the opt-in page directly`);
  }
  // The opt-in URL itself is defined once.
  assert.match(BETA_URL, /^https:\/\/play\.google\.com\/apps\/testing\//);

  // The block renders from betaFlow, and the hero button scrolls to it.
  const steps = read('components', 'BetaSteps.tsx');
  assert.match(steps, /betaFlow\(\)/);
  const page = read('app', 'page.tsx');
  assert.match(page, /<Section id="beta"[\s\S]*?<BetaSteps \/>/);
  assert.match(page, /href="#beta"[\s\S]{0,200}Join the beta/);
});

test('the same-account note is said in both forms of the block', () => {
  const sameAccount = /same Google account you use for Google Play on your phone/;
  assert.ok(BETA_NOTES.some((note) => sameAccount.test(note)), 'steps carry the same-account note');
  assert.ok(BETA_NOTES.some((note) => /Android only/.test(note)));
  assert.ok(BETA_NOTES.some((note) => /few minutes before step 2 works/.test(note)));
  assert.ok(
    BETA_REQUEST_NOTES.some((note) => /Google account you use for Google Play on your phone/.test(note)),
    'the email request carries it too',
  );
  const block = read('components', 'BetaSteps.tsx');
  assert.match(block, /<Notes notes=\{BETA_NOTES\} \/>/);
  assert.match(block, /<Notes notes=\{BETA_REQUEST_NOTES\} \/>/);
});

test('the logo is a square PNG, used for the header, the icons and the share images', () => {
  const png = fs.readFileSync(path.join(WEBSITE, 'public', 'logo.png'));
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(png.readUInt32BE(16), png.readUInt32BE(20), 'logo is square, so equal width and height keep its shape');

  // Header: decorative beside the written name, never stretched.
  const wordmark = read('components', 'Wordmark.tsx');
  assert.match(wordmark, /src=\{LOGO_SRC\}\s+alt=""\s+width=\{px\}\s+height=\{px\}/);

  // Favicon and apple touch icon, with the SVG only when the PNG is missing.
  const layout = read('app', 'layout.tsx');
  assert.match(layout, /icons: HAS_LOGO\s*\?[\s\S]*icon: \[\{ url: LOGO_SRC[\s\S]*apple: \[\{ url: LOGO_SRC[\s\S]*: \{ icon: \[\{ url: FALLBACK_ICON_SRC/);
  assert.ok(!fs.existsSync(path.join(WEBSITE, 'app', 'icon.svg')), 'no file-convention icon overriding the logo');
  assert.ok(fs.existsSync(path.join(WEBSITE, 'public', 'icon-fallback.svg')));

  // Open Graph and Twitter both render the shared card, which draws the logo.
  for (const file of ['opengraph-image.tsx', 'twitter-image.tsx']) {
    assert.match(read('app', file), /renderShareImage\(\)/, file);
  }
  assert.match(read('lib', 'share-image.tsx'), /logoDataUrl\(\)/);
});
