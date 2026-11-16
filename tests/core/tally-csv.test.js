import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TALLY_ENTETES, tallyLigne, tallyCsv } from './fixtures/tally-csv.js';
import { parseCsv } from '../../src/core/familles-fichier.js';
import { lireInscriptions, fusionnerExports } from '../../src/core/preinscriptions.js';

test('export CSV Tally : toutes les colonnes reconnues', () => {
  const [r] = lireInscriptions(parseCsv(tallyCsv([tallyLigne()])));
  assert.equal(r.cle, 'tally-sub1');
  assert.equal(r.recue, '2026-11-15');
  assert.equal(r.recueLe, '2026-11-15 17:15:15');
  assert.deepEqual([r.nom, r.prenom, r.mail, r.tel, r.naissance, r.ecole, r.classe], ['DURAND', 'LOUISE', 'famille.durand@example.fr', '06 12 34 56 78', '2016-06-27', 'MARCEL', 'CM2']);
  assert.equal(r.adresse, '1 rue des Exemples 75013 Paris');
  assert.deepEqual(r.fiche, {
    secu: '1 99 99 99 999 999 99', urgence: 'Tante 0611111111', autorise1: 'Grand-mère Exemple', autorise2: '',
    difficultes: 'Allergie aux arachides', traitement: 'Oui, PAI arachides', observations: 'Aucune',
    signataire: 'Marie Durand', signature: 'Marie Durand', dateSignature: '2026-11-15' });
  assert.deepEqual(r.coches, { vaccination: true, certifie: true, ayantDroit: true, paiement: false, activites: true, partSeul: false, image: false, facturation: true, soins: true, exactitude: true });
  assert.deepEqual(r.liens, {
    vaccins: 'https://storage.tally.so/private/vaccins.pdf?id=V&accessToken=x',
    ayantDroit: 'https://storage.tally.so/private/ameli.pdf?id=A&accessToken=x',
    photo: 'https://storage.tally.so/private/photo.jpeg?id=P&accessToken=x' });
  assert.equal(TALLY_ENTETES.length, 37);
});

test('plusieurs exports : une réponse comptée une fois, liens du fichier le plus récent', () => {
  const ancien = { nom: 'Plateforme_d_adhesion_Submissions_2026-11-15.csv', mtime: 1, rows: parseCsv(tallyCsv([tallyLigne()])) };
  const recent = { nom: 'Plateforme_d_adhesion_Submissions_2026-11-20.csv', mtime: 2, rows: parseCsv(tallyCsv([
    tallyLigne({ 'Merci de joindre': 'https://storage.tally.so/private/vaccins.pdf?id=V&accessToken=NOUVEAU' }),
    tallyLigne({ 0: 'sub2', 'Prénom': 'Jules', 'Date de Naissance': '2018-03-01', 'Submitted at': '2026-11-19 08:00:00' })])) };
  const r = fusionnerExports([recent, ancien]);
  assert.deepEqual(r.map((x) => x.cle), ['tally-sub1', 'tally-sub2']);
  assert.match(r[0].liens.vaccins, /NOUVEAU/);
  assert.equal(r[0].fois, 1);
});

test('même enfant envoyé deux fois (deux réponses Tally) : les deux restent, la plus récente signalée', () => {
  const rows = parseCsv(tallyCsv([tallyLigne(), tallyLigne({ 0: 'sub9', 'Submitted at': '2026-11-16 09:00:00' })]));
  const r = fusionnerExports([{ nom: 'a.csv', mtime: 1, rows }]);
  assert.equal(r.length, 2);
  assert.equal(r.find((x) => x.cle === 'tally-sub1').remplaceePar, 'tally-sub9');
  assert.equal(r.find((x) => x.cle === 'tally-sub9').remplaceePar, undefined);
});

test('estExportInscriptions : reconnaît un export Tally ou le classeur Inscriptions, pas un autre CSV', async () => {
  const { estExportInscriptions } = await import('../../src/core/preinscriptions.js');
  assert.equal(estExportInscriptions(parseCsv(tallyCsv([tallyLigne()]))), true);
  assert.equal(estExportInscriptions([['Date', 'Libellé', 'Montant'], ['01/11/2026', 'CB', '12']]), false);
  assert.equal(estExportInscriptions([['Nom', 'Prénom', 'Date de naissance']]), true);
});
