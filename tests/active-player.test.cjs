const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

/**
 * With more than one profile, the first player on file is not the one bowling.
 * Every screen that attributes, shows or scales by a player has to ask for the
 * active one — reading the list's head saved deliveries against the wrong player.
 */
test('no screen picks a player by taking the first one on file', () => {
  const appDir = path.join(__dirname, '..', 'app');
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx')) files.push(full);
    }
  };
  walk(appDir);

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const name = path.relative(appDir, file);
    assert.doesNotMatch(source, /\blistPlayers\b/, `${name} reads the player list instead of the active player`);
  }

  for (const name of ['result.tsx', 'history.tsx', 'index.tsx', 'mark.tsx']) {
    assert.match(fs.readFileSync(path.join(appDir, name), 'utf8'), /\bgetActivePlayer\(\)/, name);
  }
});
