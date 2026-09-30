require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { createMockSession } = require('../src/data/mockData.ts');
const {
  CARD,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  bandPlacement,
  glowRoom,
  coverGeometry,
  labelBox,
  shareCardLayout,
} = require('../src/export/layout.ts');
const {
  CARD_BAND,
  CARD_FOOT,
  CARD_LABEL,
  CARD_METHOD,
  CARD_PATH_LABEL,
  CARD_UPGRADE,
  SK,
} = require('../src/export/drawCard.ts');
const { CHECK_READING } = require('../src/ui/gauge.ts');
const { measurementState } = require('../src/physics/measurementState.ts');
const { drawMock } = require('./card-mock.cjs');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const session = () => createMockSession('share-card', 128.4, new Date(2026, 8, 29, 12).getTime());
const texts = (drawn) => drawn.map((d) => d.value);
const at = (drawn, value) => drawn.find((d) => d.value === value);

test('the Pro card: PRO pill, the reading with its range, the frame and the footer; no band, no upgrade', () => {
  const s = session();
  const reading = measurementState(s);
  const drawn = drawMock(s, false, { playerName: 'Abdulbasit' });
  const values = texts(drawn);
  for (const expected of [
    'PRO', CARD_LABEL, reading.speedKmh.toFixed(1), 'km/h', `± ${reading.errorKmh} km/h`, CARD_METHOD,
    'Abdulbasit', 'Release', 'Bounce', 'Near', 'Far', CARD_PATH_LABEL, '29 September 2026', CARD_FOOT,
  ]) assert.ok(values.includes(expected), expected);
  for (const absent of ['FREE', ...CARD_BAND, CARD_UPGRADE, CHECK_READING]) assert.ok(!values.includes(absent), absent);
  assert.equal(CARD_LABEL, 'Bowling Speed');
  // Top to bottom: label, speed, its range, how, whose.
  const order = [CARD_LABEL, reading.speedKmh.toFixed(1), `± ${reading.errorKmh} km/h`, CARD_METHOD, 'Abdulbasit']
    .map((v) => at(drawn, v).y);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1]);
  // The speed and the range are lime and white.
  // The number and its smaller unit, both lime, on the one baseline.
  const number = at(drawn, reading.speedKmh.toFixed(1));
  const unit = at(drawn, 'km/h');
  assert.equal(number.color, '#D4FF3F');
  assert.equal(unit.color, '#D4FF3F');
  assert.equal(unit.y, number.y);
  assert.ok(unit.x > number.x);
  assert.equal(at(drawn, `± ${reading.errorKmh} km/h`).color, '#FFFFFF');
});

test('the free card: FREE pill, the band across the frame, and the upgrade bar under the footer', () => {
  const s = session();
  const drawn = drawMock(s, true);
  const values = texts(drawn);
  for (const expected of ['FREE', CARD_UPGRADE, CARD_FOOT]) assert.ok(values.includes(expected), expected);
  assert.ok(!values.includes('PRO'));
  assert.deepEqual([...CARD_BAND], ['PACEBALL', 'FREE']);
  assert.equal(CARD_UPGRADE, 'Upgrade to Pro for clean exports');
  // The band is drawn turned -30 degrees, inside the frame's clip, faint:
  // the traced wordmark, never PACEBALL set in a font, then FREE in lime.
  const { WORDMARK_PATHS } = require('../src/ui/wordmarkPaths.ts');
  const band = drawn.paths.filter((p) => p.rotated === CARD.band.angle);
  const name = band.find((p) => p.svg === WORDMARK_PATHS.white);
  const free = drawn.find((d) => d.value === 'FREE' && d.rotated === CARD.band.angle);
  assert.ok(name && free, 'wordmark and FREE drawn turned');
  assert.ok(band.some((p) => p.svg === WORDMARK_PATHS.lime));
  assert.ok(name.clipped && free.clipped);
  assert.ok(name.alpha < 0.6 && free.alpha < 0.6);
  assert.equal(free.color, '#D4FF3F');
  assert.ok(!values.includes('PACEBALL'), 'PACEBALL is never set in a font');
  // The upgrade bar is the last thing on the card, under the date.
  assert.ok(at(drawn, CARD_UPGRADE).y > at(drawn, CARD_FOOT).y);
  // The old strip is gone.
  assert.ok(!values.includes('PACEBALL · FREE'));
});

test('an implausible reading carries "Check this reading" under its range, on both cards', () => {
  const s = session();
  const wild = { ...s, speedKmh: 400 };
  const reading = measurementState(wild);
  for (const watermark of [true, false]) {
    const drawn = drawMock(wild, watermark);
    const chip = at(drawn, CHECK_READING);
    assert.ok(chip, `chip on the ${watermark ? 'free' : 'Pro'} card`);
    assert.equal(chip.color, '#FFC247');
    assert.ok(chip.y > at(drawn, `± ${reading.errorKmh} km/h`).y && chip.y < at(drawn, CARD_METHOD).y);
    assert.ok(!texts(drawMock(s, watermark)).includes(CHECK_READING), 'never on a plausible reading');
  }
});

test('the band never covers the Release or Bounce labels', () => {
  const layout = shareCardLayout({ pro: false, hasName: true, implausible: false, cautionHeights: [] });
  const frame = layout.frame;
  const width = (v) => v.length * CARD.text.mark * 0.56;
  const covers = (band, box) => {
    const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
      .map(([x, y]) => (x - band.cx) * band.nx + (y - band.cy) * band.ny);
    return Math.max(...corners) > band.offset - CARD.band.thickness / 2 && Math.min(...corners) < band.offset + CARD.band.thickness / 2;
  };
  let clear = 0;
  let tried = 0;
  for (let i = 0; i < 400; i++) {
    const rand = (n) => (Math.sin(i * 91.7 + n * 13.3) + 1) / 2;
    const release = { x: frame.x + rand(1) * frame.width, y: frame.y + rand(2) * frame.height };
    const bounce = { x: frame.x + rand(3) * frame.width, y: frame.y + rand(4) * frame.height };
    const labels = [labelBox(width('Release'), release, frame), labelBox(width('Bounce'), bounce, frame)];
    const band = bandPlacement(frame, labels);
    tried++;
    if (band.clear) {
      clear++;
      for (const box of labels) assert.equal(covers(band, box), false, `case ${i}`);
    }
  }
  // Two labels leave room for the band nearly always; when they cannot, it
  // goes where it covers the fewest.
  assert.ok(clear / tried > 0.95, `${clear} of ${tried}`);

  // And drawCard places it from those very labels.
  const card = read('src/export/drawCard.ts');
  assert.match(card, /const band = bandPlacement\(frame, \[releaseLabel, bounceLabel\]\);/);
  assert.match(card, /plateAt\('Release', releaseLabel\);/);
  assert.match(card, /plateAt\('Bounce', bounceLabel\);/);
});

test('the Pro card has no ball: both cards share one faint dot grid, and the upgrade bar has no arrow', () => {
  const card = read('src/export/drawCard.ts');
  assert.doesNotMatch(card, /drawBall|circuit|orbit|seam|chevron/i);
  assert.equal((card.match(/dotGrid\(/g) ?? []).length, 1, 'one grid, the same for both cards');
  assert.doesNotMatch(card.slice(card.indexOf('dotGrid(Math.max') - 200, card.indexOf('dotGrid(Math.max')), /if \(pro\)/);
  // The crown and the words are centred together, as one group.
  assert.match(card, /const gx = u\.x \+ \(u\.width - groupWidth\) \/ 2;/);
  const free = drawMock(session(), true);
  const bar = at(free, CARD_UPGRADE);
  const layout = shareCardLayout({ pro: false, hasName: true, implausible: false, cautionHeights: [] });
  assert.ok(bar.x > layout.upgrade.x + CARD.pad, 'centred, not left-aligned');
});

test('the frame fills its panel but never crops a mark', () => {
  const box = { x: 146, y: 180, width: 788, height: 560 };
  const s = createMockSession('crop', 128.4);
  // Central marks: cropped to fill.
  s.release = { x: 700, y: 400, frame: 42 };
  s.bounce = { x: 1100, y: 600, frame: 60 };
  s.calA = { x: 800, y: 700, frame: 0 };
  s.calB = { x: 1000, y: 700, frame: 0 };
  let g = coverGeometry(s, 1920, 1080, box, [s.release, s.bounce, s.calA, s.calB]);
  assert.ok(g.rect.x <= box.x && g.rect.y <= box.y + 1e-9);
  assert.ok(g.rect.x + g.rect.width >= box.x + box.width - 1e-9 && g.rect.y + g.rect.height >= box.y + box.height - 1e-9);
  // Marks at the frame's edges: every one still inside the panel.
  for (const [ax, bx] of [[20, 1900], [100, 1820], [5, 300]]) {
    s.calA = { x: ax, y: 1000, frame: 0 };
    s.calB = { x: bx, y: 60, frame: 0 };
    g = coverGeometry(s, 1920, 1080, box, [s.release, s.bounce, s.calA, s.calB]);
    for (const p of [g.release, g.bounce, g.calA, g.calB]) {
      assert.ok(p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height, JSON.stringify(p));
    }
  }
  // Where the mark-safe crop leaves bare edges, the blurred frame fills them.
  assert.match(read('src/export/drawCard.ts'), /soft\.setImageFilter\(skia\.ImageFilter\.MakeBlur\(/);
});

test('the layout: a centred lime card, panels in order, all on the 1080 x 1350 export', () => {
  for (const pro of [true, false]) {
    for (const [hasName, implausible, cautionHeights] of [[true, false, []], [false, true, [120]], [true, true, [120, 150]]]) {
      const l = shareCardLayout({ pro, hasName, implausible, cautionHeights });
      // Its usual height, grown only when cautions would squeeze the frame.
      assert.ok(l.card.height >= (pro ? CARD.heightPro : CARD.heightFree));
      if (cautionHeights.length === 0) assert.equal(l.card.height, pro ? CARD.heightPro : CARD.heightFree);
      assert.equal(l.card.x * 2 + l.card.width, EXPORT_WIDTH);
      assert.ok(l.card.y >= 0 && l.card.y + l.card.height <= EXPORT_HEIGHT);
      const panels = [l.header, l.frame, l.reading, ...l.cautions, l.footer, ...(l.upgrade ? [l.upgrade] : [])];
      for (let i = 1; i < panels.length; i++) {
        assert.ok(panels[i].y >= panels[i - 1].y + panels[i - 1].height, `panel ${i} below the one before`);
      }
      // The frame keeps its least unless the card is already as tall as the
      // export allows; even then it stays a real picture.
      if (l.card.height < EXPORT_HEIGHT - CARD.inset * 2) assert.ok(l.frame.height >= CARD.frame.min);
      assert.ok(l.frame.height >= 240, `${l.frame.height}`);
      const last = panels[panels.length - 1];
      assert.ok(last.y + last.height <= l.card.y + l.card.height - CARD.inset + 1e-9);
      assert.equal(l.upgrade === null, pro);
      assert.equal(l.reading.checkTop !== null, implausible);
    }
  }
  assert.equal(CARD.radius, 48);
  assert.ok(CARD.border >= 3 && CARD.border <= 4);
  assert.equal(CARD.frame.radius, 28);
  assert.equal(CARD.frame.border, 3);
  assert.equal(CARD.header.icon, 96);
  // One inner padding everywhere, and the glow never clipped by the export's edge.
  for (const pro of [true, false]) {
    const l = shareCardLayout({ pro, hasName: true, implausible: true, cautionHeights: [] });
    assert.ok(l.card.y >= glowRoom() && EXPORT_HEIGHT - (l.card.y + l.card.height) >= glowRoom(), `glow room, ${pro}`);
    assert.equal(l.icon.x, l.header.x + CARD.pad);
    assert.equal(l.pill.x + l.pill.width, l.header.x + l.header.width - CARD.pad);
    // The pill is centred on the header's midline, where the wordmark is centred.
    assert.equal(l.pill.y + l.pill.height / 2, l.header.y + l.header.height / 2);
    // The reading's lines keep one rhythm: each cap top the same gap below the line above.
    const r = l.reading;
    const cap = (px) => Math.round(px * 0.74);
    assert.equal(r.rangeBaseline - cap(CARD.text.range) - r.speedBaseline, CARD.rhythm.gap);
    assert.equal(r.methodBaseline - cap(CARD.text.method) - (r.checkTop + CARD.check.height), CARD.rhythm.gap);
    assert.equal(r.nameBaseline - cap(CARD.text.name) - r.methodBaseline, CARD.rhythm.gap);
  }
});

test('the Skia constants drawCard uses are Skia\'s own', () => {
  const t = require('@shopify/react-native-skia/lib/commonjs/skia/types/index.js');
  assert.equal(SK.fill, t.PaintStyle.Fill);
  assert.equal(SK.stroke, t.PaintStyle.Stroke);
  assert.equal(SK.roundCap, t.StrokeCap.Round);
  assert.equal(SK.roundJoin, t.StrokeJoin.Round);
  assert.equal(SK.intersect, t.ClipOp.Intersect);
  assert.equal(SK.blurNormal, t.BlurStyle.Normal);
  assert.equal(SK.clamp, t.TileMode.Clamp);
  assert.equal(SK.screen, t.BlendMode.Screen);
});

test('the unit the player reads in, and the app icon, reach the renderer', () => {
  assert.match(read('src/data/index.ts'), /renderSessionImage\(session, options\.watermark, \{ playerName, unit: options\.unit \}\)/);
  assert.match(read('src/export/renderSessionImage.ts'), /require\('\.\.\/\.\.\/assets\/icon\.png'\)/);
  const mph = drawMock(session(), false, { playerName: 'Sam', unit: 'mph' }).map((d) => d.value);
  assert.ok(mph.some((v) => /^± \d+ mph$/.test(v)), 'the range in mph');
  assert.ok(mph.some((v) => /^\d+\.\d$/.test(v)) && mph.includes('mph'), 'the speed in mph');
});

test('a real render: both cards are 1080 x 1350 PNGs, lit lime at the edge, and differ', async () => {
  const { kit, typefaces, render, sampleSession } = require('../scripts/render-share-card.cjs');
  const skia = await kit();
  const faces = typefaces(skia);
  const s = sampleSession();
  const outputs = [];
  for (const watermark of [false, true]) {
    const png = await render(skia, faces, { watermark, session: s, playerName: 'Sam' });
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), EXPORT_WIDTH);
    assert.equal(png.readUInt32BE(20), EXPORT_HEIGHT);
    const image = skia.Image.MakeImageFromEncoded(skia.Data.fromBytes(png));
    const pixels = image.readPixels();
    const l = shareCardLayout({ pro: !watermark, hasName: true, implausible: false, cautionHeights: [] });
    const px = (x, y) => [...pixels.subarray((y * EXPORT_WIDTH + x) * 4, (y * EXPORT_WIDTH + x) * 4 + 3)];
    // The lime border, left edge, halfway down.
    const [r, g, b] = px(Math.round(l.card.x + 1), Math.round(l.card.y + l.card.height / 2));
    assert.ok(g > 200 && r > 150 && b < 120, `lime border, got ${[r, g, b]}`);
    // The speed and its range are really there: lime and white pixels in the reading panel.
    let lime = 0;
    let white = 0;
    for (let y = l.reading.y; y < l.reading.y + l.reading.height; y += 2) {
      for (let x = l.reading.x; x < l.reading.x + l.reading.width * 0.6; x += 2) {
        const [pr, pg, pb] = px(Math.round(x), Math.round(y));
        if (pg > 200 && pb < 120) lime++;
        if (pr > 220 && pg > 220 && pb > 220) white++;
      }
    }
    assert.ok(lime > 500, 'the speed is visible');
    assert.ok(white > 150, 'its range is visible');
    outputs.push(png);
    image.dispose();
  }
  assert.notDeepEqual(outputs[0], outputs[1]);
  // The committed samples and references are where the brief put them.
  for (const file of ['pro-reference.png', 'free-reference.png', 'pro-output.png', 'free-output.png']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs', 'design', 'share-card', file)), file);
  }
});
