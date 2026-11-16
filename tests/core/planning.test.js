import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState, mark } from './fixtures/mini-state.js';
import { applyOps, makeOp } from '../../src/core/store.js';
import { fillFromPlanning } from '../../src/core/planning.js';

const apply = (s, changes) => applyOps(s, changes.map(([path, value], i) => makeOp({ by: 'T', dev: 'T', seq: i, t: '2026-11-14T10:00:00Z', path, value })));

test('pédibus: P les jours habituels de l\'enfant, de la date choisie à la fin de l\'année', () => {
  const s = miniState();
  s.children.c2.planning = { pedibus: [1, 5] }; // lundi et vendredi, pas de KT pour c2 ? (ktJeudi dans la fixture)
  s.children.c2.inscriptions.ktJeudi = false;
  const changes = fillFromPlanning(s, { activity: 'pedibus', from: '2026-11-16', to: '2026-11-22' });
  assert.deepEqual(changes.map(([p, v]) => [p[1], v]), [['c2|pedibus|2026-11-16|', 'P'], ['c2|pedibus|2026-11-20|', 'P']]);
});

test('pédibus: les jours de KT deviennent KT, les collégiens C', () => {
  const s = miniState();
  s.children.c1.planning = { pedibus: [4] };
  s.children.c1.inscriptions.ktJeudi = true;
  s.children.c5.planning = { pedibus: [1] };
  s.children.c5.groupes = [{ from: null, groupe: 'Collégiens' }];
  const changes = fillFromPlanning(s, { activity: 'pedibus', from: '2026-11-16', to: '2026-11-20' });
  const m = Object.fromEntries(changes.map(([p, v]) => [p[1], v]));
  assert.equal(m['c1|pedibus|2026-11-19|'], 'KT');
  assert.equal(m['c5|pedibus|2026-11-16|'], 'C');
});

test('un enfant inscrit au KT jeudi a KT même si le jeudi n\'est pas dans ses jours de pédibus', () => {
  const s = miniState();
  s.children.c1.planning = { pedibus: [1] };
  s.children.c1.inscriptions.ktJeudi = true;
  const m = Object.fromEntries(fillFromPlanning(s, { activity: 'pedibus', from: '2026-11-16', to: '2026-11-20' }).map(([p, v]) => [p[1], v]));
  assert.equal(m['c1|pedibus|2026-11-19|'], 'KT');
  assert.equal(m['c1|pedibus|2026-11-16|'], 'P');
});

test('mercredi: matin et/ou après-midi selon les jours habituels; vacances et fériés exclus', () => {
  const s = miniState();
  s.children.c3.planning = { mercredi: ['matin'] };
  const changes = fillFromPlanning(s, { activity: 'mercredi', from: '2026-10-14', to: '2026-11-04' });
  assert.deepEqual(changes.map(([p]) => p[1]), ['c3|mercredi|2026-10-14|matin', 'c3|mercredi|2026-11-04|matin']);
});

test('une saisie existante n\'est jamais écrasée (absence A gardée)', () => {
  const s = miniState();
  s.children.c2.planning = { pedibus: [1] };
  s.children.c2.inscriptions.ktJeudi = false;
  mark(s, 'c2', 'pedibus', '2026-11-16', 'A');
  const changes = fillFromPlanning(s, { activity: 'pedibus', from: '2026-11-16', to: '2026-11-23' });
  assert.deepEqual(changes.map(([p, v]) => [p[1], v]), [['c2|pedibus|2026-11-23|', 'P']]);
});

test('option « remplacer »: les P prévus qui ne correspondent plus aux jours habituels sont retirés à partir de la date', () => {
  let s = miniState();
  s.children.c2.planning = { pedibus: [2] };
  s.children.c2.inscriptions.ktJeudi = false;
  mark(s, 'c2', 'pedibus', '2026-11-16', 'P'); // ancien lundi prévu
  mark(s, 'c2', 'pedibus', '2026-11-09', 'P'); // avant la date : gardé
  mark(s, 'c2', 'pedibus', '2026-11-23', 'A'); // absence : gardée
  const changes = fillFromPlanning(s, { activity: 'pedibus', from: '2026-11-10', to: '2026-11-24', replace: true });
  s = apply(s, changes);
  assert.equal(s.presences['c2|pedibus|2026-11-16|'], undefined);
  assert.equal(s.presences['c2|pedibus|2026-11-09|'], 'P');
  assert.equal(s.presences['c2|pedibus|2026-11-23|'], 'A');
  assert.equal(s.presences['c2|pedibus|2026-11-17|'], 'P');
});

test('seulement les enfants choisis, et seulement ceux qui ont des jours habituels', () => {
  const s = miniState();
  s.children.c1.planning = { pedibus: [1] };
  s.children.c2.planning = { pedibus: [1] };
  const changes = fillFromPlanning(s, { activity: 'pedibus', from: '2026-11-16', to: '2026-11-16', childIds: ['c2'] });
  assert.deepEqual(changes.map(([p]) => p[1]), ['c2|pedibus|2026-11-16|']);
});

test('derivePlanning retrouve les jours habituels à partir des présences déjà saisies (import Excel)', async () => {
  const { derivePlanning } = await import('../../src/core/planning.js');
  const s = miniState();
  for (const d of ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']) mark(s, 'c2', 'pedibus', d, 'P'); // lundis
  for (const d of ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']) mark(s, 'c2', 'pedibus', d, 'P'); // vendredis
  mark(s, 'c2', 'pedibus', '2026-09-08', 'P'); // un mardi isolé
  for (const d of ['2026-09-02', '2026-09-09', '2026-09-16']) mark(s, 'c3', 'mercredi', d, 'P', 'aprem');
  const plan = derivePlanning(s);
  assert.deepEqual(plan.c2, { pedibus: [1, 5] });
  assert.deepEqual(plan.c3, { mercredi: ['aprem'] });
});

test('le remplissage avec « remplacer » garde les absences KT', () => {
  let s = miniState();
  s.children.c2.planning = { pedibus: [1] };
  mark(s, 'c2', 'pedibus', '2026-11-19', 'AKT');
  const changes = fillFromPlanning(s, { activity: 'pedibus', from: '2026-11-16', to: '2026-11-20', replace: true });
  assert.ok(!changes.some(([p]) => p[1] === 'c2|pedibus|2026-11-19|'));
});
