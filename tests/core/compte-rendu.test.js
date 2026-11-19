import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState, mark } from './fixtures/mini-state.js';
import { compteRendu } from '../../src/core/reports.js';

test("compte rendu de l'année : effectifs, activités, heures CAF et compta", () => {
  const s = miniState();
  s.children.c1.adhesionDejaReglee = true;
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  mark(s, 'c5', 'toussaint', '2026-10-19', 'P');
  s.payments.p1 = { familyId: 'f1', childId: 'c3', date: '2026-09-10', montant: 7, mode: 'cheque', moisEncaissement: '2026-09', affectations: [{ poste: 'mercredi-T1', montant: 7, childId: 'c3' }] };
  const cr = compteRendu(s, '2027-09-01');
  assert.equal(cr.annee, '2026-2027');
  assert.equal(cr.effectifs.familles, 2);
  assert.ok(cr.effectifs.parGroupe.some(([g, n]) => g === '6-8 ans' && n >= 1));
  const ordre = cr.effectifs.parGroupe.map(([g]) => s.params.groupes.indexOf(g));
  assert.deepEqual(ordre, [...ordre].sort((a, b) => a - b), 'groupes dans l’ordre des Paramètres');
  const mer = cr.activites.find((a) => a.label === 'Mercredis');
  assert.deepEqual([mer.jours, mer.du, mer.regle], [1, 7, 7]);
  assert.equal(cr.caf.at(-1).total.presences, 2);
  assert.equal(cr.compta.regle, 7);
  assert.deepEqual(cr.compta.impayes.map((x) => [x.famille, x.montant]), [['MOREAU', 14 + 5]]);
  assert.deepEqual(cr.compta.parMode, [['Chèque', 7]]);
});
