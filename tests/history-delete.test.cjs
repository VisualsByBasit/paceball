require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { createDeliveryDelete, DELETE_TITLE } = require('../src/ui/deleteDelivery.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

/** A saved list, a dialog the test answers by hand, and the screen's reload. */
function setup() {
  const store = new Map([['a', {}], ['b', {}], ['c', {}]]);
  let shown = [];
  const dialogs = [];
  const removed = [];
  const errors = [];
  const reload = () => {
    shown = [...store.keys()];
  };
  reload();
  const del = createDeliveryDelete({
    ask: (title, message, buttons) => dialogs.push({ title, message, buttons }),
    remove: async (id) => {
      removed.push(id);
      store.delete(id);
    },
    onDeleted: (id) => {
      shown = shown.filter((s) => s !== id);
      reload();
    },
    onError: (e) => errors.push(e),
  });
  const answer = (text) => dialogs.at(-1).buttons.find((b) => b.text === text).onPress?.();
  return { del, dialogs, removed, errors, answer, shown: () => shown, store };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('confirming deletes the delivery, and the list no longer shows it', async () => {
  const h = setup();
  assert.equal(h.del('b', false), true);
  assert.equal(h.dialogs.length, 1);
  assert.equal(h.dialogs[0].title, DELETE_TITLE);
  assert.deepEqual(h.removed, [], 'nothing is deleted before the answer');
  h.answer('Delete');
  await settle();
  assert.deepEqual(h.removed, ['b']);
  assert.equal(h.store.has('b'), false);
  assert.deepEqual(h.shown(), ['a', 'c']);
  assert.deepEqual(h.errors, []);
});

test('cancelling keeps the delivery', async () => {
  const h = setup();
  h.del('b', false);
  const cancel = h.dialogs[0].buttons.find((b) => b.text === 'Cancel');
  assert.equal(cancel.style, 'cancel');
  h.answer('Cancel');
  await settle();
  assert.deepEqual(h.removed, []);
  assert.deepEqual(h.shown(), ['a', 'b', 'c']);
});

test('nothing can be deleted while picking deliveries to compare', async () => {
  const h = setup();
  assert.equal(h.del('b', true), false);
  assert.equal(h.dialogs.length, 0);
  await settle();
  assert.deepEqual(h.shown(), ['a', 'b', 'c']);

  // And the screen does not offer it there at all.
  const history = read('app/history.tsx');
  assert.match(history, /onDelete=\{selecting \? null : \(id\) => deleteDelivery\(id, selecting\)\}/);
  assert.match(history, /onLongPress=\{onDelete \? \(\) => onDelete\(session\.id\) : undefined\}/);
});

test('a failed delete is reported and leaves the list alone', async () => {
  const errors = [];
  let shown = ['a', 'b'];
  let ask;
  const del = createDeliveryDelete({
    ask: (_t, _m, buttons) => (ask = buttons),
    remove: async () => {
      throw new Error('disk');
    },
    onDeleted: (id) => (shown = shown.filter((s) => s !== id)),
    onError: (e) => errors.push(e.message),
  });
  del('a', false);
  ask.find((b) => b.text === 'Delete').onPress();
  await settle();
  assert.deepEqual(errors, ['disk']);
  assert.deepEqual(shown, ['a', 'b']);
});

test('History wires the existing data layer delete and reloads after it', () => {
  const history = read('app/history.tsx');
  assert.match(history, /remove: deleteSession,/);
  assert.match(history, /sessions: current\.sessions\.filter\(\(s\) => s\.id !== id\)/);
  assert.match(history, /setReload\(\(n\) => n \+ 1\);/);
  assert.match(history, /ask: \(title, message, buttons\) => Alert\.alert\(title, message, buttons\)/);
  // No em dashes in the new copy.
  assert.doesNotMatch(read('src/ui/deleteDelivery.ts'), /—/);
  assert.doesNotMatch(history.slice(history.indexOf('Press and hold a delivery')).split('\n')[0], /—/);
});
