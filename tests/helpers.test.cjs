require('./register.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { finiteNumber, first, positiveNumber } = require('../src/ui/routeParams.ts');
const { errorMessage } = require('../src/ui/format.ts');

test('route params read one value, and a missing number is missing, not zero', () => {
  assert.equal(first(undefined), '');
  assert.equal(first(['a', 'b']), 'a');
  assert.equal(first([]), '');
  assert.equal(finiteNumber('59.94'), 59.94);
  assert.equal(finiteNumber('-4'), -4);
  assert.equal(finiteNumber(''), null, 'an absent exposure is not an exposure of 0');
  assert.equal(finiteNumber('  '), null);
  assert.equal(finiteNumber('abc'), null);
  assert.equal(finiteNumber(['12', 'x']), 12);
  // fps and frame counts have no default worth falling back on.
  assert.equal(positiveNumber('0'), null);
  assert.equal(positiveNumber('-1'), null);
  assert.equal(positiveNumber(undefined), null);
  assert.equal(positiveNumber('180'), 180);
});

test('an error message is the error own text, or whatever was thrown', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom');
  assert.equal(errorMessage('plain'), 'plain');
  assert.equal(errorMessage(42), '42');
});
