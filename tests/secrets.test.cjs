const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.join(__dirname, '..');

/**
 * The files git actually tracks. Read from git rather than the filesystem, so an
 * ignored .env or a local key file cannot fail the scan for everyone, and so the
 * scan covers exactly what a push would publish.
 */
function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

const SKIP_DIRS = ['node_modules/', '.git/', 'dist/', 'android/', 'ios/', '.expo/'];
/** Binary and lockfile noise: nothing here is hand-written, and a key in it would still be caught by name. */
const SKIP_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.ico', '.ttf', '.otf', '.keystore', '.jks'];

/**
 * Each pattern is written to catch a real credential and not the placeholders,
 * variable names and documentation this repo legitimately contains.
 */
const SECRETS = [
  {
    name: 'RevenueCat secret key',
    // sk_ plus a long opaque token. Not sk_test placeholders of a few characters.
    pattern: /\bsk_[A-Za-z0-9]{24,}\b/,
  },
  {
    name: 'RevenueCat Android public key',
    // A literal goog_ key. The env var that carries it is fine; the value is not.
    pattern: /\bgoog_[A-Za-z0-9]{24,}\b/,
  },
  {
    name: 'PEM private key block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  {
    name: 'Sentry auth token',
    pattern: /\bsntrys_[A-Za-z0-9+/=._-]{20,}/,
  },
];

/** A service account is the pair, not either word alone. */
function looksLikeServiceAccount(text) {
  return /"private_key"\s*:/.test(text) && /"service_account"/.test(text);
}

function scan(text) {
  const found = [];
  for (const secret of SECRETS) {
    if (secret.pattern.test(text)) found.push(secret.name);
  }
  if (looksLikeServiceAccount(text)) found.push('Google service account JSON');
  return found;
}

test('no committed file carries a secret', () => {
  const offenders = [];
  for (const file of trackedFiles()) {
    if (SKIP_DIRS.some((dir) => file.startsWith(dir))) continue;
    if (SKIP_EXT.includes(path.extname(file).toLowerCase())) continue;
    if (file === path.posix.join('tests', 'secrets.test.cjs')) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    } catch {
      continue;
    }
    const found = scan(text);
    if (found.length > 0) offenders.push(`${file}: ${found.join(', ')}`);
  }
  assert.deepEqual(offenders, [], `secrets found in tracked files:\n${offenders.join('\n')}`);
});

test('the scan catches what it is looking for', () => {
  // Proof the patterns bite. Built at runtime so the literals never sit in the
  // file as something a scanner elsewhere would flag.
  const long = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4';
  assert.deepEqual(scan(`const key = "sk_${long}";`), ['RevenueCat secret key']);
  assert.deepEqual(scan(`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_${long}`), [
    'RevenueCat Android public key',
  ]);
  assert.deepEqual(scan(`${'-----BEGIN'} PRIVATE KEY-----\nabc\n`), ['PEM private key block']);
  assert.deepEqual(scan(`SENTRY_AUTH_TOKEN=sntrys_${long}${long}`), ['Sentry auth token']);
  assert.deepEqual(scan('{"type":"service_account","private_key":"x"}'), [
    'Google service account JSON',
  ]);

  // And that it leaves this repo's legitimate strings alone.
  assert.deepEqual(scan('process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.trim()'), []);
  assert.deepEqual(scan('EXPO_PUBLIC_SENTRY_DSN=https://KEY@HOST/PROJECT'), []);
  assert.deepEqual(scan('private_key alone, or service_account alone'), []);
  assert.deepEqual(scan("priceString: 'Rs 6,900.00'"), []);
});

test('no env file or service account file is tracked', () => {
  const tracked = trackedFiles();
  const forbidden = tracked.filter((file) => {
    const name = path.posix.basename(file);
    if (name === '.env' || name.startsWith('.env.')) return true;
    // A service account arrives as a JSON key file; these names are the usual ones.
    return /(service[-_]?account|credentials|-key|keyfile)\.json$/i.test(name);
  });
  assert.deepEqual(forbidden, [], `these must not be committed:\n${forbidden.join('\n')}`);
});

test('credential files are ignored by git, and so by the EAS upload', () => {
  // .easignore replaces .gitignore for EAS and carries every rule in it
  // (tests/website.test.cjs holds that), so git's answer covers both.
  for (const name of [
    '.env',
    '.env.production',
    'release.keystore',
    'upload.jks',
    'credentials.json',
    'google-service-account.json',
    'play-service-account-key.json',
    'server.pem',
    'cert.p12',
    'AuthKey_ABC123.p8',
    'private.key',
  ]) {
    const ignored = execFileSync('git', ['check-ignore', '--no-index', '-v', name], { cwd: ROOT, encoding: 'utf8' });
    assert.ok(ignored.trim().length > 0, `${name} is ignored`);
  }
  // And the rules do not swallow the app's own files.
  for (const name of ['app.json', 'eas.json', 'package.json', 'src/purchases/links.ts']) {
    let ignored = true;
    try {
      execFileSync('git', ['check-ignore', '--no-index', '-q', name], { cwd: ROOT });
    } catch {
      ignored = false;
    }
    assert.equal(ignored, false, `${name} is not ignored`);
  }
});
