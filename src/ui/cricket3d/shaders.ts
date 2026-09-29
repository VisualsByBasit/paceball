/**
 * The 3D cricket kit's shaders, as SkSL source. Kept free of React and of the
 * native Skia module, so the tests compile every one of them with CanvasKit and
 * render them to check the lighting.
 *
 * One light for the whole kit: a floodlight above and to the left of the
 * camera. Screen space throughout: x right, y down, z towards the viewer.
 * Every shader returns premultiplied colour, and each one is short: a few
 * dozen instructions per pixel, over areas no larger than the screen.
 */

/** The floodlight's direction, towards the light: up, left and in front. */
export const LIGHT: [number, number, number] = (() => {
  const v = [-0.45, -0.62, 0.64];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

/** '#RRGGBB' from the tokens as the 0 to 1 channels a shader takes. */
export function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Not a token colour: ${hex}`);
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

/** Hash and value noise, shared by every shader that wants texture. */
const NOISE = `
float sq(float v) { return v * v; }
float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1.0, 0.0)), f.x),
             mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), f.x), f.y);
}
`;

/**
 * The ball: a lit sphere in lime with a raised, stitched seam that turns with
 * the spin. The seam is a great circle through the spin axis; its ridge tilts
 * the surface normal, so it catches the light on one flank and falls into
 * shade on the other. Leather grain rides with the spin too.
 */
export const BALL = `
uniform float2 center;
uniform float radius;
uniform float3 light;
uniform float spin;
uniform float tilt;
uniform float3 base;
uniform float3 seamColor;
uniform float3 stitchColor;
uniform float3 rimColor;
uniform float alpha;
${NOISE}
half4 main(float2 xy) {
  float2 p = (xy - center) / radius;
  float d = length(p);
  if (d >= 1.0) { return half4(0.0); }
  float edge = 1.0 - smoothstep(1.0 - 1.5 / radius, 1.0, d);
  float3 n = float3(p.x, p.y, sqrt(1.0 - d * d));

  // Into the ball's own frame: axis a in the screen plane, then the spin about it.
  float ca = cos(tilt);
  float sa = sin(tilt);
  float na = n.x * ca + n.y * sa;
  float nb = -n.x * sa + n.y * ca;
  float cs = cos(spin);
  float ss = sin(spin);
  float rb = nb * cs - n.z * ss;
  float rc = nb * ss + n.z * cs;

  // The seam: a raised ridge along the circle where rb is zero.
  float w = 0.085;
  float ridge = exp(-(rb * rb) / (w * w));
  float3 seamN = float3(-sa * cs, ca * cs, -ss);
  float3 m = normalize(n + seamN * (rb / (w * w)) * ridge * 0.05);

  float phi = atan(rc, na);
  float rows = 1.0 - smoothstep(0.012, 0.028, abs(abs(rb) - w * 1.05));
  float dashes = smoothstep(0.35, 0.45, fract(phi * 11.0 + rb * 18.0)) *
                 (1.0 - smoothstep(0.75, 0.85, fract(phi * 11.0 + rb * 18.0)));
  float stitch = rows * dashes;

  float grain = noise(float2(phi * 18.0, rb * 40.0)) * 0.5 + noise(float2(na, rc) * 60.0) * 0.5;
  float3 albedo = base * (0.93 + 0.07 * grain);
  albedo = mix(albedo, seamColor, smoothstep(0.55, 0.9, ridge));
  albedo = mix(albedo, stitchColor, stitch * 0.85);

  float diff = max(dot(m, light), 0.0);
  float wrap = max((dot(m, light) + 0.35) / 1.35, 0.0);
  float3 col = albedo * (0.16 + 0.62 * diff + 0.22 * wrap);
  float spec = pow(max(dot(reflect(-light, m), float3(0.0, 0.0, 1.0)), 0.0), 38.0);
  col += float3(spec * 0.55);
  // A second, cooler floodlight behind, catching the far edge.
  col += rimColor * pow(1.0 - n.z, 3.0) * smoothstep(-0.2, 0.6, p.x + p.y * 0.2) * 0.55;
  // Contact shading towards the silhouette.
  col *= mix(0.72, 1.0, smoothstep(0.0, 0.45, n.z));
  float a = edge * alpha;
  return half4(half3(col * a), half(a));
}
`;

/**
 * A painted wooden cylinder in a rect of `size`: a stump standing up, or a
 * bail lying across. The ends are domed, the paint carries a faint grain, and
 * `glow` turns it lime and lets it give off a little light of its own.
 */
export const CYLINDER = `
uniform float2 size;
uniform float3 light;
uniform float3 paint;
uniform float3 lime;
uniform float glow;
uniform float horizontal;
uniform float groundShade;
uniform float alpha;
${NOISE}
half4 main(float2 xy) {
  float2 q = xy / size;
  float across = mix(q.x, q.y, horizontal);
  float along = mix(q.y, q.x, horizontal);
  float lengthPx = mix(size.y, size.x, horizontal);
  float widthPx = mix(size.x, size.y, horizontal);
  float u = across * 2.0 - 1.0;
  if (abs(u) >= 1.0) { return half4(0.0); }

  // Domed ends: the top of a stump, both ends of a bail.
  float cap = widthPx * 0.5 / lengthPx;
  float fromEnd = mix(along, min(along, 1.0 - along), horizontal);
  float v = clamp((cap - fromEnd) / cap, 0.0, 1.0);
  float r2 = u * u + v * v;
  if (r2 >= 1.0) { return half4(0.0); }
  float aa = 1.0 - smoothstep(1.0 - 2.0 / widthPx, 1.0, sqrt(r2));
  float endSign = mix(-1.0, sign(along - 0.5), horizontal);
  float3 n = normalize(mix(float3(u, v * endSign, sqrt(1.0 - r2)),
                           float3(v * endSign, u, sqrt(1.0 - r2)), horizontal));

  float grain = noise(float2(across * 7.0, along * lengthPx * 0.035)) * 0.6 +
                noise(float2(across * 23.0, along * lengthPx * 0.11)) * 0.4;
  float3 albedo = mix(paint, lime, glow) * (0.94 + 0.08 * grain);

  float diff = max(dot(n, light), 0.0);
  float3 col = albedo * (0.2 + 0.8 * diff);
  float spec = pow(max(dot(reflect(-light, n), float3(0.0, 0.0, 1.0)), 0.0), 26.0);
  col += float3(spec * 0.45);
  col += lime * glow * 0.22;
  // Darker where a stump meets the ground: ambient occlusion.
  col *= mix(1.0, mix(0.55, 1.0, smoothstep(1.0, 0.82, along)), groundShade);
  float a = aa * alpha;
  return half4(half3(col * a), half(a));
}
`;

/**
 * The ground under the floodlights, seen in perspective from a camera `camH`
 * metres up. Every pixel below the horizon is traced to the ground: the strip,
 * rolled and worn, the outfield in mowing stripes, creases painted at the
 * wicket, a pool of floodlight, and haze into the dark.
 *
 * Two ways round. Along (`across` 0): looking down the pitch from behind one
 * end, with the wicket `stumpZ` metres away. Across (`across` 1): side-on,
 * the pitch running left to right with its middle `stumpZ` metres away and a
 * wicket at each end, 20.12 m apart.
 */
export const PITCH = `
uniform float2 origin;
uniform float horizon;
uniform float focal;
uniform float camH;
uniform float stumpZ;
uniform float across;
uniform float3 light;
uniform float3 turf;
uniform float3 turfDeep;
uniform float3 pitch;
uniform float3 pitchWorn;
uniform float3 crease;
uniform float3 flood;
uniform float3 haze;
uniform float alpha;
${NOISE}
float band(float x, float at, float w, float aa) {
  return 1.0 - smoothstep(w, w + aa, abs(x - at));
}
half4 main(float2 xy) {
  float dy = xy.y - horizon;
  if (dy <= 0.0) { return half4(0.0); }
  float z = focal * camH / dy;
  float x = (xy.x - origin.x) * z / focal;
  // Along the pitch (u) and across it from its centre line (v), whichever way round it lies.
  float u = mix(z, x, across);
  float v = mix(x, z - stumpZ, across);
  float aaX = z / focal * 1.5;
  float aaZ = z * z / (focal * camH) * 1.5;
  float aaU = mix(aaZ, aaX, across);
  float aaV = mix(aaX, aaZ, across);

  float stripe = smoothstep(0.45, 0.55, abs(fract(u / 5.0) - 0.5) * 2.0);
  float3 grass = mix(turf, turfDeep, stripe * 0.8);
  grass *= 0.9 + 0.2 * noise(float2(x * 9.0, z * 3.0));

  // Where the wicket is: one, stumpZ away, or two, 10.06 m either side of the middle.
  float uu = mix(u, abs(u), across);
  float wicketU = mix(stumpZ, 10.06, across);

  float3 strip = mix(pitch, pitchWorn, noise(float2(v * 1.3, u * 0.45)) * 0.8);
  strip *= 0.86 + 0.1 * noise(float2(v * 40.0, u * 14.0)) + 0.08 * noise(float2(v * 160.0, u * 60.0));
  // The ball's landing area in front of the stumps, scuffed lighter.
  strip = mix(strip, pitchWorn, 0.5 * exp(-sq(v / 0.5) - sq((uu - wicketU + 4.0) / 2.5)));
  float onStrip = 1.0 - smoothstep(1.52, 1.52 + aaV, abs(v));
  onStrip *= 1.0 - across * smoothstep(11.0, 11.0 + aaU, abs(u));
  float3 col = mix(grass, strip, onStrip);

  // Creases at each wicket: bowling crease through the stumps, popping crease in front.
  float lines = band(uu, wicketU, 0.04, aaU * 2.0) * (1.0 - smoothstep(1.32, 1.32 + aaV, abs(v)));
  lines = max(lines, band(uu, wicketU - 1.22, 0.04, aaU * 2.0) * (1.0 - smoothstep(1.83, 1.83 + aaV, abs(v))));
  lines = max(lines, band(abs(v), 1.32, 0.03, aaV) * step(wicketU - 1.22, uu) * step(uu, wicketU + 0.2));
  col = mix(col, crease, lines * 0.9);

  // The floodlight pool over the play, a raking light across it, and haze.
  float pool = mix(exp(-sq(x / 4.5) - sq((z - stumpZ) / 9.0)),
                   exp(-sq(v / 7.0) - sq(u / 17.0)), across);
  col *= 0.35 + 0.95 * pool + 0.12 * max(dot(float3(0.0, -1.0, 0.0), light), 0.0);
  col += flood * pool * 0.05;
  // Nearer the camera, out of the pool of light.
  col *= mix(0.62, 1.0, smoothstep(stumpZ * 0.35, stumpZ, z));
  float fog = smoothstep(stumpZ * 0.8, stumpZ * 7.0, z);
  col = mix(col, haze, fog);
  float fade = smoothstep(0.0, 18.0, dy) * alpha;
  return half4(half3(col * fade), half(fade));
}
`;

/**
 * The stadium at night: dark sky, two banks of floodlights with a soft bloom
 * and a hint of rays, the stands as a dim band with points of light, haze
 * where the light meets the ground, a vignette, and fine grain against banding.
 */
export const STADIUM = `
uniform float2 size;
uniform float horizon;
uniform float3 night;
uniform float3 haze;
uniform float3 flood;
uniform float intensity;
${NOISE}
// A bank of floodlights: a small grid of lamps, a tight bloom and a wide, faint one.
float lamp(float2 uv, float2 at, float aspect) {
  float2 d = (uv - at) * float2(aspect, 1.0);
  float r = length(d);
  float2 g = d / 0.012;
  float grid = step(abs(d.x), 0.05) * step(abs(d.y), 0.018) *
               sq(1.0 - clamp(length(fract(g) - 0.5) * 2.4, 0.0, 1.0));
  float bloom = exp(-r * r / 0.004) * 0.5 + exp(-r / 0.18) * 0.12;
  float rays = sq(sq(abs(cos(atan(d.y, d.x) * 4.0)))) * exp(-r / 0.06) * 0.08;
  return grid * 1.4 + bloom + rays;
}
half4 main(float2 xy) {
  float2 uv = xy / size;
  float aspect = size.x / size.y;
  float h = horizon / size.y;
  float3 col = mix(night, haze * 0.45, smoothstep(0.0, h, uv.y) * smoothstep(0.0, h, uv.y));
  // Haze lying over the ground beyond the stands.
  col = mix(col, haze, exp(-sq((uv.y - h) / 0.05)) * 0.5);

  // The stands: a darker band under the horizon, with points of light.
  float stand = smoothstep(h - 0.11, h - 0.09, uv.y) * (1.0 - smoothstep(h - 0.005, h + 0.005, uv.y));
  col = mix(col, night * 0.8, stand * 0.7);
  float2 grid = float2(uv.x * size.x / 5.0, uv.y * size.y / 5.0);
  float2 cell = floor(grid);
  float round_ = 1.0 - smoothstep(0.12, 0.28, length(fract(grid) - 0.5));
  float dots = step(0.992, hash(cell)) * round_ * stand;
  col += flood * dots * 0.18;

  float l = lamp(uv, float2(0.14, h * 0.42), aspect) + lamp(uv, float2(0.86, h * 0.36), aspect);
  col += flood * l * intensity;

  float2 c = uv - float2(0.5, 0.45);
  col *= 1.0 - 0.6 * sq(clamp(length(c * float2(1.0, 0.8)) * 1.25, 0.0, 1.0));
  col += (hash(xy) - 0.5) * 0.012;
  return half4(half3(col), 1.0);
}
`;

/**
 * Brushed metal in a ring: a bevelled torus between `inner` and `outer`, its
 * grain running round the circle, lit so the top-left of the rim catches the
 * floodlight and the bottom-right falls away.
 */
export const BEZEL = `
uniform float2 center;
uniform float inner;
uniform float outer;
uniform float3 light;
uniform float3 metal;
uniform float3 metalDark;
${NOISE}
half4 main(float2 xy) {
  float2 p = xy - center;
  float r = length(p);
  if (r < inner - 1.0 || r > outer + 1.0) { return half4(0.0); }
  float a = (1.0 - smoothstep(outer - 1.0, outer, r)) * smoothstep(inner - 1.0, inner, r);
  float t = clamp((r - inner) / (outer - inner), 0.0, 1.0);
  // Rounded profile across the ring: tilts in at the inside edge, out at the outside.
  float s = t * 2.0 - 1.0;
  float2 dir = p / max(r, 0.001);
  float3 n = normalize(float3(dir * s * 0.9, sqrt(max(1.0 - s * s * 0.81, 0.05))));
  float ang = atan(p.y, p.x);
  float brushed = noise(float2(ang * 90.0, t * 3.0)) * 0.6 + noise(float2(ang * 400.0, r * 0.2)) * 0.4;
  float3 albedo = mix(metalDark, metal, 0.35 + 0.3 * brushed);
  float diff = max(dot(n, light), 0.0);
  float3 col = albedo * (0.22 + 0.8 * diff);
  float spec = pow(max(dot(reflect(-light, n), float3(0.0, 0.0, 1.0)), 0.0), 20.0);
  // Anisotropic streak along the brushing.
  col += float3(spec * (0.45 + 0.45 * brushed));
  // A fine polished lip on the outer edge, catching the light top left.
  float lip = exp(-sq((t - 0.9) / 0.05)) * max(dot(dir, float2(light.x, light.y)) * 1.4, 0.0);
  col += float3(lip * 0.6);
  return half4(half3(col * a), half(a));
}
`;

/**
 * The dial face, recessed under the bezel: darker towards the rim where the
 * bezel shades it, a faint lift in the middle, and a fine texture.
 */
export const DIAL = `
uniform float2 center;
uniform float radius;
uniform float3 face;
uniform float3 lift;
${NOISE}
half4 main(float2 xy) {
  float2 p = xy - center;
  float r = length(p) / radius;
  if (r > 1.0) { return half4(0.0); }
  float a = 1.0 - smoothstep(1.0 - 1.5 / radius, 1.0, r);
  float3 col = mix(lift, face, smoothstep(0.0, 0.95, r));
  // The bezel's shadow falling onto the face from the upper left.
  float2 dir = p / max(length(p), 0.001);
  float lip = smoothstep(0.78, 1.0, r) * (0.55 + 0.45 * dot(dir, float2(-0.6, -0.8)));
  col *= 1.0 - 0.75 * clamp(lip, 0.0, 1.0);
  col *= 0.96 + 0.04 * noise(p * 0.9);
  return half4(half3(col * a), half(a));
}
`;

/**
 * Bevelled, brushed metal filling a rounded badge: the edges roll off towards
 * the light and away from it, and a band of light sweeps across at `sweep`.
 */
export const PLATE = `
uniform float2 size;
uniform float corner;
uniform float bevel;
uniform float3 light;
uniform float3 metal;
uniform float3 metalDark;
uniform float3 edgeGlow;
uniform float sweep;
${NOISE}
float box(float2 p, float2 b, float r) {
  float2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
half4 main(float2 xy) {
  float2 half_ = size * 0.5;
  float2 p = xy - half_;
  float d = box(p, half_, corner);
  if (d > 0.5) { return half4(0.0); }
  float a = 1.0 - smoothstep(-0.5, 0.5, d);
  float e = 0.5;
  float2 grad = float2(box(p + float2(e, 0.0), half_, corner) - box(p - float2(e, 0.0), half_, corner),
                       box(p + float2(0.0, e), half_, corner) - box(p - float2(0.0, e), half_, corner));
  float slope = 1.0 - smoothstep(-bevel, 0.0, d);
  float3 n = normalize(float3(grad * (1.0 - slope) * 1.6, 1.0));
  float brushed = noise(float2(xy.x * 0.05, xy.y * 2.5)) * 0.6 + noise(xy * float2(0.3, 6.0)) * 0.4;
  float3 albedo = mix(metalDark, metal, 0.5 + 0.3 * brushed);
  float diff = max(dot(n, light), 0.0);
  float3 col = albedo * (0.3 + 0.8 * diff);
  col += float3(pow(max(dot(reflect(-light, n), float3(0.0, 0.0, 1.0)), 0.0), 22.0) * 0.6);
  // Lime light along the bevel's edge.
  col += edgeGlow * exp(-sq((d + 1.0) / 1.5)) * 0.9;
  // The sweep: a soft diagonal band crossing the face.
  float s = (xy.x + xy.y * 0.4) / (size.x + size.y * 0.4);
  col += float3(exp(-sq((s - sweep) / 0.12)) * 0.32);
  return half4(half3(col * a), half(a));
}
`;

export const SHADERS = { BALL, CYLINDER, PITCH, STADIUM, BEZEL, DIAL, PLATE } as const;
