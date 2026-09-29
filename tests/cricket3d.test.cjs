require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { before, test } = require('node:test');

// tokens.ts reads Platform for its mono face; stand in the one thing it touches.
const rn = require.resolve('react-native');
require.cache[rn] = { id: rn, filename: rn, loaded: true, exports: { Platform: { select: (o) => o.default } } };

const S = require('../src/ui/cricket3d/shaders.ts');
const { wicketLayout, camera, onGround, above } = require('../src/ui/cricket3d/geometry.ts');
const { colors, scene } = require('../src/ui/tokens.ts');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');
const KIT = ['src/ui/cricket3d/Kit.tsx', 'src/ui/cricket3d/materials.ts', 'src/ui/cricket3d/geometry.ts', 'src/ui/cricket3d/shaders.ts'];

let CK;
before(async () => {
  CK = await require('canvaskit-wasm/bin/full/canvaskit.js')({
    locateFile: () => require.resolve('canvaskit-wasm/bin/full/canvaskit.wasm'),
  });
});

const c = (hex) => S.rgb(hex);
const DEFAULTS = {
  light: S.LIGHT, base: c(colors.accent), seamColor: [0.4, 0.5, 0.1], stitchColor: c(scene.wood),
  rimColor: c(scene.floodlight), paint: c(scene.wood), lime: c(colors.accent), turf: c(scene.turf),
  turfDeep: c(scene.turfDeep), pitch: c(scene.pitch), pitchWorn: c(scene.pitchWorn), crease: c(scene.crease),
  flood: c(scene.floodlight), haze: c(scene.haze), night: c(scene.night), metal: c(scene.metal),
  metalDark: c(scene.metalDark), face: c(colors.bg), lift: c(colors.surface), edgeGlow: c(colors.accent),
  alpha: 1, glow: 0, horizontal: 0, groundShade: 1, spin: 0.5, tilt: -1.2, intensity: 1, sweep: 0.5,
};

/** Draws one shader over a w x h surface and returns its RGBA pixels. */
function render(name, w, h, uniforms) {
  const effect = CK.RuntimeEffect.Make(S.SHADERS[name]);
  assert.ok(effect, `${name} compiles`);
  const values = [];
  for (let i = 0; i < effect.getUniformCount(); i++) {
    const key = effect.getUniformName(i);
    const v = uniforms[key] ?? DEFAULTS[key];
    assert.notEqual(v, undefined, `${name} needs ${key}`);
    values.push(...(Array.isArray(v) ? v : [v]));
  }
  const surface = CK.MakeSurface(w, h);
  const paint = new CK.Paint();
  paint.setShader(effect.makeShader(values));
  surface.getCanvas().drawRect(CK.XYWHRect(0, 0, w, h), paint);
  const pixels = surface.makeImageSnapshot().readPixels(0, 0, { width: w, height: h, colorType: CK.ColorType.RGBA_8888, alphaType: CK.AlphaType.Unpremul, colorSpace: CK.ColorSpace.SRGB });
  surface.delete();
  return (x, y) => {
    const i = (Math.round(y) * w + Math.round(x)) * 4;
    return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3], lum: pixels[i] + pixels[i + 1] + pixels[i + 2] };
  };
}

test('every kit shader compiles, and every uniform it declares is one the kit passes', () => {
  // Which file hands each shader its uniforms.
  const users = {
    BALL: 'src/ui/cricket3d/Kit.tsx',
    CYLINDER: 'src/ui/cricket3d/Kit.tsx',
    PITCH: 'src/ui/cricket3d/Kit.tsx',
    STADIUM: 'src/ui/cricket3d/Kit.tsx',
  };
  for (const [name, source] of Object.entries(S.SHADERS)) {
    const effect = CK.RuntimeEffect.Make(source);
    assert.ok(effect, `${name} compiles`);
    if (!users[name]) continue;
    const kit = read(users[name]);
    for (let i = 0; i < effect.getUniformCount(); i++) {
      const key = effect.getUniformName(i);
      assert.match(kit, new RegExp(`\\b${key}:`), `${name}.${key} is never set`);
    }
    // SkSL leaves pow() of a negative base undefined; squares go through sq().
    assert.doesNotMatch(source, /pow\(\(?-|pow\([^,]*[-+][^,]*\/[^,]*, 2\.0\)/, `${name} squares with pow`);
  }
});

test('the ball is lit from the upper left, has a hard edge, and nothing outside it', () => {
  const px = render('BALL', 200, 200, { center: [100, 100], radius: 80 });
  assert.equal(px(5, 5).a, 0, 'outside the ball');
  assert.equal(px(100, 100).a, 255);
  assert.ok(px(70, 65).lum > px(135, 140).lum + 60, 'brighter towards the light');
  const lime = px(90, 100);
  assert.ok(lime.g > lime.b + 60 && lime.r > lime.b, 'lime, not grey');
});

test('stumps are lit on one side, dome at the top, and glow turns them lime', () => {
  const white = render('CYLINDER', 40, 300, { size: [40, 300] });
  assert.ok(white(8, 150).lum > white(33, 150).lum, 'lit from the left');
  assert.equal(white(2, 2).a, 0, 'the top is domed, not square');
  assert.ok(white(20, 150).a > 250);
  assert.ok(white(20, 150).lum > white(20, 296).lum, 'darker where it meets the ground');
  const lime = render('CYLINDER', 40, 300, { size: [40, 300], glow: 1 })(12, 150);
  assert.ok(lime.g > lime.b + 80, 'lime once it glows');
  const bail = render('CYLINDER', 200, 20, { size: [200, 20], horizontal: 1, groundShade: 0 });
  assert.equal(bail(1, 1).a, 0, 'both ends of a bail are domed');
  assert.equal(bail(199, 1).a, 0);
  assert.ok(bail(100, 10).a > 250);
});

test('the pitch is ground below the horizon only, symmetric about the strip, and fades into haze', () => {
  const w = 200, h = 400, horizon = 150;
  const px = render('PITCH', w, h, { origin: [100, 0], horizon, focal: 700, camH: 1.1, stumpZ: 6 });
  assert.equal(px(100, 100).a, 0, 'nothing above the horizon');
  assert.equal(px(100, 380).a, 255);
  // The same distance either side of the middle reads the same brightness,
  // give or take texture: no half of the ground left undefined.
  for (const y of [200, 280, 360]) {
    const left = px(60, y).lum;
    const right = px(140, y).lum;
    assert.ok(Math.abs(left - right) < 90, `y ${y}: ${left} vs ${right}`);
    assert.ok(left > 20, `y ${y} is not black`);
  }
});

test('the stadium is opaque everywhere, dark overall, brightest at its floodlights', () => {
  const w = 200, h = 400;
  const px = render('STADIUM', w, h, { size: [w, h], horizon: 150 });
  let total = 0;
  for (let y = 5; y < h; y += 20) for (let x = 5; x < w; x += 20) { assert.equal(px(x, y).a, 255); total += px(x, y).lum; }
  assert.ok(total / 200 < 160, 'a night sky, not a grey one');
  assert.ok(px(28, 63).lum > px(100, 20).lum + 200, 'the floodlight outshines the sky');
});

test('the bezel and badge are metal lit from the upper left, with nothing outside them', () => {
  const bezel = render('BEZEL', 200, 200, { center: [100, 100], inner: 70, outer: 90 });
  assert.equal(bezel(100, 100).a, 0, 'the dial shows through the middle');
  assert.equal(bezel(2, 2).a, 0);
  assert.ok(bezel(100, 20).a > 250);
  const plate = render('PLATE', 200, 80, { size: [200, 80], corner: 18, bevel: 8 });
  assert.equal(plate(0, 0).a, 0, 'rounded corners');
  assert.ok(plate(100, 40).a > 250);
});

test('the wicket keeps its proportions and the camera puts nearer things lower and larger', () => {
  const w = wicketLayout(100, 300, 100);
  assert.equal(w.stumps.length, 3);
  assert.equal(w.bails.length, 2);
  assert.ok(Math.abs(w.width / 100 - 0.36) < 1e-9);
  assert.ok(w.stumps[2].x + w.stumps[2].w - w.stumps[0].x - w.width < 1e-9);
  for (const b of w.bails) assert.ok(b.y + b.h > w.stumps[0].y, 'bails sit on the stumps');
  const cam = camera(400, 300, 800, 1.1);
  const near = onGround(cam, 0, 5);
  const far = onGround(cam, 0, 20);
  assert.ok(near.y > far.y && near.scale > far.scale);
  assert.ok(above(cam, 0, 5, 0.71).y < near.y);
});

test('the kit adds no 3D library and paints only with tokens', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const dep of ['expo-gl', 'three', 'expo-three', '@react-three/fiber']) {
    assert.equal(pkg.dependencies[dep], undefined, dep);
  }
  for (const file of KIT) {
    const source = read(file);
    assert.doesNotMatch(source, /#[0-9a-f]{6}\b/i, `${file} hardcodes a colour`);
    assert.doesNotMatch(source, /from 'three'|expo-gl/, file);
    assert.doesNotMatch(source, /—/, file);
  }
});

test('the wicket lock is the kit wicket: bails fall with a shadow, then the set lights lime', () => {
  const lock = read('src/ui/WicketLock.tsx');
  assert.match(lock, /<Wicket3D x=\{width \/ 2\} y=\{foot\} height=\{stumpHeight\} glow=\{lime\} bails=\{bails\} \/>/);
  assert.match(lock, /const dy = \(seated\.value - 1\) \* drop;/);
  assert.match(lock, /const shadowOpacity = useDerivedValue\(\(\) => opacity\.inactive \* seated\.value\);/);
  assert.doesNotMatch(lock, /backgroundColor/, 'no flat bars left');
});
