require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { PRIVACY_URL, TERMS_URL } = require('../src/purchases/links.ts');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function sources(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });
}

test('the terms and privacy links point at the live site, not the old portfolio', () => {
  assert.equal(TERMS_URL, 'https://paceballpro.vercel.app/terms');
  assert.equal(PRIVACY_URL, 'https://paceballpro.vercel.app/privacy');
  for (const url of [TERMS_URL, PRIVACY_URL]) {
    assert.doesNotMatch(url, /visualsbybasit/i, url);
    assert.match(url, /^https:\/\//, url);
  }
  // Each resolves to a page the website actually has.
  assert.ok(fs.existsSync(path.join(ROOT, 'website', 'app', 'terms', 'page.tsx')));
  assert.ok(fs.existsSync(path.join(ROOT, 'website', 'app', 'privacy', 'page.tsx')));
});

test('the app writes the site address in one place and links both pages from it', () => {
  const files = [...sources('app'), ...sources('src')];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /visualsbybasit\.vercel\.app/i, `${file} links the old portfolio`);
    if (file !== path.join('src', 'purchases', 'links.ts')) {
      assert.doesNotMatch(source, /paceballpro\.vercel\.app/, `${file} writes the site address itself`);
    }
  }

  // The paywall sells a subscription, so it carries both.
  const paywall = read('app/paywall.tsx');
  assert.match(paywall, /Linking\.openURL\(TERMS_URL\)/);
  assert.match(paywall, /Linking\.openURL\(PRIVACY_URL\)/);
  // Google Play wants the policy inside the app: the privacy screen links it.
  assert.match(read('app/diagnostics.tsx'), /Linking\.openURL\(PRIVACY_URL\)/);
});
