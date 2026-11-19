import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState } from './fixtures/mini-state.js';
import { parseChildRows, planAjout, MODELE_COLONNES } from '../../src/core/familles-fichier.js';

const header = MODELE_COLONNES.map((c) => c.label);
const row = (o) => MODELE_COLONNES.map((c) => o[c.id] ?? '');

test('le modèle a les colonnes attendues', () => {
  assert.deepEqual(header.slice(0, 4), ['Nom de famille', 'Prénom', 'Date de naissance', 'École']);
  assert.ok(header.includes('Adhésion réglée'));
  assert.ok(header.includes('Pédibus'));
  assert.ok(header.includes('Vaccins'));
});

test('lecture souple: en-têtes dans un autre ordre, dates françaises, oui/non', () => {
  const rows = [
    ['Prénom', 'NOM', 'Naissance', 'Mail', 'pédibus', 'Adhésion réglée', 'PAI'],
    ['léo', 'Petit', '03/05/2019', 'petit@exemple.fr', 'oui', 'Oui', 'x'],
    ['', '', '', '', '', '', ''],
  ];
  const { enfants, erreurs } = parseChildRows(rows);
  assert.deepEqual(erreurs, []);
  assert.equal(enfants.length, 1);
  const e = enfants[0];
  assert.equal(e.nom, 'PETIT');
  assert.equal(e.prenom, 'LÉO');
  assert.equal(e.naissance, '2019-05-03');
  assert.equal(e.inscriptions.pedibus, true);
  assert.equal(e.adhesionDejaReglee, true);
  assert.equal(e.pai, true);
});

test('ligne sans nom ou sans prénom signalée', () => {
  const { enfants, erreurs } = parseChildRows([header, row({ nom: 'PETIT' })]);
  assert.equal(enfants.length, 0);
  assert.match(erreurs[0], /ligne 2/);
});

test('ajout: frères et sœurs regroupés, famille existante retrouvée, doublons ignorés', () => {
  const s = miniState();
  const { enfants } = parseChildRows([header,
    row({ nom: 'Petit', prenom: 'Léo', naissance: '2019-05-03', mails: 'petit@exemple.fr', ecole: 'MARCEL' }),
    row({ nom: 'PETIT', prenom: 'Lou', naissance: '2021-01-02', mails: 'PETIT@exemple.fr; autre@x.fr' }),
    row({ nom: 'DURAND', prenom: 'Mia', naissance: '2020-02-02', mails: 'famille.durand@example.fr' }),
    row({ nom: 'DURAND', prenom: 'NOAH', naissance: '2020-03-12', mails: 'famille.durand@example.fr' }),
  ]);
  let n = 0;
  const plan = planAjout(s, enfants, () => `x${++n}`);
  assert.equal(plan.nouvellesFamilles, 1);
  assert.equal(plan.nouveauxEnfants, 3);
  assert.deepEqual(plan.dejaPresents, ['DURAND NOAH']);
  const fams = plan.changes.filter(([p]) => p[0] === 'families');
  assert.equal(fams.length, 1);
  const kids = plan.changes.filter(([p]) => p[0] === 'children').map(([, v]) => v);
  assert.equal(kids.filter((k) => k.familyId === fams[0][0][1]).length, 2, 'Léo et Lou dans la même nouvelle famille');
  assert.equal(kids.find((k) => k.prenom === 'MIA').familyId, 'f1', 'Mia rejoint la famille DURAND existante');
  assert.equal(kids.find((k) => k.prenom === 'LÉO').groupes[0].groupe, '6-8 ans');
});

test('CSV avec point-virgule et guillemets (export de formulaire)', async () => {
  const { parseCsv } = await import('../../src/core/familles-fichier.js');
  const rows = parseCsv('﻿Nom;Prénom;Mail\r\n"PETIT";"Léo";"a@x.fr; b@y.fr"\r\nDUPONT;Zoé;"c""@x.fr"\r\n');
  assert.deepEqual(rows, [['Nom', 'Prénom', 'Mail'], ['PETIT', 'Léo', 'a@x.fr; b@y.fr'], ['DUPONT', 'Zoé', 'c"@x.fr']]);
});

test('la ligne d\'exemple du modèle (nom EXEMPLE) est ignorée', () => {
  const { enfants } = parseChildRows([header, row({ nom: 'EXEMPLE', prenom: 'Lina' }), row({ nom: 'PETIT', prenom: 'Léo' })]);
  assert.deepEqual(enfants.map((e) => e.nom), ['PETIT']);
});
