import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState } from './fixtures/mini-state.js';
import { newYear } from '../../src/core/newyear.js';

const grp = (n, id) => n.children[id].groupes[0].groupe;

test('nouvelle année : 6e → Collégiens, 3 ans → 4-5 ans, les autres gardent leur groupe', () => {
  const s = miniState();
  s.children.c2.groupes = [{ from: null, groupe: '6-8 ans' }];   // né en 2018 : reste à la main
  s.children.c3.groupes = [{ from: null, groupe: '8-10 ans' }];  // groupe choisi à la main : gardé
  const n = newYear(s, '2027-2028', s.params, '2027-09-01');
  assert.equal(grp(n, 'c1'), 'Collégiens', 'née en 2016 : entre en 6e en 2027');
  assert.equal(grp(n, 'c5'), '4-5 ans', '3 ans (y compris s’il était passé en 4-5 ans l’été)');
  assert.equal(grp(n, 'c2'), '6-8 ans');
  assert.equal(grp(n, 'c3'), '8-10 ans');
});

test('nouvelle année : un ancien 3 ans encore « 3 ans » passe en 4-5 ans ; Collégiens et Plus présent restent', () => {
  const s = miniState();
  s.children.c5.groupes = [{ from: null, groupe: '3 ans' }];
  s.children.c2.groupes = [{ from: null, groupe: 'Collégiens' }];
  s.children.c3.groupes = [{ from: null, groupe: 'Plus présent' }];
  const n = newYear(s, '2027-2028', s.params, '2027-09-01');
  assert.equal(grp(n, 'c5'), '4-5 ans');
  assert.equal(grp(n, 'c2'), 'Collégiens');
  assert.equal(grp(n, 'c3'), 'Plus présent');
});

test('nouvelle année : on garde la trace de l’année précédente', () => {
  const s = miniState();
  const n = newYear(s, '2027-2028', s.params, '2027-09-01', { dossierPrecedent: 'JSM' });
  assert.deepEqual(n.anneePrecedente, { label: s.year, dossier: 'JSM' });
});

test('nouvelle année : renseignements de la fiche gardés, cases et signature remis à zéro', () => {
  const s = miniState();
  s.children.c1.fiche = { secu: '1 99', urgence: 'Tante', signataire: 'Marie Durand', signature: 'Marie Durand', dateSignature: '2026-11-12', coches: { soins: true } };
  const n = newYear(s, '2027-2028', s.params, '2027-09-01');
  assert.deepEqual(n.children.c1.fiche, { secu: '1 99', urgence: 'Tante' });
  assert.equal(n.preinscriptions, undefined);
});

test('nouvelle année : le suivi des fiches PDF imprimées repart de zéro', () => {
  const s = miniState();
  s.children.c1.fichesPdf = { m1: { creee: '2026-11-10', imprimee: '2026-11-11' } };
  const n = newYear(s, '2027-2028', s.params, '2027-09-01');
  assert.equal(n.children.c1.fichesPdf, undefined);
});
