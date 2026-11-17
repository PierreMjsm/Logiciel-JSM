import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState, mark } from './fixtures/mini-state.js';
import { posteCommence, familyAccount } from '../../src/core/billing.js';
import { recapText } from '../../src/core/reports.js';

test('posteCommence : un poste compte « maintenant » dès que sa période a commencé', () => {
  const p = miniState().params;
  assert.equal(posteCommence(p, 'pedibus-T1', '2026-11-15'), true);
  assert.equal(posteCommence(p, 'pedibus-T2', '2026-11-15'), false);
  assert.equal(posteCommence(p, 'mercredi-T2', '2027-01-04'), true);
  assert.equal(posteCommence(p, 'toussaint', '2026-11-15'), true);
  assert.equal(posteCommence(p, 'noel', '2026-11-15'), false);
  assert.equal(posteCommence(p, 'adhesion', '2026-09-01'), true);
  assert.equal(posteCommence(p, 'exceptionnel', '2026-09-01'), true);
});

function annee() {
  const s = miniState();
  s.children.c1.adhesionDejaReglee = true;
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');   // T1 : 7 €
  mark(s, 'c3', 'mercredi', '2027-01-06', 'P', 'matin');   // T2 : 7 € (prévu)
  return s;
}

test('familyAccount : dû maintenant et prévu sur l’année', () => {
  const a = familyAccount(annee(), 'f1', '2026-11-15');
  assert.equal(a.du, 14);
  assert.equal(a.duMaintenant, 7);
  assert.equal(a.soldeMaintenant, -7);
  assert.equal(a.postes.find((r) => r.poste === 'mercredi-T2').commence, false);
});

test('récap : ne demande que ce qui a commencé, et pas les trimestres à venir', () => {
  const t = recapText(annee(), 'f1', '2026-11-15').replace(/[\u00a0\u202f]/g, ' ');
  assert.match(t, /Mercredis T1/);
  assert.doesNotMatch(t, /Mercredis T2/);
  assert.match(t, /RESTE À PAYER : ► 7,00 €/);
});
