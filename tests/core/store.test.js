import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeOp, sortOps, applyOps, pathKey, historyOf } from '../../src/core/store.js';

const base = { families: { f1: { nom: 'AJAMRI' } }, children: { c1: { familyId: 'f1', prenom: 'RAYAN' } }, presences: {} };

test('set then delete a presence', () => {
  const o1 = makeOp({ by: 'Pierre', dev: 'A', seq: 1, t: '2026-11-13T09:00:00.000Z', path: ['presences', 'c1|pedibus|2026-11-13|'], value: 'P' });
  const o2 = makeOp({ by: 'Pierre', dev: 'A', seq: 2, t: '2026-11-13T09:01:00.000Z', path: ['presences', 'c1|pedibus|2026-11-13|'], value: null });
  assert.equal(applyOps(base, [o1]).presences['c1|pedibus|2026-11-13|'], 'P');
  assert.ok(!('c1|pedibus|2026-11-13|' in applyOps(base, [o1, o2]).presences));
  assert.equal(base.presences['c1|pedibus|2026-11-13|'], undefined, 'base not mutated');
});

test('concurrent same-key ops converge regardless of arrival order', () => {
  const path = ['presences', 'c1|mercredi|2026-11-04|matin'];
  const a = makeOp({ by: 'Katell', dev: 'K', seq: 5, t: '2026-11-13T09:00:00.000Z', path, value: 'P' });
  const b = makeOp({ by: 'Lucas', dev: 'L', seq: 1, t: '2026-11-13T09:00:02.000Z', path, value: 'A' });
  const s1 = applyOps(base, sortOps([a, b]));
  const s2 = applyOps(base, sortOps([b, a]));
  assert.equal(s1.presences[path[1]], 'A');
  assert.equal(s2.presences[path[1]], 'A');
  assert.equal(s1._lastWriter[pathKey(path)].by, 'Lucas');
});

test('creating a child and setting a nested field creates intermediates', () => {
  const s = applyOps(base, [
    makeOp({ by: 'P', dev: 'A', seq: 1, t: '2026-01-01T00:00:00Z', path: ['children', 'c9'], value: { prenom: 'LEA', familyId: 'f1' } }),
    makeOp({ by: 'P', dev: 'A', seq: 2, t: '2026-01-01T00:00:01Z', path: ['children', 'c9', 'inscriptions', 'pedibus'], value: true }),
    makeOp({ by: 'P', dev: 'A', seq: 3, t: '2026-01-01T00:00:02Z', path: ['payments', 'p1', 'montant'], value: 10 }),
  ]);
  assert.equal(s.children.c9.prenom, 'LEA');
  assert.equal(s.children.c9.inscriptions.pedibus, true);
  assert.equal(s.payments.p1.montant, 10);
});

test('historyOf returns newest first with readable labels', () => {
  const ops = [
    makeOp({ by: 'Katell', dev: 'K', seq: 1, t: '2026-11-13T09:00:00Z', path: ['presences', 'c1|pedibus|2026-11-13|'], value: 'P' }),
    makeOp({ by: 'Lucas', dev: 'L', seq: 1, t: '2026-11-13T10:00:00Z', path: ['children', 'c1', 'ecole'], value: 'MARCEL' }),
  ];
  const h = historyOf(ops, applyOps(base, ops));
  assert.equal(h[0].by, 'Lucas');
  assert.match(h[1].label, /AJAMRI RAYAN/);
  assert.match(h[1].label, /13\/11\/2026/);
  assert.match(h[1].label, /→ P/);
});
