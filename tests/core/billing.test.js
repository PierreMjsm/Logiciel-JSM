import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState, mark } from './fixtures/mini-state.js';
import { activityDates } from '../../src/core/calendar.js';
import {
  childPostes, fratrieDiscounts, familyAccount, familyStatus, enBanqueAt, encaissementPlan, adhesionStatus, dossierComplet, documentsManquants,
} from '../../src/core/billing.js';

const poste = (s, cid, id) => childPostes(s, cid).find((p) => p.poste === id);

test('pedibus T1: P/A days at 5.50 plus KT days at 5', () => {
  const s = miniState();
  const d = activityDates(s.params, 'pedibus', {});
  for (let i = 0; i < 9; i++) mark(s, 'c1', 'pedibus', d[i], 'P');
  mark(s, 'c1', 'pedibus', d[9], 'A');
  mark(s, 'c1', 'pedibus', '2026-11-12', 'KT');
  mark(s, 'c1', 'pedibus', '2026-11-19', 'KT');
  const p = poste(s, 'c1', 'pedibus-T1');
  assert.equal(p.jours, 10);
  assert.equal(p.ktJours, 2);
  assert.equal(p.du, 10 * 5.5 + 2 * 5);
  assert.equal(p.label, 'Pédibus T1');
});

test('three siblings on the same wednesday morning: youngest pays half', () => {
  const s = miniState();
  for (const c of ['c1', 'c2', 'c3']) mark(s, c, 'mercredi', '2026-09-02', 'P', 'matin');
  assert.equal(poste(s, 'c3', 'mercredi-T1').du, 3.5);
  assert.equal(poste(s, 'c1', 'mercredi-T1').du, 7);
  assert.equal(familyAccount(s, 'f1', '2026-11-13').du, 17.5 + 5);
});

test('an absent sibling still counts for the discount', () => {
  const s = miniState();
  mark(s, 'c1', 'mercredi', '2026-09-02', 'P', 'matin');
  mark(s, 'c2', 'mercredi', '2026-09-02', 'P', 'matin');
  mark(s, 'c3', 'mercredi', '2026-09-02', 'A', 'matin');
  assert.equal(familyAccount(s, 'f1', '2026-11-13').du, 17.5 + 5);
});

test('two siblings: no discount; different slots do not combine', () => {
  const s = miniState();
  mark(s, 'c1', 'mercredi', '2026-09-02', 'P', 'matin');
  mark(s, 'c2', 'mercredi', '2026-09-02', 'P', 'matin');
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'aprem');
  assert.equal(fratrieDiscounts(s, 'f1').size, 0);
  assert.equal(familyAccount(s, 'f1', '2026-11-13').du, 21 + 5);
});

test('four siblings on a vacation day: two pay half', () => {
  const s = miniState({ quatre: true });
  for (const c of ['c1', 'c2', 'c3', 'c4']) mark(s, c, 'toussaint', '2026-10-19', 'P');
  const disc = fratrieDiscounts(s, 'f1');
  assert.equal(disc.size, 2);
  assert.ok(disc.has('c4|toussaint|2026-10-19|') && disc.has('c3|toussaint|2026-10-19|'));
  assert.equal(poste(s, 'c4', 'toussaint').du, 7);
  assert.equal(poste(s, 'c1', 'toussaint').du, 14);
});

test('fratrie never applies to pedibus', () => {
  const s = miniState();
  for (const c of ['c1', 'c2', 'c3']) mark(s, c, 'pedibus', '2026-09-01', 'P');
  assert.equal(poste(s, 'c3', 'pedibus-T1').du, 5.5);
});

test('adhesion 5 when adherent; postes without du are omitted', () => {
  const s = miniState();
  assert.deepEqual(childPostes(s, 'c1').map((p) => [p.poste, p.du]), [['adhesion', 5]]);
  assert.deepEqual(childPostes(s, 'c2'), []);
});

test('orphan affectation counts as trop-perçu', () => {
  const s = miniState();
  s.children.c1.adhesionDejaReglee = true;
  s.payments.p1 = { familyId: 'f1', childId: 'c2', date: '2026-11-01', montant: 20, mode: 'cheque',
    affectations: [{ poste: 'noel', montant: 20 }], moisEncaissement: '2026-11', remis: false };
  const a = familyAccount(s, 'f1', '2026-11-13');
  assert.equal(a.regle, 20);
  assert.equal(a.solde, 20);
  assert.equal(familyStatus(a.solde), 'Trop-perçu');
  const row = a.postes.find((r) => r.poste === 'noel');
  assert.equal(row.du, 0);
  assert.equal(row.regle, 20);
});

test('regle per poste and reste', () => {
  const s = miniState();
  for (const d of ['2026-09-02', '2026-09-09']) mark(s, 'c2', 'mercredi', d, 'P', 'matin');
  s.payments.p1 = { familyId: 'f1', childId: 'c2', date: '2026-09-20', montant: 10, mode: 'especes',
    affectations: [{ poste: 'mercredi-T1', montant: 10 }] };
  const a = familyAccount(s, 'f1', '2026-11-13');
  const row = a.postes.find((r) => r.childId === 'c2' && r.poste === 'mercredi-T1');
  assert.equal(row.du, 14);
  assert.equal(row.regle, 10);
  assert.equal(row.reste, 4);
  assert.equal(familyStatus(a.solde), 'Impayé');
  assert.equal(familyStatus(0.001), 'À jour');
});

test('cheque en banque from its encaissement month; cash on its date', () => {
  const ch = { mode: 'cheque', date: '2026-10-01', moisEncaissement: '2026-12', remis: false, montant: 30 };
  assert.equal(enBanqueAt(ch, '2026-11-30'), false);
  assert.equal(enBanqueAt(ch, '2026-12-01'), true);
  assert.equal(enBanqueAt({ ...ch, remis: true }, '2026-10-02'), true);
  assert.equal(enBanqueAt({ mode: 'especes', date: '2026-10-05', montant: 7 }, '2026-10-04'), false);
});

test('encaissement plan groups cheques by month per family', () => {
  const s = miniState();
  s.payments.p1 = { familyId: 'f1', mode: 'cheque', date: '2026-10-01', moisEncaissement: '2026-10', montant: 30, affectations: [] };
  s.payments.p2 = { familyId: 'f1', mode: 'cheque', date: '2026-10-01', moisEncaissement: '2026-12', montant: 20, affectations: [] };
  s.payments.p3 = { familyId: 'f2', mode: 'especes', date: '2026-11-05', montant: 7, affectations: [] };
  const plan = encaissementPlan(s);
  assert.deepEqual(plan.months, ['2026-10', '2026-11', '2026-12']);
  const f1 = plan.rows.find((r) => r.familyId === 'f1');
  assert.deepEqual(f1.byMonth, { '2026-10': 30, '2026-12': 20 });
  assert.equal(f1.total, 50);
  assert.equal(plan.totals['2026-11'], 7);
});

test('changing a value in place (P → KT) is reflected after applyOps', async () => {
  const { applyOps, makeOp } = await import('../../src/core/store.js');
  let s = miniState();
  mark(s, 'c2', 'pedibus', '2026-09-01', 'P');
  assert.equal(poste(s, 'c2', 'pedibus-T1').du, 5.5);
  s = applyOps(s, [makeOp({ by: 'P', dev: 'A', seq: 1, path: ['presences', 'c2|pedibus|2026-09-01|'], value: 'KT' })], s);
  assert.equal(poste(s, 'c2', 'pedibus-T1').du, 5);
});

test('a wednesday during holidays is not billed as a school mercredi (Excel ignores it too)', () => {
  const s = miniState();
  mark(s, 'c2', 'mercredi', '2027-02-10', 'P', 'matin'); // vacances d'hiver
  mark(s, 'c2', 'mercredi', '2027-01-06', 'P', 'matin');
  assert.equal(poste(s, 'c2', 'mercredi-T2').jours, 1);
});

test('C = collégien au Pédibus, facturé au tarif collégien (1,50 €)', () => {
  const s = miniState();
  mark(s, 'c1', 'pedibus', '2026-09-01', 'C');
  mark(s, 'c1', 'pedibus', '2026-09-03', 'C');
  const p = poste(s, 'c1', 'pedibus-T1');
  assert.equal(p.cJours, 2);
  assert.equal(p.du, 3);
});

test('adhésion obligatoire: dûe par tout enfant actif, sauf si déjà réglée avant le logiciel', () => {
  const s = miniState();
  assert.equal(poste(s, 'c1', 'adhesion').du, 5);
  assert.equal(poste(s, 'c2', 'adhesion'), undefined);
  s.children.c1.inscriptions = {};
  assert.equal(poste(s, 'c1', 'adhesion'), undefined, 'enfant sans activité : pas d\'adhésion due');
  mark(s, 'c1', 'toussaint', '2026-10-19', 'P');
  assert.equal(poste(s, 'c1', 'adhesion').du, 5, 'une présence rend l\'enfant actif');
});

test('adhesionStatus: réglée par un règlement affecté, déjà réglée, ou due', () => {
  const s = miniState();
  assert.equal(adhesionStatus(s, 'c2'), 'reglee');
  assert.equal(adhesionStatus(s, 'c1'), 'due');
  s.payments.p1 = { familyId: 'f1', date: '2026-09-02', montant: 25, mode: 'cheque', moisEncaissement: '2026-10',
    affectations: [{ poste: 'adhesion', montant: 5, childId: 'c1' }, { poste: 'pedibus-T1', montant: 20, childId: 'c1' }] };
  assert.equal(adhesionStatus(s, 'c1'), 'reglee');
  s.children.c1.inscriptions = {};
  delete s.payments.p1;
  assert.equal(adhesionStatus(s, 'c1'), 'inactif');
});

test('dossier complet: tous les documents demandés sont cochés', () => {
  const s = miniState();
  assert.equal(dossierComplet(s, 'c1'), true);
  assert.deepEqual(documentsManquants(s, 'c2'), ['Vaccins']);
  assert.equal(dossierComplet(s, 'c3'), false);
});
