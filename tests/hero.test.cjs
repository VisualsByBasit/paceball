require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { heroDelivery, HERO_BEST, HERO_FEATURED } = require('../src/ui/deliveries.ts');
const { DEFAULT_SETTINGS, featuring, parseSettings } = require('../src/settings/settings.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const measured = (speedKmh, errorKmh = 3) => ({ kind: 'measured', speedKmh, errorKmh });
const list = [
  { id: 'wild', createdAt: 5, state: measured(20000) },
  { id: 'slow', createdAt: 4, state: measured(112.5) },
  { id: 'guess', createdAt: 3, state: { kind: 'not-seen' } },
  { id: 'fast', createdAt: 2, state: measured(134.1) },
  { id: 'tie', createdAt: 1, state: measured(134.1) },
];

test('the hero is the personal best until the player chooses another', () => {
  const hero = heroDelivery(list, null);
  assert.equal(hero.delivery.id, 'fast');
  assert.equal(hero.isBest, true);
  assert.equal(hero.title, 'Personal best · Highest estimate');
  assert.equal(HERO_BEST, 'Personal best · Highest estimate');
  assert.equal(heroDelivery([], null), null);
  assert.equal(heroDelivery([list[0], list[2]], null), null, 'nothing that counts, no hero');
});

test('a slower chosen delivery is a featured delivery, never a personal best', () => {
  const hero = heroDelivery(list, 'slow');
  assert.equal(hero.delivery.id, 'slow');
  assert.equal(hero.isBest, false);
  assert.equal(hero.title, HERO_FEATURED);
  assert.equal(HERO_FEATURED, 'Featured delivery');
  // One that equals the highest estimate is a personal best too.
  assert.equal(heroDelivery(list, 'tie').title, HERO_BEST);
});

test('a choice that is deleted, implausible or has no speed falls back to the best', () => {
  for (const gone of ['deleted-long-ago', 'wild', 'guess']) {
    const hero = heroDelivery(list, gone);
    assert.equal(hero.delivery.id, 'fast', gone);
    assert.equal(hero.title, HERO_BEST, gone);
  }
});

test('the choice is stored per player, and choosing the best follows the best', () => {
  assert.deepEqual(DEFAULT_SETTINGS.featuredDelivery, {});
  let featured = {};
  featured = featuring(featured, 'player-a', 'slow').featuredDelivery;
  featured = featuring(featured, 'player-b', 'other').featuredDelivery;
  assert.deepEqual(featured, { 'player-a': 'slow', 'player-b': 'other' });
  assert.deepEqual(featuring(featured, 'player-a', null).featuredDelivery, { 'player-b': 'other' });
  // Stored values that are not string pairs are dropped, the rest kept.
  assert.deepEqual(
    parseSettings({ featuredDelivery: { a: 'x', b: 3, c: '', d: null } }).featuredDelivery,
    { a: 'x' },
  );
  assert.deepEqual(parseSettings({ featuredDelivery: ['x'] }).featuredDelivery, {});

  const home = read('app/index.tsx');
  assert.match(home, /const chosenId = playerId \? featuredDelivery\[playerId\] : null;/);
  assert.match(home, /heroDelivery\(listed, chosenId\)/);
  assert.match(home, /updateSettings\(featuring\(featuredDelivery, playerId, best && id === best\.id \? null : id\)\)/);
  // Tapping the hero opens the picker, which lists only readings that count.
  assert.match(home, /onPress=\{\(\) => setPicking\(true\)\}/);
  assert.match(home, /const choices = useMemo\(\(\) => countingDeliveries\(listed\), \[listed\]\);/);
  assert.match(home, /<BottomSheet visible=\{picking\} title="Shown on Home"/);
  assert.match(home, /label="Open this delivery"/);
});
