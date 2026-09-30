require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// tokens.ts only needs Platform from React Native, which Node cannot load.
const rn = require.resolve('react-native');
require.cache[rn] = { id: rn, filename: rn, loaded: true, exports: { Platform: { select: (o) => o.android ?? o.default } } };
const { size, space, stroke, type } = require('../src/ui/tokens.ts');
const { tileColumns } = require('../src/ui/stats.ts');
const { kit, typefaces } = require('../scripts/render-share-card.cjs');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

/** The phone the brief names: 360 dp wide, text at 1.3x. */
const SCREEN = 360;
const SCALE = 1.3;

/** Stats' own words, read from the screen so the test follows any change to them. */
function statsWords() {
  const stats = read('app/stats.tsx');
  const kpis = [...stats.match(/const KPIS = \[([\s\S]*?)\] as const;/)[1].matchAll(/\['\w+', '([^']+)'/g)].map((m) => m[1]);
  const locked = [...stats.match(/const LOCKED = \[([\s\S]*?)\] as const;/)[1].matchAll(/\['\w+', '([^']+)', '\w+', '([^']+)'\]/g)]
    .map((m) => ({ title: m[1], line: m[2] }));
  return { kpis, locked };
}

/**
 * Renders a line of text with a real font, as the phone would at 1.3x, and
 * returns its width. Arial stands in for the phone's face; it runs a little
 * wider than Roboto, so a fit here is a fit there.
 */
async function measurer() {
  const skia = await kit();
  const faces = typefaces(skia);
  return (value, style, bold = false) => {
    const px = style.fontSize * SCALE;
    const font = skia.Font(bold ? faces.bold : faces.regular, px);
    const glyphs = font.getGlyphWidths(font.getGlyphIDs(value)).reduce((sum, w) => sum + w, 0);
    font.dispose();
    return glyphs + (style.letterSpacing ?? 0) * SCALE * value.length;
  };
}

test('Stats tile labels fit on one line, three across a 360 dp phone at 1.3x text: never broken mid-word', async () => {
  const width = await measurer();
  // The app's own 24 dp gutter, as on every other screen.
  const content = SCREEN - space.lg * 2;
  assert.match(read('app/stats.tsx'), /const contentWidth = width - space\.lg \* 2;/);
  assert.match(read('app/stats.tsx'), /content: \{ paddingHorizontal: space\.lg,/);
  const columns = tileColumns(content, SCALE, size.kpiMin, space.sm, 3);
  assert.equal(columns, 3, 'three tiles across');
  const tile = (content - space.sm * (columns - 1)) / columns;
  // Inside the tile's padding and its hairline edge.
  const inner = tile - space.sm * 2 - stroke.hairline * 2;
  const { kpis } = statsWords();
  assert.deepEqual(kpis, ['Deliveries', 'Measured', 'This week']);
  for (const label of kpis) {
    const w = width(label, type.caption, true);
    assert.ok(w <= inner, `"${label}" is ${w.toFixed(1)} wide in a ${inner.toFixed(1)} tile`);
  }
  // And the figure beneath it: a count of three digits fits too.
  assert.ok(width('999', type.h1, true) <= inner);
});

test('Stats card titles and locked lines only ever wrap at a space', async () => {
  const width = await measurer();
  const content = SCREEN - space.lg * 2;
  // A wide card: its padding and edge, the small icon and its gap, and the Pro pill on a locked one.
  const card = content - space.md * 2 - stroke.hairline * 2;
  const pill = width('PRO', type.label, true) + space.sm * 2 + stroke.hairline * 2;
  const titleRoom = card - size.iconSmall - space.sm - pill - space.sm;
  const { locked } = statsWords();
  assert.equal(locked.length, 4);
  const titles = [...locked.map((l) => l.title), 'Personal best'];
  for (const title of titles) {
    // Set in capitals, letter spaced: each word must fit the room on its own.
    for (const word of title.toUpperCase().split(' ')) {
      const w = width(word, type.label, true);
      assert.ok(w <= titleRoom, `"${word}" is ${w.toFixed(1)} wide in ${titleRoom.toFixed(1)}`);
    }
  }
  for (const { line } of locked) {
    for (const word of line.split(' ')) assert.ok(width(word, type.caption) <= card, word);
  }
});
