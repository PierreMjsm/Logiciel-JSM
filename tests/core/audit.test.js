import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState, mark } from './fixtures/mini-state.js';
import { familyAccount } from '../../src/core/billing.js';
import { reglementsDeLEnfant } from '../../src/core/depart.js';

test('changement de famille : les règlements de l’enfant suivent, les règlements mixtes sont signalés', () => {
  const s = miniState();
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  s.payments = {
    p1: { familyId: 'f1', childId: 'c3', montant: 7, mode: 'especes', affectations: [{ poste: 'mercredi-T1', montant: 7, childId: 'c3' }] },
    p2: { familyId: 'f1', childId: '', montant: 12, mode: 'cheque', affectations: [{ poste: 'mercredi-T1', montant: 7, childId: 'c3' }, { poste: 'adhesion', montant: 5, childId: 'c1' }] },
    p3: { familyId: 'f1', childId: 'c1', montant: 5, mode: 'cheque', affectations: [{ poste: 'adhesion', montant: 5, childId: 'c1' }] },
  };
  const r = reglementsDeLEnfant(s, 'c3', 'f1');
  assert.deepEqual(r.deplacables, ['p1']);
  assert.deepEqual(r.mixtes, ['p2']);
  // Une fois l'enfant et son règlement déplacés, la nouvelle famille est à jour pour ce poste.
  s.children.c3.familyId = 'f2';
  s.payments.p1.familyId = 'f2';
  const reste = familyAccount(s, 'f2', '2026-11-15').postes.find((x) => x.childId === 'c3' && x.poste === 'mercredi-T1').reste;
  assert.equal(reste, 0);
});

test('encadrement : moins / plus de 6 ans par créneau et animateurs minimum (vacances 1/8 et 1/12)', async () => {
  const { encadrement } = await import('../../src/core/lists.js');
  const s = miniState();
  // c5 a 3 ans ; c1, c2, c3 ont 6 ans ou plus.
  for (const id of ['c1', 'c2', 'c3', 'c5']) mark(s, id, 'toussaint', '2026-10-20', 'P');
  const [v] = encadrement(s, '2026-10-20');
  assert.equal(v.label, 'Vacances Toussaint');
  assert.deepEqual([v.moins6, v.plus6], [1, 3]);
  assert.equal(v.animateurs, 2, '1 pour le moins de 6 ans + 1 pour les 3 plus grands');
  assert.deepEqual(v.taux, [8, 12]);
});

test('encadrement : mercredi matin et après-midi comptés séparément, taux réglables', async () => {
  const { encadrement } = await import('../../src/core/lists.js');
  const s = miniState();
  s.params.encadrement = { mercredi: [10, 14] };
  for (let i = 0; i < 15; i++) { s.children[`k${i}`] = { familyId: 'f1', prenom: `K${i}`, naissance: '2018-01-01', groupes: [{ from: null, groupe: '6-8 ans' }], inscriptions: {} }; mark(s, `k${i}`, 'mercredi', '2026-11-18', 'P', 'matin'); }
  const r = encadrement(s, '2026-11-18');
  assert.deepEqual(r.map((x) => [x.label, x.plus6, x.animateurs]), [['Mercredi matin', 15, 2]]);
  assert.deepEqual(r[0].taux, [10, 14]);
});
