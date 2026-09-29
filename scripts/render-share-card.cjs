/**
 * Renders the share card, Pro and free, with the real renderer (drawCard) in
 * CanvasKit, the same Skia the tests use, to docs/design/share-card/*-output.png.
 * The frame is a drawn stand-in, since no real recording ships with the repo.
 *
 *   node scripts/render-share-card.cjs [outDir]
 */
require('../tests/register.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { createMockSession } = require('../src/data/mockData.ts');
const { drawCard } = require('../src/export/drawCard.ts');
const { EXPORT_WIDTH, EXPORT_HEIGHT } = require('../src/export/layout.ts');

const PALETTE = {
  bg: '#0A0B0D', surface: '#14161A', line: '#1F232A', control: '#626A76', text: '#FFFFFF',
  muted: '#8A9099', accent: '#D4FF3F', warn: '#FFC247', lavender: '#B7B5E0', panel: '#15181E', limeDeep: '#1D2A07',
};

async function kit() {
  const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js');
  const ck = await CanvasKitInit({ locateFile: () => require.resolve('canvaskit-wasm/bin/full/canvaskit.wasm') });
  return require('@shopify/react-native-skia/lib/commonjs/skia/web').JsiSkApi(ck);
}

function typefaces(skia) {
  const pick = (names) => names.find((p) => p && fs.existsSync(p));
  const regular = pick([process.env.PACEBALL_TEST_FONT, 'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf']);
  const bold = pick([process.env.PACEBALL_TEST_FONT_BOLD, 'C:/Windows/Fonts/arialbd.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf']) ?? regular;
  if (!regular) throw new Error('Set PACEBALL_TEST_FONT to a TTF.');
  const load = (file) => skia.Typeface.MakeFreeTypeFaceFromData(skia.Data.fromBytes(fs.readFileSync(file)));
  return { regular: load(regular), bold: load(bold) };
}

/** A stand-in for a release frame: a room, a floor, a leg, in the reference's colours. */
function standInFrame(skia, width, height) {
  const surface = skia.Surface.Make(width, height);
  const c = surface.getCanvas();
  const paint = skia.Paint();
  const box = (color, x, y, w, h) => { paint.setColor(skia.Color(color)); c.drawRect(skia.XYWHRect(x * width, y * height, w * width, h * height), paint); };
  box('#3A2A20', 0, 0, 1, 1);
  box('#D98A2B', 0, 0, 0.45, 0.55);
  box('#8C8474', 0.4, 0.18, 0.6, 0.12);
  box('#22262E', 0.45, 0.3, 0.55, 0.3);
  box('#6C5A4B', 0, 0.7, 1, 0.3);
  box('#1E2A4A', 0, 0.35, 0.62, 0.42);
  box('#B98670', 0.62, 0.45, 0.38, 0.35);
  surface.flush();
  const image = surface.makeImageSnapshot();
  paint.dispose();
  return { image, surface };
}

async function render(skia, faces, { watermark, session, playerName, unit = 'kmh' }) {
  const { image: photo, surface: source } = standInFrame(skia, session.width, session.height);
  const iconBytes = fs.readFileSync(path.join(__dirname, '..', 'assets', 'icon.png'));
  const iconData = skia.Data.fromBytes(iconBytes);
  const icon = skia.Image.MakeImageFromEncoded(iconData);
  const surface = skia.Surface.Make(EXPORT_WIDTH, EXPORT_HEIGHT);
  const fonts = [];
  drawCard(skia, surface.getCanvas(), photo, session, watermark, (size, bold) => {
    const font = skia.Font(bold ? faces.bold : faces.regular, size);
    fonts.push(font);
    return font;
  }, PALETTE, { playerName, unit, icon });
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const png = Buffer.from(snapshot.encodeToBytes(4));
  snapshot.dispose(); surface.dispose(); fonts.forEach((f) => f.dispose());
  photo.dispose(); source.dispose(); icon?.dispose(); iconData.dispose();
  return png;
}

/** The delivery the references show: a slow indoor throw marked against markers. */
function sampleSession() {
  const session = createMockSession('share-card-sample', 128.4, new Date(2026, 8, 29, 18).getTime());
  return session;
}

module.exports = { kit, typefaces, render, sampleSession, PALETTE };

if (require.main === module) {
  (async () => {
    const out = process.argv[2] ?? path.join(__dirname, '..', 'docs', 'design', 'share-card');
    fs.mkdirSync(out, { recursive: true });
    const skia = await kit();
    const faces = typefaces(skia);
    const session = sampleSession();
    for (const [file, watermark] of [['pro-output.png', false], ['free-output.png', true]]) {
      fs.writeFileSync(path.join(out, file), await render(skia, faces, { watermark, session, playerName: 'Abdulbasit' }));
      console.log(path.join(out, file));
    }
  })().catch((e) => { console.error(e); process.exit(1); });
}
