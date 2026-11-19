import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState } from './fixtures/mini-state.js';
import { opsDepart } from '../../src/core/depart.js';

const apply = (ops) => Object.fromEntries(ops.map(([p, v]) => [p.join('.'), v]));

test('départ : « Plus présent », renseignements et documents effacés, l’essentiel gardé', () => {
  const s = miniState();
  s.children.c1.fiche = { secu: '1 99', difficultes: 'Allergie' };
  s.children.c1.documents = { fiche: true, vaccins: true };
  s.children.c1.pieces = { photo: '2026-11-15 10:00:00' };
  s.children.c1.pai = true;
  s.children.c1.planning = { pedibus: ['lundi'] };
  const o = apply(opsDepart(s, 'c1', '2026-11-20', { effacer: true }));
  assert.deepEqual(o['children.c1.groupes'].at(-1), { from: '2026-11-20', groupe: 'Plus présent' });
  assert.equal(o['children.c1.fiche'], null);
  assert.deepEqual(o['children.c1.documents'], {});
  assert.equal(o['children.c1.pieces'], null);
  assert.equal(o['children.c1.pai'], false);
  assert.equal(o['children.c1.planning'], null);
  assert.equal(o['children.c1.prenom'], undefined, 'prénom, nom, naissance gardés');
  assert.equal(o['families.f1.telMaman'], undefined, 'Jules (même famille) est encore là : téléphones gardés');
});

test('départ du dernier enfant de la famille : téléphones effacés, mail et adresse gardés', () => {
  const s = miniState();
  const o = apply(opsDepart(s, 'c5', '2026-11-20', { effacer: true }));
  assert.equal(o['families.f2.telMaman'], '');
  assert.equal(o['families.f2.telPapa'], '');
  assert.equal(o['families.f2.mails'], undefined);
  assert.equal(o['families.f2.adresse'], undefined);
});

test('départ sans effacer : seulement « Plus présent »', () => {
  const s = miniState();
  assert.deepEqual(Object.keys(apply(opsDepart(s, 'c1', '2026-11-20', { effacer: false }))), ['children.c1.groupes']);
});
