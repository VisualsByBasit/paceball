const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');

function sources(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });
}

/**
 * Every piece of text the app can put on screen or hand to a screen reader:
 * string literals, template text and JSX text. Comments are code, not copy,
 * so they are not read.
 */
function copyIn(file) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const found = [];
  const visit = (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      found.push({ line: line + 1, text: node.getText(source) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test('no copy anywhere in the app uses an em dash', () => {
  const files = [...sources('app'), ...sources('src'), ...sources(path.join('modules', 'frame-extractor', 'src'))];
  assert.ok(files.length > 40, 'found the app sources');
  const offenders = files.flatMap((file) =>
    copyIn(file)
      .filter(({ text }) => text.includes('—'))
      .map(({ line, text }) => `${file}:${line}: ${text.trim().slice(0, 80)}`),
  );
  assert.deepEqual(offenders, []);
});

test('the scan finds copy and leaves comments alone', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'paceball-copy-'));
  try {
    const file = path.join(dir, 'sample.tsx');
    fs.writeFileSync(file, "// a comment — fine\nconst a = 'x — y';\nconst b = <Text>left — right</Text>;\n");
    const rel = path.relative(ROOT, file);
    const dashes = copyIn(rel).filter(({ text }) => text.includes('—'));
    assert.deepEqual(dashes.map(({ line }) => line), [2, 3]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('How it works describes the range the app actually computes', () => {
  const howItWorks = read('app/setup/how-it-works.tsx');
  // Since model version 2 the range is not timing alone.
  assert.doesNotMatch(howItWorks, /estimated timing error range/);
  assert.match(howItWorks, /combining the frame timing, the reference length and how precisely each point was marked/);
  // And the framing error it cannot see is still owned up to.
  assert.match(howItWorks, /can add error the range does not cover/);
});

test('the height reference does not ask for something no screen can do', () => {
  const step = read('src/ui/CalibrationStep.tsx');
  assert.doesNotMatch(step, /Add a height to the player profile/);
  assert.match(step, /this version cannot add one/);
});
