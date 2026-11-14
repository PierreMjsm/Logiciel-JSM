import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState, mark } from './fixtures/mini-state.js';
import { dailyLists, pdfFileName } from '../../src/core/lists.js';

const THU = '2026-11-12';

test('pedibus: one page per school with P/KT children, A excluded, sorted by age', () => {
  const s = miniState();
  mark(s, 'c1', 'pedibus', THU, 'P');   // MARCEL, 2016
  mark(s, 'c3', 'pedibus', THU, 'P');   // MARCEL, 2020 PAI
  mark(s, 'c2', 'pedibus', THU, 'A');   // ROSALIE, absent
  const lists = dailyLists(s, THU);
  const titles = lists.map((l) => l.title);
  assert.ok(titles.includes('LISTE PRÉSENCE PÉDIBUS — MARCEL'));
  assert.ok(!titles.some((t) => t.includes('ROSALIE')), 'empty school omitted');
  const marcel = lists.find((l) => l.title.endsWith('MARCEL'));
  assert.deepEqual(marcel.columns, ['#', 'Nom', 'Prénom', 'Âge', 'Présent ?']);
  assert.deepEqual(marcel.rows.map((r) => r.prenom), ['NOAH *', 'LOUISE']);
  assert.equal(marcel.rows[0].n, 1);
  assert.equal(marcel.rows[0].nom, 'DURAND');
  assert.equal(marcel.rows[0].age, '6 ans');
});

test('KT child appears on its school list with ⛪ and on the KT JEUDI page', () => {
  const s = miniState();
  mark(s, 'c2', 'pedibus', THU, 'KT');
  const lists = dailyLists(s, THU);
  const ros = lists.find((l) => l.title === 'LISTE PRÉSENCE PÉDIBUS — ROSALIE');
  assert.equal(ros.rows[0].kt, true);
  const kt = lists.find((l) => l.title === 'KT JEUDI');
  assert.ok(kt);
  assert.ok(kt.columns.includes('École'));
  assert.equal(kt.rows[0].ecole, 'ROSALIE');
});

test('vacances: one page per groupe with Sortie column; groupe follows dated change', () => {
  const s = miniState();
  mark(s, 'c5', 'juillet', '2027-07-05', 'P');
  mark(s, 'c3', 'juillet', '2027-07-05', 'P');
  const lists = dailyLists(s, '2027-07-05');
  const l = lists.find((x) => x.title === 'Liste de présence : Juillet — 4-5 ans');
  assert.ok(l, 'ZOE counted as 4-5 ans in July');
  assert.deepEqual(l.columns, ['#', 'Nom', 'Prénom', 'Âge', 'Présent ?', 'Sortie ?']);
  assert.ok(lists.find((x) => x.title === 'Liste de présence : Juillet — 6-8 ans'));
  const s2 = miniState();
  mark(s2, 'c5', 'toussaint', '2026-10-19', 'P');
  assert.ok(dailyLists(s2, '2026-10-19').find((x) => x.title === 'Liste de présence : Toussaint — 3 ans'));
});

test('mercredi: matin / après-midi / journée per groupe and pédibus mercredi per school', () => {
  const s = miniState();
  const WED = '2026-11-04';
  mark(s, 'c3', 'mercredi', WED, 'P', 'matin');
  mark(s, 'c3', 'mercredi', WED, 'P', 'aprem');
  mark(s, 'c1', 'mercredi', WED, 'P', 'aprem');
  mark(s, 'c5', 'mercredi', WED, 'P', 'matin');
  s.children.c5.inscriptions.pediMercredi = true; // pédibus mercredi = inscrits présents le matin
  const titles = dailyLists(s, WED).map((l) => l.title);
  assert.ok(titles.includes('Mercredi matin — 6-8 ans'));
  assert.ok(titles.includes('Mercredi après-midi — 8-10 ans'));
  assert.ok(titles.includes('Mercredi journée — 6-8 ans'));
  assert.ok(!titles.includes('Mercredi journée — 8-10 ans'));
  assert.ok(titles.includes('PÉDIBUS MERCREDI — BUFFON'));
  assert.ok(!titles.includes('PÉDIBUS MERCREDI — MARCEL'), 'non-inscrits absents de la liste pédibus mercredi');
});

test('pdf file names', () => {
  assert.equal(pdfFileName('2026-11-13', 'Pédibus'), 'Pédibus 13-11-2026.pdf');
});

test('collégiens notés C apparaissent sur la liste Pédibus de leur école', () => {
  const s = miniState();
  mark(s, 'c1', 'pedibus', THU, 'C');
  const marcel = dailyLists(s, THU).find((l) => l.title.endsWith('MARCEL'));
  assert.equal(marcel.rows[0].prenom, 'LOUISE');
});
