import { test } from 'node:test';
import assert from 'node:assert/strict';
import { euro, dateFr, dayName } from '../../src/core/format.js';

test('euro formats French currency', () => {
  assert.equal(euro(5.5), '5,50 €');
  assert.equal(euro(1234.5), '1 234,50 €');
});
test('dateFr and dayName', () => {
  assert.equal(dateFr('2026-11-13'), '13/11/2026');
  assert.equal(dayName('2026-11-13'), 'vendredi');
});
