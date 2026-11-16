import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState, mark } from './fixtures/mini-state.js';
import { nomEnfant, nomComplet } from '../../src/core/noms.js';
import { dailyLists } from '../../src/core/lists.js';
import { attestationPresence } from '../../src/core/reports.js';
import { opLabel } from '../../src/core/store.js';

const THU = '2026-11-12';

test("nomEnfant: le nom de l'enfant s'il en a un, sinon celui de la famille", () => {
  const s = miniState();
  assert.equal(nomEnfant(s, s.children.c1), 'DURAND');
  s.children.c1.nom = 'MARTIN';
  assert.equal(nomEnfant(s, s.children.c1), 'MARTIN');
  assert.equal(nomComplet(s, 'c1'), 'MARTIN LOUISE');
  assert.equal(nomEnfant(s, { prenom: 'X', familyId: 'inconnue' }), '');
});

test("listes du jour et attestation utilisent le nom de l'enfant", () => {
  const s = miniState();
  s.children.c1.nom = 'MARTIN';
  mark(s, 'c1', 'pedibus', THU, 'P');
  const marcel = dailyLists(s, THU).find((l) => l.title.endsWith('MARCEL'));
  assert.equal(marcel.rows.find((r) => r.childId === 'c1').nom, 'MARTIN');
  const a = attestationPresence(s, 'c1', '2026-11-01', '2026-11-30', '2026-12-01');
  assert.match(a.nom, /MARTIN/);
  assert.match(opLabel({ path: ['children', 'c1', 'prenom'], value: 'LOU' }, s), /MARTIN/);
});

test('libellesEnfants : homonymes distingués par l’année de naissance', async () => {
  const { libellesEnfants } = await import('../../src/core/noms.js');
  const s = miniState();
  s.families.f3 = { nom: 'DURAND', mails: '' };
  s.children.c9 = { familyId: 'f3', prenom: 'LOUISE', naissance: '2019-02-01', groupes: [], inscriptions: {} };
  const l = libellesEnfants(s);
  assert.equal(l.c1, 'DURAND LOUISE (2016)');
  assert.equal(l.c9, 'DURAND LOUISE (2019)');
  assert.equal(l.c2, 'DURAND JULES');
});

test('dossierEnfant : nom du dossier de l’enfant sur le drive', async () => {
  const { dossierEnfant } = await import('../../src/core/noms.js');
  const s = miniState();
  assert.equal(dossierEnfant(s, 'c1'), 'DURAND Louise (c1)');
  s.children.c1.prenom = 'MARIE-ÈVE';
  s.children.c1.nom = "D'ARC/X";
  assert.equal(dossierEnfant(s, 'c1'), "D'ARC-X Marie-Ève (c1)");
});
