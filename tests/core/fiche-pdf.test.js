import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState } from './fixtures/mini-state.js';
import { SOURCES, suggestion, correspondanceInitiale, valeursFiche } from '../../src/core/fiche-pdf.js';

// Noms des champs du PDF « Fiche d'adhésion 2026-2027 ».
const CHAMPS = [['Nom de lenfant', 'texte'], ['Prénom de lenfant', 'texte'], ['Adresse et code postal', 'texte'], ['Adresse email', 'texte'],
  ['Téléphone', 'texte'], ['Date de naissance', 'texte'], ['Ecole ou collèges fréquentés par lenfant', 'texte'], ['Classe fréquentée par lenfant', 'texte'],
  ['N de téléphone I et lien', 'texte'], ['N de téléphone 2 et lien', 'texte'], ['Nom Prénom et lien', 'texte'], ['Nom Prénom et lien_2', 'texte'],
  ['N sécu', 'texte'], ['Contact urgence', 'texte'], ['Je soussigné', 'texte'], ['Signature4_es_:signer:signature', 'texte'],
  ['difficultés ?', 'texte'], ['Maladie ?', 'texte'], ['Bservation', 'texte'], ['Date5_es_:signer:date', 'texte'],
  ...Array.from({ length: 11 }, (_, i) => [String(i + 1), 'coche'])].map(([nom, type]) => ({ nom, type }));

test('correspondance proposée automatiquement pour la fiche d’adhésion', () => {
  const m = correspondanceInitiale(CHAMPS);
  assert.equal(m['Nom de lenfant'], 'enfant.nom');
  assert.equal(m['Prénom de lenfant'], 'enfant.prenom');
  assert.equal(m['Date de naissance'], 'enfant.naissance');
  assert.equal(m['Adresse email'], 'famille.mail');
  assert.equal(m['Téléphone'], 'famille.tel1');
  assert.equal(m['N de téléphone 2 et lien'], 'famille.tel2');
  assert.equal(m['Nom Prénom et lien'], 'fiche.autorise1');
  assert.equal(m['Nom Prénom et lien_2'], 'fiche.autorise2');
  assert.equal(m['Ecole ou collèges fréquentés par lenfant'], 'enfant.ecole');
  assert.equal(m['Signature4_es_:signer:signature'], 'fiche.signature');
  assert.equal(m['Date5_es_:signer:date'], 'fiche.dateSignature');
  assert.equal(m['Maladie ?'], 'fiche.traitement');
  assert.equal(m['1'], 'coche.vaccination');
  assert.equal(m['6'], 'coche.paiNon');
  assert.equal(m['11'], 'coche.soins');
  assert.ok(Object.values(m).every((id) => id === '' || SOURCES.some((s) => s.id === id)));
});

test('une nouvelle version reprend la correspondance de la précédente pour les champs de même nom', () => {
  const ancienne = { 'Nom de lenfant': 'enfant.nomPrenom', '1': 'coche.image' };
  const m = correspondanceInitiale([{ nom: 'Nom de lenfant', type: 'texte' }, { nom: '1', type: 'coche' }, { nom: 'Nouveau champ', type: 'texte' }], ancienne);
  assert.equal(m['Nom de lenfant'], 'enfant.nomPrenom');
  assert.equal(m['1'], 'coche.image');
  assert.equal(m['Nouveau champ'], '');
  assert.equal(suggestion('Adresse e-mail', 'texte'), 'famille.mail');
});

test('valeursFiche : textes et cases d’un enfant', () => {
  const s = miniState();
  s.children.c1.classe = 'CM2';
  s.children.c1.fiche = { secu: '1 99', signataire: 'Marie Durand', signature: 'Marie Durand', dateSignature: '2026-11-12', coches: { vaccination: true, image: false }, traitement: '' };
  const v = valeursFiche(s, 'c1', { a: 'enfant.nom', b: 'enfant.naissance', c: 'famille.tel1', d: 'fiche.signature', e: 'fiche.dateSignature', f: 'coche.vaccination', g: 'coche.image', h: 'coche.paiNon', i: 'enfant.classe', j: '' });
  assert.deepEqual(v, { a: 'DURAND', b: '27/06/2016', c: '0600000001', d: 'Signé en ligne par Marie Durand', e: '12/11/2026', f: true, g: false, h: true, i: 'CM2' });
});

test('valeursFiche : signature dessinée (lien d’image) → pas de texte, l’image est posée à part', () => {
  const s = miniState();
  s.children.c1.fiche = { signature: 'https://storage.tally.so/private/sig.png?id=1' };
  assert.deepEqual(valeursFiche(s, 'c1', { d: 'fiche.signature' }), { d: '' });
});
