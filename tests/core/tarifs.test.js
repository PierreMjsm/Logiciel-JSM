import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState, mark } from './fixtures/mini-state.js';
import { tarifAt } from '../../src/core/calendar.js';
import { childPostes } from '../../src/core/billing.js';
import { reglesFonctionnement } from '../../src/core/regles.js';

test('tarifAt : tarif de base, puis changement à une date', () => {
  const p = miniState().params;
  p.tarifsChangements = [{ from: '2027-01-04', cle: 'pedibus', montant: 6 }, { from: '2027-04-19', cle: 'pedibus', montant: 6.5 }];
  assert.equal(tarifAt(p, 'pedibus', '2026-12-17'), 5.5);
  assert.equal(tarifAt(p, 'pedibus', '2027-01-04'), 6);
  assert.equal(tarifAt(p, 'pedibus', '2027-05-03'), 6.5);
  assert.equal(tarifAt(p, 'mercredi', '2027-05-05'), 7, 'autres tarifs inchangés');
});

test('montant dû : chaque jour à son tarif (5,50 € puis 6 €)', () => {
  const s = miniState();
  s.params.tarifsChangements = [{ from: '2027-01-04', cle: 'pedibus', montant: 6 }];
  mark(s, 'c1', 'pedibus', '2026-12-17', 'P');
  mark(s, 'c1', 'pedibus', '2027-01-07', 'P');
  mark(s, 'c1', 'pedibus', '2027-01-08', 'A');
  const p = childPostes(s, 'c1');
  assert.equal(p.find((x) => x.poste === 'pedibus-T1').du, 5.5);
  assert.equal(p.find((x) => x.poste === 'pedibus-T2').du, 12);
});

test('règles de fonctionnement : les changements de tarif sont expliqués', () => {
  const p = miniState().params;
  p.tarifsChangements = [{ from: '2027-01-04', cle: 'pedibus', montant: 6 }];
  const txt = JSON.stringify(reglesFonctionnement(p));
  assert.match(txt, /à partir du 04\/01\/2027/);
});

test('nouvelle année : les derniers tarifs deviennent les tarifs de base, les changements repartent à zéro', async () => {
  const { tarifsFinAnnee } = await import('../../src/core/calendar.js');
  const p = miniState().params;
  p.tarifsChangements = [{ from: '2027-04-19', cle: 'pedibus', montant: 6.5 }, { from: '2027-01-04', cle: 'pedibus', montant: 6 }, { from: '2027-01-04', cle: 'mercredi', montant: 7.5 }];
  const t = tarifsFinAnnee(p);
  assert.equal(t.pedibus, 6.5);
  assert.equal(t.mercredi, 7.5);
  assert.equal(t.journee, 14);
});

test('feriesAnnee : jours fériés de septembre à août (Pâques compris)', async () => {
  const { feriesAnnee, defaultParams2026 } = await import('../../src/core/calendar.js');
  assert.deepEqual(feriesAnnee(2026), defaultParams2026().feries, 'identique à la liste 2026-2027');
  const f = feriesAnnee(2027);
  for (const d of ['2027-11-01', '2027-12-25', '2028-04-17', '2028-05-25', '2028-06-05', '2028-07-14', '2028-08-15']) assert.ok(f.includes(d), d);
});

test('preparerParams : proposition pour l’année suivante (même jour de la semaine, à vérifier)', async () => {
  const { preparerParams } = await import('../../src/core/calendar.js');
  const { weekday } = await import('../../src/core/format.js');
  const p = miniState().params;
  p.tarifsChangements = [{ from: '2027-01-04', cle: 'pedibus', montant: 6 }];
  const n = preparerParams(p, 2027);
  assert.equal(n.tarifs.pedibus, 6);
  assert.deepEqual(n.tarifsChangements, []);
  for (const [i, per] of n.periods.entries()) {
    assert.equal(weekday(per.start), weekday(p.periods[i].start), per.label);
    const ecart = (new Date(per.start) - new Date(p.periods[i].start)) / 86400000;
    assert.ok(ecart >= 364 && ecart <= 371, `${per.label} : ${ecart}`);
  }
  assert.equal(n.trimestres[0].start, n.periods.find((x) => x.id === 'T1a').start);
  assert.equal(n.trimestres[2].end, n.periods.find((x) => x.id === 'T3').end);
  assert.ok(n.feries.includes('2028-04-17'));
  assert.ok(n.ktStart.mardi > '2027-09-01');
});
