const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.join(__dirname, '..');
const WEBSITE = path.join(ROOT, 'website');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

/** Every file under dir, skipping installed and built output. */
function files(dir, skip = new Set(['node_modules', '.next', 'out'])) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (skip.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full, skip) : [full];
  });
}

const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');

/**
 * The public privacy policy must describe what the app actually does. If a new
 * service or permission appears in the app, this is where the site catches up.
 */
test('the website privacy policy names every party and permission the app uses', () => {
  const privacy = read('website', 'app', 'privacy', 'page.tsx');
  for (const name of ['Google Play', 'RevenueCat', 'Sentry', 'Microphone', 'Camera']) {
    assert.match(privacy, new RegExp(name), `privacy policy names ${name}`);
  }
  assert.match(privacy, /never uploads your\s+recordings or your measurements/);
  assert.match(privacy, /Android&apos;s own backup/);
  assert.match(privacy, /off by\s+default/);
  assert.match(privacy, /recording still works/);
  assert.match(privacy, /Last updated|POLICY_UPDATED/);
});

test('the website makes the same narrow promise as the app, never a wider one', () => {
  for (const file of files(path.join(WEBSITE, 'app'))) {
    if (!/\.tsx?$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /nothing (ever )?leaves|never leaves? (the|your) (phone|device)/i, rel(file));
    assert.doesNotMatch(source, /offline measurement|no uploads/i, rel(file));
    assert.doesNotMatch(source, /spin rate is|rpm:|\d+\s*rpm/i, rel(file));
    assert.doesNotMatch(source, /120\s*fps/i, rel(file));
  }
});

const EM_DASH = /\u2014|&mdash;|\\u2014|&#8212;/;

test('no em dashes anywhere in the website', () => {
  const ignored = new Set(['package-lock.json']);
  for (const file of files(WEBSITE)) {
    if (ignored.has(path.basename(file)) || /\.(ico|png|jpe?g|woff2?)$/.test(file)) continue;
    // AGENTS.md and CLAUDE.md are written by next dev and gitignored, not ours.
    if (/^website\/(AGENTS|CLAUDE)\.md$/.test(rel(file))) continue;
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, EM_DASH, `${rel(file)} contains an em dash`);
  }
});

const IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
const specifiers = (source) => [...source.matchAll(IMPORT)].map((match) => match[1]);

test('the app never imports from website/', () => {
  const appFiles = ['app', 'src', 'modules']
    .flatMap((dir) => files(path.join(ROOT, dir), new Set(['node_modules', 'build', 'android', 'ios'])))
    .concat(['index.js', 'metro.config.js'].map((file) => path.join(ROOT, file)))
    .filter((file) => /\.(c?js|jsx|ts|tsx)$/.test(file));
  assert.ok(appFiles.length > 20, 'found the app sources');
  for (const file of appFiles) {
    for (const spec of specifiers(fs.readFileSync(file, 'utf8'))) {
      assert.doesNotMatch(spec, /(^|\/)website(\/|$)/, `${rel(file)} imports ${spec}`);
    }
  }
});

test('the website never imports from the app', () => {
  for (const file of files(WEBSITE).filter((f) => /\.(m?js|tsx?)$/.test(f))) {
    for (const spec of specifiers(fs.readFileSync(file, 'utf8'))) {
      if (!spec.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), spec);
      assert.ok(
        target === WEBSITE || target.startsWith(WEBSITE + path.sep),
        `${rel(file)} reaches outside website/ with ${spec}`,
      );
    }
  }
});

test('the website accent is the app accent', () => {
  const accent = read('src', 'ui', 'tokens.ts').match(/accent:\s*'(#[0-9A-Fa-f]{6})'/)[1];
  const css = read('website', 'app', 'globals.css').match(/--color-accent:\s*(#[0-9A-Fa-f]{6})/)[1];
  assert.equal(css.toUpperCase(), accent.toUpperCase());
});

test('website/ is kept out of the app build, typecheck, tests and EAS upload', () => {
  // Metro: a second React in website/node_modules must never be crawled.
  const { resolver } = require('../metro.config.js');
  const blocked = (file) => resolver.blockList.some((pattern) => pattern.test(file));
  assert.ok(blocked(path.join(WEBSITE, 'node_modules', 'react', 'index.js')));
  assert.ok(blocked(path.join(WEBSITE, 'app', 'page.tsx')));
  assert.ok(!blocked(path.join(ROOT, 'app', 'index.tsx')));
  assert.ok(!blocked(path.join(ROOT, 'websites', 'x.ts')), 'only website/ itself');

  // tsc: the root typecheck skips it, and still skips what the Expo base skipped.
  const tsconfig = JSON.parse(read('tsconfig.json'));
  for (const dir of ['website', 'node_modules', 'android', 'ios']) {
    assert.ok(tsconfig.exclude.includes(dir), `tsconfig excludes ${dir}`);
  }

  // npm test: only top-level tests/*.test.cjs.
  assert.equal(JSON.parse(read('package.json')).scripts.test, 'node --test tests/*.test.cjs');

  // EAS: .easignore replaces .gitignore, so it must carry every .gitignore rule too.
  const lines = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const easignore = lines(read('.easignore'));
  for (const rule of lines(read('.gitignore'))) {
    assert.ok(easignore.includes(rule), `.easignore carries .gitignore rule ${rule}`);
  }
  assert.ok(easignore.some((rule) => /^\/?website\/?$/.test(rule)), '.easignore excludes website/');
});
