import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultParams2026, activityDates, trimestreOf, periodOf, groupAt,
  ageLabel, ageAt, ktDay, defaultGroupe, slotsOf,
} from '../../src/core/calendar.js';

const p = defaultParams2026();

test('pedibus dates: mon/tue/thu/fri of school periods, no feries, no holidays', () => {
  const d = activityDates(p, 'pedibus', {});
  assert.deepEqual(d.slice(0, 4), ['2026-09-01', '2026-09-03', '2026-09-04', '2026-09-07']);
  assert.ok(!d.includes('2026-11-11'));
  assert.ok(!d.some((x) => x >= '2026-10-19' && x <= '2026-10-30'));
});

test('mercredi dates are wednesdays in school periods', () => {
  const d = activityDates(p, 'mercredi', {});
  assert.equal(d[0], '2026-09-02');
  assert.ok(!d.includes('2026-10-21'));
  assert.deepEqual(slotsOf('mercredi'), ['matin', 'aprem']);
  assert.deepEqual(slotsOf('pedibus'), ['']);
});

test('vacances toussaint runs to Monday 2 November as in the Excel Data sheet', () => {
  const d = activityDates(p, 'toussaint', {});
  assert.equal(d.length, 11);
  assert.equal(d.at(-1), '2026-11-02');
});

test('extra dates for exceptionnel are sorted', () => {
  assert.deepEqual(activityDates(p, 'exceptionnel', { exceptionnel: ['2026-12-02', '2026-10-06'] }), ['2026-10-06', '2026-12-02']);
});

test('trimestre and period lookup', () => {
  assert.equal(trimestreOf(p, '2026-11-04'), 1);
  assert.equal(trimestreOf(p, '2027-03-10'), 2);
  assert.equal(trimestreOf(p, '2027-05-12'), 3);
  assert.equal(periodOf(p, '2026-10-21').id, 'toussaint');
});

test('groupAt uses the dated change', () => {
  const c = { groupes: [{ from: null, groupe: '3 ans' }, { from: '2027-07-05', groupe: '4-5 ans' }] };
  assert.equal(groupAt(c, '2027-06-30'), '3 ans');
  assert.equal(groupAt(c, '2027-07-05'), '4-5 ans');
});

test('age helpers', () => {
  assert.equal(ageLabel('2020-03-12', '2026-11-13'), '6 ans');
  assert.equal(ageAt('2020-11-13', '2026-11-13'), 6);
  assert.equal(ageLabel(null, '2026-11-13'), '');
  assert.equal(defaultGroupe(3), '3 ans');
  assert.equal(defaultGroupe(5), '4-5 ans');
  assert.equal(defaultGroupe(7), '6-8 ans');
  assert.equal(defaultGroupe(9), '8-10 ans');
  assert.equal(defaultGroupe(12), 'Collégiens');
});

test('ktDay starts at kt rentrée dates', () => {
  assert.equal(ktDay(p, '2026-09-08'), null);
  assert.equal(ktDay(p, '2026-09-15'), 'mardi');
  assert.equal(ktDay(p, '2026-09-17'), 'jeudi');
  assert.equal(ktDay(p, '2026-09-18'), null);
});

test('jourSansWeekend : saute samedi et dimanche dans le sens demandé', async () => {
  const { jourSansWeekend } = await import('../../src/core/calendar.js');
  assert.equal(jourSansWeekend('2026-11-15', 1), '2026-11-16');   // dimanche → lundi
  assert.equal(jourSansWeekend('2026-11-14', 1), '2026-11-16');   // samedi → lundi
  assert.equal(jourSansWeekend('2026-11-15', -1), '2026-11-13');  // dimanche → vendredi
  assert.equal(jourSansWeekend('2026-11-12', 1), '2026-11-12');
});
