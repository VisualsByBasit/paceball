/**
 * A stand-in Skia and canvas for drawCard: every call is accepted, and the text
 * drawn is recorded with where it went and what the canvas was doing (a band
 * rotated, a clip in place). Not a test file itself.
 */
const { drawCard } = require('../src/export/drawCard.ts');

const PALETTE = {
  bg: '#0A0B0D', surface: '#14161A', line: '#1F232A', control: '#626A76', text: '#FFFFFF',
  muted: '#8A9099', accent: '#D4FF3F', warn: '#FFC247', lavender: '#B7B5E0', panel: '#15181E', limeDeep: '#1D2A07',
};

const anything = () => new Proxy(() => {}, { get: (_, key) => (key === 'dispose' ? () => {} : anything()), apply: () => anything() });

function mockCanvas() {
  const drawn = [];
  const calls = [];
  let depth = 0;
  let rotated = 0;
  const stack = [];
  const paint = () => {
    const p = { color: null, alpha: 1 };
    return new Proxy(p, {
      get: (target, key) => {
        if (key === 'setColor') return (c) => { target.color = c; };
        if (key === 'setAlphaf') return (a) => { target.alpha = a; };
        if (key in target) return target[key];
        return () => {};
      },
    });
  };
  const skia = {
    Paint: paint,
    Color: (c) => c,
    Point: (x, y) => ({ x, y }),
    XYWHRect: (x, y, width, height) => ({ x, y, width, height }),
    RRectXY: (rect, rx, ry) => ({ rect, rx, ry }),
    Path: { Make: () => anything() },
    Shader: { MakeLinearGradient: () => ({}) },
    MaskFilter: { MakeBlur: () => ({}) },
    ImageFilter: { MakeBlur: () => ({}) },
  };
  const canvas = new Proxy({}, {
    get: (_, key) => {
      if (key === 'drawText') {
        return (value, x, y, p) => drawn.push({ value, x, y, color: p.color, alpha: p.alpha, rotated, clipped: depth > 0 });
      }
      if (key === 'save') return () => { stack.push(rotated); depth++; };
      if (key === 'restore') return () => { rotated = stack.pop() ?? 0; depth--; };
      if (key === 'rotate') return (deg) => { rotated += deg; calls.push({ key, args: [deg] }); };
      return (...args) => calls.push({ key, args });
    },
  });
  return { drawn, calls, skia, canvas };
}

/** Draw a session's card and return what was written, and every other call. */
function drawMock(session, watermark, details = { playerName: 'Sam' }) {
  const { drawn, calls, skia, canvas } = mockCanvas();
  const photo = { width: () => session.width, height: () => session.height };
  drawCard(skia, canvas, photo, session, watermark, () => null, PALETTE, details);
  return Object.assign(drawn, { calls });
}

module.exports = { PALETTE, mockCanvas, drawMock };
