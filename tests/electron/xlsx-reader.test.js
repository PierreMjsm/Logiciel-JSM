const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { readWorkbook, colToIndex } = require('../../electron/xlsx-reader.js');

const FIX = path.join(__dirname, '..', 'fixtures');
const find = (re) => { const f = fs.readdirSync(FIX).find((x) => re.test(x)); return f && path.join(FIX, f); };
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
  assert.equal(g.cell('C8'), 'AGACHE');
  assert.equal(g.cell('D8'), 'LIYA');
  assert.equal(g.cell('F8'), '2017-09-21');
  assert.equal(g.cell('B8'), false);
  assert.equal(g.cell('C7'), 'Nom');
  const rows = g.rows();
  assert.equal(rows[7][2], 'AGACHE');
});
