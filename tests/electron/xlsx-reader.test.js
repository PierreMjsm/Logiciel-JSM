const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { readWorkbook, colToIndex } = require('../../electron/xlsx-reader.js');

const FIX = path.join(__dirname, '..', 'fixtures');
const find = (re) => { if (!fs.existsSync(FIX)) return null; const f = fs.readdirSync(FIX).find((x) => re.test(x)); return f && path.join(FIX, f); };
const contact = find(/Contact/);

test('column letters to index', () => {
  assert.equal(colToIndex('A'), 0);
  assert.equal(colToIndex('Z'), 25);
  assert.equal(colToIndex('AA'), 26);
  assert.equal(colToIndex('GA'), 182);
});

test('reads cached values, strings, booleans and dates from the real Contact file', { skip: !contact }, () => {
  const wb = readWorkbook(contact);
  const g = wb.sheets['général'];
  assert.ok(g, 'sheet général exists');
  // Vérifications génériques (aucune donnée de famille dans le code).
  assert.equal(g.cell('C7'), 'Nom');
  assert.equal(typeof g.cell('C8'), 'string');
  assert.match(g.cell('F8'), /^\d{4}-\d{2}-\d{2}$/, 'date de naissance lue comme date');
  assert.equal(typeof g.cell('B8'), 'boolean');
  const rows = g.rows();
  assert.equal(rows[7][2], g.cell('C8'));
});
