import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tallyVersLignes, idFormulaire } from '../../src/core/tally-api.js';
import { fusionnerExports } from '../../src/core/preinscriptions.js';

// Réponse de l'API (GET /forms/{id}/submissions), données fictives.
const API = {
  questions: [
    { id: 'q1', type: 'INPUT_TEXT', title: "Nom de l'enfant : ", fields: [{ uuid: 'u1', type: 'INPUT_FIELD', title: "Nom de l'enfant : " }] },
    { id: 'q2', type: 'INPUT_TEXT', title: "Prénom de l'enfant", fields: [{ uuid: 'u2', title: "Prénom de l'enfant" }] },
    { id: 'q3', type: 'INPUT_DATE', title: 'Date de Naissance', fields: [{ uuid: 'u3', title: 'Date de Naissance' }] },
    { id: 'q4', type: 'CHECKBOXES', title: "Renseignements Sanitaires concernant l'enfant", fields: [
      { uuid: 'o1', type: 'CHECKBOX', title: "Renseignements Sanitaires concernant l'enfant (VACCINATION : merci de JOINDRE les photocopies)" },
      { uuid: 'o2', type: 'CHECKBOX', title: "Renseignements Sanitaires concernant l'enfant (UN PAIEMENT du montant de 5€)" }] },
    { id: 'q5', type: 'FILE_UPLOAD', title: 'Merci de joindre les photocopies des pages de vaccins', fields: [{ uuid: 'u5', title: 'Merci de joindre les photocopies des pages de vaccins' }] },
    { id: 'q6', type: 'SIGNATURE', title: 'Signature', fields: [{ uuid: 'u6', title: 'Signature' }] },
  ],
  submissions: [
    { id: 'sub1', respondentId: 'r1', isCompleted: true, submittedAt: '2026-11-15T16:15:15.000Z', responses: [
      { questionId: 'q1', answer: 'Durand' }, { questionId: 'q2', answer: 'Louise' }, { questionId: 'q3', answer: '2016-06-27' },
      { questionId: 'q4', answer: ['VACCINATION : merci de JOINDRE les photocopies'] },
      { questionId: 'q5', answer: [{ id: 'f1', name: 'vaccins.pdf', url: 'https://storage.tally.so/private/vaccins.pdf?id=V', mimeType: 'application/pdf' }, { name: 'p2.jpg', url: 'https://storage.tally.so/private/p2.jpg?id=W' }] },
      { questionId: 'q6', answer: [{ url: 'https://storage.tally.so/private/sig.png?id=S' }] }] },
    { id: 'sub2', isCompleted: false, submittedAt: '2026-11-16T08:00:00.000Z', responses: [{ questionId: 'q1', answer: 'Brouillon' }] },
  ],
};

test('idFormulaire : depuis le lien des réponses ou l’identifiant seul', () => {
  assert.equal(idFormulaire('https://tally.so/forms/D4LrYR/submissions'), 'D4LrYR');
  assert.equal(idFormulaire('https://tally.so/r/D4LrYR'), 'D4LrYR');
  assert.equal(idFormulaire(' D4LrYR '), 'D4LrYR');
});

test('tallyVersLignes : mêmes colonnes que l’export CSV, réponses incomplètes ignorées', () => {
  const rows = tallyVersLignes(API.questions, API.submissions);
  assert.equal(rows.length, 2);
  const h = rows[0];
  const v = Object.fromEntries(h.map((k, i) => [k, rows[1][i]]));
  assert.equal(v['Submission ID'], 'sub1');
  assert.equal(v['Submitted at'], '2026-11-15 17:15:15', 'heure de Paris');
  assert.equal(v["Renseignements Sanitaires concernant l'enfant (VACCINATION : merci de JOINDRE les photocopies)"], 'true');
  assert.equal(v["Renseignements Sanitaires concernant l'enfant (UN PAIEMENT du montant de 5€)"], 'false');
  assert.equal(v['Merci de joindre les photocopies des pages de vaccins'], 'https://storage.tally.so/private/vaccins.pdf?id=V, https://storage.tally.so/private/p2.jpg?id=W');
  assert.equal(v.Signature, 'https://storage.tally.so/private/sig.png?id=S');
});

test('de l’API à l’inscription : même résultat qu’avec un export', () => {
  const [r] = fusionnerExports([{ nom: 'Tally', mtime: 9, rows: tallyVersLignes(API.questions, API.submissions) }]);
  assert.equal(r.cle, 'tally-sub1');
  assert.deepEqual([r.nom, r.prenom, r.naissance, r.recueLe], ['DURAND', 'LOUISE', '2016-06-27', '2026-11-15 17:15:15']);
  assert.equal(r.coches.vaccination, true);
  assert.equal(r.coches.paiement, false);
  assert.match(r.liens.vaccins, /vaccins\.pdf.*p2\.jpg/);
  assert.equal(r.fiche.signature, 'https://storage.tally.so/private/sig.png?id=S');
  assert.equal(r.fiche.signataire, '', 'signature dessinée : pas de nom tapé');
});

test('cases à cocher : l’API peut donner le texte seul de l’option, ou son identifiant', () => {
  const qs = [
    { id: 'n', type: 'INPUT_TEXT', title: "Nom de l'enfant : ", fields: [{ uuid: 'un', title: "Nom de l'enfant : " }] },
    { id: 'p', type: 'INPUT_TEXT', title: "Prénom de l'enfant", fields: [{ uuid: 'up', title: "Prénom de l'enfant" }] },
    { id: 'c', type: 'CHECKBOXES', title: "Renseignements Sanitaires concernant l'enfant", fields: [
      { uuid: 'o1', type: 'CHECKBOX', title: 'VACCINATION : merci de JOINDRE les photocopies des pages concernées' },
      { uuid: 'o2', type: 'CHECKBOX', title: "UN PAIEMENT du montant de 5€ pour l'ADHESION annuelle" }] },
    { id: 'a', type: 'CHECKBOXES', title: "Concernant les activités (cochés si vous êtes d'accords)", fields: [
      { uuid: 'o3', type: 'CHECKBOX', title: "J’autorise les Jeunes de Saint Médard à photographier et/ou filmer mon enfant" }] },
  ];
  const subs = [{ id: 'x', isCompleted: true, submittedAt: '2026-11-15T17:00:00Z', responses: [
    { questionId: 'n', answer: 'Durand' }, { questionId: 'p', answer: 'Louise' },
    { questionId: 'c', answer: ['VACCINATION : merci de JOINDRE les photocopies des pages concernées'] },
    { questionId: 'a', answer: ['o3'] }] }];
  const [r] = fusionnerExports([{ nom: 'Tally', mtime: 1, rows: tallyVersLignes(qs, subs) }]);
  assert.equal(r.coches.vaccination, true);
  assert.equal(r.coches.paiement, false);
  assert.equal(r.coches.image, true, 'réponse donnée par identifiant');
});
