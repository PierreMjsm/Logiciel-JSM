import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState } from './fixtures/mini-state.js';
import { ENTETES, ligne } from './fixtures/tally.js';
import { lireInscriptions, normTel, rapprocher, differences, opsPreinscription } from '../../src/core/preinscriptions.js';

test('lireInscriptions : colonnes, normalisation, lignes vides et doublons', () => {
  const rows = [ENTETES, ENTETES.map(() => null), ligne({}), ligne({}), ligne({ Nom: 'Petit', 'Prénom': 'Lina', 'E-mail': 'petit@example.fr', 'Date de naissance': '2019-05-02' })];
  const r = lireInscriptions(rows);
  assert.equal(r.length, 2, 'ligne vide ignorée, doublon exact regroupé');
  const a = r[0];
  assert.equal(a.fois, 2);
  assert.equal(a.nom, 'DURAND');
  assert.equal(a.prenom, 'LOUISE');
  assert.equal(a.mail, 'famille.durand@example.fr');
  assert.equal(a.tel, '06 12 34 56 78');
  assert.equal(a.naissance, '2016-06-27');
  assert.equal(a.recue, '2026-11-12');
  assert.equal(a.coches.vaccination, true);
  assert.equal(a.coches.image, false);
  assert.equal(a.coches.paiement, false);
  assert.equal(a.liens.vaccins, 'https://storage.tally.so/private/vaccins.pdf?id=A&accessToken=x');
  assert.equal(a.fiche.secu, '1 99 99 99 999 999 99');
  assert.equal(a.fiche.traitement, 'Oui, PAI arachides');
  assert.equal(r[1].naissance, '2019-05-02');
  assert.notEqual(r[0].cle, r[1].cle);
});

test('normTel : formats Tally et Power Automate', () => {
  assert.equal(normTel('33612345678'), '06 12 34 56 78');
  assert.equal(normTel('+33 6 12 34 56 78'), '06 12 34 56 78');
  assert.equal(normTel('0143314484'), '01 43 31 44 84');
  assert.equal(normTel('4424422442@'), '4424422442@');
});

test('rapprocher : par enfant (prénom + naissance) puis par mail ou téléphone', () => {
  const s = miniState();
  const [louise, lina, autre] = lireInscriptions([ENTETES, ligne({}), ligne({ Nom: 'Petit', 'Prénom': 'Lina', 'E-mail': 'petit@example.fr', 'Téléphone': '', 'Date de naissance': '02/05/2019' }),
    ligne({ 'Prénom': 'Paul', 'Date de naissance': '01/01/2017', 'E-mail': 'x@example.fr', 'Téléphone': '0600000001' })]);
  assert.deepEqual(rapprocher(s, louise), { familyId: 'f1', childId: 'c1', candidats: ['f1'] });
  assert.deepEqual(rapprocher(s, lina), { familyId: null, childId: null, candidats: [] });
  const p = rapprocher(s, autre);
  assert.equal(p.familyId, 'f1', 'famille retrouvée par le téléphone');
  assert.equal(p.childId, null, 'nouvel enfant dans une famille connue');
});

test('differences : seulement ce qui change, cochées par défaut quand la fiche apporte une info', () => {
  const s = miniState();
  const [rec] = lireInscriptions([ENTETES, ligne({ 'Téléphone': '0699999999', 'E-mail': 'nouveau@example.fr' })]);
  const d = differences(s, rec, 'f1', 'c1');
  const by = Object.fromEntries(d.map((x) => [x.id, x]));
  assert.ok(!by['famille.adresse'], 'adresse identique : rien');
  assert.equal(by['famille.telMaman'].avant, '0600000001');
  assert.equal(by['famille.telMaman'].apres, '06 99 99 99 99');
  assert.equal(by['famille.mails'].apres, 'famille.durand@example.fr ; b@y.fr ; nouveau@example.fr', 'mail ajouté, pas remplacé');
  assert.equal(by['enfant.classe'].apres, 'CM2');
  assert.equal(by['enfant.pai'].apres, true);
  assert.equal(by['fiche.secu'].defaut, true);
  assert.ok(!by['enfant.ecole'] || by['enfant.ecole'].defaut === false, 'école déjà connue : pas cochée');
});

test('opsPreinscription : nouvelle famille + nouvel enfant, fiche complète, documents, trace', () => {
  const s = miniState();
  const [rec] = lireInscriptions([ENTETES, ligne({ Nom: 'Petit', 'Prénom': 'Lina', 'E-mail': 'petit@example.fr', 'Téléphone': '', 'Date de naissance': '02/05/2019', "Lien attestation d'ayant droit": 'https://x/a.pdf' })]);
  const ops = opsPreinscription(s, rec, { familyId: null, childId: null, retenus: null, newFamilyId: 'fN', newChildId: 'cN', today: '2026-11-15', by: 'Pierre' });
  const get = (p) => ops.find(([path]) => path.join('.') === p)?.[1];
  assert.equal(get('families.fN').nom, 'PETIT');
  assert.equal(get('families.fN').mails, 'petit@example.fr');
  const c = get('children.cN');
  assert.equal(c.familyId, 'fN');
  assert.equal(c.prenom, 'LINA');
  assert.equal(c.naissance, '2019-05-02');
  assert.equal(c.groupes[0].groupe, '6-8 ans');
  assert.equal(c.fiche.signataire, 'Marie Durand');
  assert.equal(c.fiche.dateSignature, '2026-11-12');
  assert.equal(c.fiche.coches.soins, true);
  assert.deepEqual(c.documents, { fiche: true, vaccins: true, amelie: true });
  assert.deepEqual(get(`preinscriptions.${rec.cle}`), { traitee: '2026-11-15', by: 'Pierre', childId: 'cN' });
});

test('opsPreinscription : famille connue, seules les différences retenues sont appliquées', () => {
  const s = miniState();
  const [rec] = lireInscriptions([ENTETES, ligne({ 'Téléphone': '0699999999', Classe: 'CM2' })]);
  const ops = opsPreinscription(s, rec, { familyId: 'f1', childId: 'c1', retenus: new Set(['enfant.classe', 'fiche.secu']), today: '2026-11-15', by: 'Katell' });
  const paths = ops.map(([p]) => p.join('.'));
  assert.ok(paths.includes('children.c1.classe'));
  assert.ok(paths.includes('children.c1.fiche.secu'));
  assert.ok(!paths.includes('families.f1.telMaman'));
  assert.ok(paths.includes(`preinscriptions.${rec.cle}`));
});
