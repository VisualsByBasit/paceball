require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { ctaFor, planTerms, renewalLine } = require('../src/ui/paywallCopy.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const PAYWALL = 'app/paywall.tsx';

test('monthly never shows a trial, and annual shows one only when the store reports it', () => {
  // The price is whatever string the store sent: here, deliberately not money.
  assert.equal(planTerms('monthly', 'STORE-M', null), 'STORE-M/month');
  assert.equal(planTerms('monthly', 'STORE-M', 7), 'STORE-M/month', 'a trial handed to monthly is ignored');
  assert.equal(planTerms('annual', 'STORE-Y', null), 'STORE-Y/year');
  assert.equal(planTerms('annual', 'STORE-Y', 7), '7 days free, then STORE-Y/year');
  // The length is the store's, never a fixed seven.
  assert.equal(planTerms('annual', 'STORE-Y', 3), '3 days free, then STORE-Y/year');
  // And the screen hands monthly no trial to begin with.
  assert.match(read(PAYWALL), /trial=\{period === 'annual' \? annualTrial : null\}/);
  assert.match(read(PAYWALL), /const annualTrial = plans\.annual \? trialDays\(plans\.annual\) : null;/);
});

test('the button follows the selected plan', () => {
  assert.equal(ctaFor('annual', 7), 'Start my 7 days free');
  assert.equal(ctaFor('annual', null), 'Start Pro yearly');
  assert.equal(ctaFor('monthly', 7), 'Start Pro monthly');
  assert.equal(ctaFor('monthly', null), 'Start Pro monthly');
  assert.equal(ctaFor(null, 7), null);
  assert.match(read(PAYWALL), /const chosenTrial = selected === 'annual' \? annualTrial : null;/);
});

test('the renewal line says when the first charge comes', () => {
  assert.equal(
    renewalLine(7),
    'No charge today. Renews automatically after the trial unless you cancel in Google Play.',
  );
  assert.equal(renewalLine(null), 'Renews automatically. Cancel anytime in Google Play.');
  assert.match(read(PAYWALL), /\{renewalLine\(chosenTrial\)\}/);
});

test('every context has a headline with and without a trial, and a dismiss that names what is given up', () => {
  const paywall = read(PAYWALL);
  const cases = [
    ['export', 'Share without the watermark.', 'Continue with the watermark'],
    ['limit', 'Keep bowling with Pro', 'Wait for my next \\$\\{FREE_ANALYSES_PER_PERIOD\\} analyses'],
    ['compare', 'Compare your deliveries.', 'Continue without comparison'],
    ['pro', 'Measure as much as you like.', 'Stay on the free plan'],
    ['onboarding', 'Every delivery, without limits.', 'Continue with \\$\\{FREE_ANALYSES_PER_PERIOD\\} analyses a week'],
  ];
  for (const [context, headline, dismiss] of cases) {
    const start = paywall.indexOf(`  ${context}: {`);
    const block = paywall.slice(start, paywall.indexOf('\n  },', start));
    assert.ok(block.includes(`'${headline}'`), `${context} headline`);
    assert.match(block, /\$\{trial\} days free/, `${context} names the store's trial`);
    assert.match(block, new RegExp(`dismiss: [\`']${dismiss}[\`']`), `${context} dismiss`);
  }
  // The weekly limit adds when the analyses come back.
  assert.match(paywall, /\{context === 'limit' \? \(\s*<Text style=\{styles\.reset\}>\s*\{allowanceLine\(allowance,/);
});

test('no badges, no countdowns, no savings and no social proof', () => {
  const paywall = read(PAYWALL);
  assert.doesNotMatch(paywall, /Most popular|Best value|Save \d|% off|\bbadge\b|countdown|\breviews\b|users love|\brated\b/i);
  assert.doesNotMatch(paywall, /trialBadge|DAYS FREE/);
  // Only what the build ships.
  assert.match(paywall, /'Unlimited analyses',\s*'Watermark-free exports',\s*'Higher recording quality',\s*'Compare deliveries',/);
  assert.match(paywall, /'Compare deliveries',\s*'Your stats',/);
  assert.match(paywall, /stats: \{\s*headline: \(trial\) =>\s*trial === null \? 'See your stats\.' : `See your stats\. \$\{trial\} days free\.`,\s*dismiss: 'Continue with personal best only',/);
});

test('a purchase in progress says so and cannot be sent twice; a cancelled one says nothing', () => {
  const paywall = read(PAYWALL);
  assert.match(paywall, /if \(!chosen \|\| buying\) return;/);
  assert.match(paywall, /\{buying \? 'Opening Google Play…' : \(cta \?\? 'Loading plans…'\)\}/);
  assert.match(paywall, /case 'purchased':\s*case 'cancelled':\s*return null;/);
  // Restore reports Pro restored, as a notice.
  assert.match(paywall, /tone: 'success', title: 'Pro restored'/);
});

test('while plans load the button waits and leaving is still possible', () => {
  const paywall = read(PAYWALL);
  assert.match(paywall, /\{\(cta \|\| waitingForPlans\) && !restored \? \(/);
  assert.match(paywall, /\(buying \|\| sample \|\| cta === null\) && styles\.ctaOff/);
  // The dismiss is at the top as well as below.
  assert.match(paywall, /<AppBar\s+title="Paceball Pro"\s+onBack=\{leave\}/);
  assert.equal(paywall.match(/onPress=\{leave\}/g).length, 1);
});

test('the paywall takes every colour and size from tokens', () => {
  const source = read(PAYWALL);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i);
  const styles = source.slice(source.indexOf('StyleSheet.create'));
  assert.doesNotMatch(styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''), /:\s*-?\d+(\.\d+)?\s*[,}\n]/);
});
