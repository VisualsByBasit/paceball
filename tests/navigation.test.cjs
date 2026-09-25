const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

function sources(dir) {
  return fs.readdirSync(path.join(__dirname, '..', dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });
}

test('every link and settings jump handles the promise it returns', () => {
  // openURL and openSettings reject when nothing can open the target. A
  // dropped promise there is an unhandled rejection.
  for (const file of [...sources('app'), ...sources('src')]) {
    const source = read(file);
    for (const call of source.match(/Linking\.open(?:URL|Settings)\([^)]*\)[^\n;]*/g) ?? []) {
      assert.match(call, /\.catch\(/, `${file}: ${call}`);
    }
  }
});

test('the paywall is never opened underneath the share sheet', () => {
  const analysis = read('app/analysis.tsx');
  const locked = analysis.slice(analysis.indexOf('if (!canExportWithoutWatermark(entitlements)) {'));
  // The sheet closes first, then the paywall opens where it can be seen.
  assert.match(locked, /onLeave\(\);\s*router\.push\(\{ pathname: '\/paywall', params: \{ context: 'export' \} \}\);/);
  assert.match(analysis, /<CleanExport sessionId=\{session\.id\} onLeave=\{\(\) => setSharing\(false\)\} \/>/);
});

test('the debug screen redirects home outside development', () => {
  const debug = read('app/debug.tsx');
  assert.match(debug, /export default function DebugRoute\(\) \{\s*if \(!__DEV__\) return <Redirect href="\/" \/>;\s*return <DebugScreen \/>;/);
  // The only default export is the guarded one.
  assert.equal((debug.match(/export default/g) ?? []).length, 1);
});
