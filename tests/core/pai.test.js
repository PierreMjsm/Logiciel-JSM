import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState } from './fixtures/mini-state.js';
import { etatPai, paiAlertes, texteAlertesPai } from '../../src/core/pai.js';
import { opsDepart } from '../../src/core/depart.js';
import { opsPreinscription } from '../../src/core/preinscriptions.js';
import { fichesSante } from '../../src/core/trombi.js';

const today = '2026-11-22';

test('état du PAI : valide, à renouveler bientôt (30 jours par défaut ou réglable), expiré, sans date', () => {
  assert.equal(etatPai({ pai: false }, today).etat, 'aucun');
  assert.deepEqual(etatPai({ pai: true }, today), { etat: 'sansDate', fin: '', jours: null });
  assert.deepEqual(etatPai({ pai: true, paiInfo: { fin: '2027-06-30' } }, today), { etat: 'valide', fin: '2027-06-30', jours: 220 });
  assert.equal(etatPai({ pai: true, paiInfo: { fin: '2026-12-22' } }, today).etat, 'bientot', '30 jours avant');
  assert.equal(etatPai({ pai: true, paiInfo: { fin: '2026-12-23' } }, today).etat, 'valide');
  assert.equal(etatPai({ pai: true, paiInfo: { fin: '2027-01-15', prevenir: 60 } }, today).etat, 'bientot');
  assert.deepEqual(etatPai({ pai: true, paiInfo: { fin: '2026-11-22' } }, today), { etat: 'bientot', fin: '2026-11-22', jours: 0 }, 'valable jusqu’au jour même');
  assert.deepEqual(etatPai({ pai: true, paiInfo: { fin: '2026-11-21' } }, today), { etat: 'expire', fin: '2026-11-21', jours: -1 });
});

test('alertes PAI : enfants présents seulement, les plus urgents d’abord, avec un texte prêt pour la notification', () => {
  const s = miniState();
  s.children.c1.pai = true; s.children.c1.paiInfo = { fin: '2026-12-01' };
  s.children.c3.pai = true; s.children.c3.paiInfo = { fin: '2026-10-31' };
  s.children.c5.pai = true; // pas de date de validité
  s.children.c4 = { ...s.children.c1, prenom: 'ADAM', paiInfo: { fin: '2026-01-01' }, groupes: [{ from: null, groupe: 'Plus présent' }] };
  s.children.c2 = { ...s.children.c1, prenom: 'JULES', paiInfo: { fin: '2027-09-01' } };
  const a = paiAlertes(s, today);
  assert.deepEqual(a.map((x) => [x.prenom, x.etat]), [['NOAH', 'expire'], ['LOUISE', 'bientot'], ['ZOE', 'sansDate']]);
  assert.equal(a[0].nom, 'NOAH DURAND');
  const t = texteAlertesPai(a);
  assert.match(t.titre, /3 PAI à vérifier/);
  assert.match(t.texte, /NOAH DURAND : expiré depuis le 31\/10\/2026/);
  assert.match(t.texte, /LOUISE DURAND : expire le 01\/12\/2026 \(dans 9 jours\)/);
  assert.match(t.texte, /ZOE MOREAU : date de validité à renseigner/);
  const v = miniState();
  for (const c of Object.values(v.children)) c.pai = false;
  assert.deepEqual(paiAlertes(v, today), []);
});

test('pré-inscription : traitement (P.A.I) rempli → PAI coché et texte repris dans l’onglet P.A.I', () => {
  const s = miniState();
  const rec = { cle: 'k', nom: 'NOUVEAU', prenom: 'TOM', naissance: '2018-05-01', ecole: '', classe: '', mail: '', mail2: '', adresse: '', tel: '', tel2: '',
    fiche: { traitement: 'Allergie arachide, stylo d’adrénaline' }, coches: {}, liens: {} };
  const ops = opsPreinscription(s, rec, { newFamilyId: 'fN', newChildId: 'cN', today, by: 'Pierre' });
  const enfant = ops.find(([p]) => p[0] === 'children' && p[1] === 'cN')[1];
  assert.equal(enfant.pai, true);
  assert.deepEqual(enfant.paiInfo, { traitement: 'Allergie arachide, stylo d’adrénaline' });
  const sans = opsPreinscription(s, { ...rec, fiche: { traitement: 'Non' } }, { newFamilyId: 'fN', newChildId: 'cN', today, by: 'Pierre' });
  const e2 = sans.find(([p]) => p[0] === 'children' && p[1] === 'cN')[1];
  assert.equal(e2.pai, false);
  assert.equal(e2.paiInfo, undefined);
  // Enfant déjà connu : PAI coché, traitement repris seulement si l'onglet est vide.
  s.children.c1.fiche = {};
  const ex = opsPreinscription(s, rec, { familyId: 'f1', childId: 'c1', today, by: 'Pierre' });
  assert.ok(ex.some(([p, v]) => p.join('.') === 'children.c1.pai' && v === true));
  assert.ok(ex.some(([p, v]) => p.join('.') === 'children.c1.paiInfo.traitement' && v === rec.fiche.traitement));
  s.children.c1.paiInfo = { traitement: 'déjà noté' };
  assert.ok(!opsPreinscription(s, rec, { familyId: 'f1', childId: 'c1', today, by: 'Pierre' }).some(([p]) => p.join('.') === 'children.c1.paiInfo.traitement'));
});

test('départ avec effacement : les infos PAI partent aussi', () => {
  const s = miniState();
  s.children.c1.pai = true; s.children.c1.paiInfo = { motif: 'asthme' };
  const ops = opsDepart(s, 'c1', today, { effacer: true });
  assert.ok(ops.some(([p, v]) => p.join('.') === 'children.c1.paiInfo' && v === null));
  assert.ok(!opsDepart(s, 'c1', today, { effacer: false }).some(([p]) => p.join('.') === 'children.c1.paiInfo'));
});

test('fiches santé : le PAI apporte motif, conduite à tenir, médicaments et validité', () => {
  const s = miniState();
  s.children.c1.pai = true;
  s.children.c1.paiInfo = { motif: 'Asthme', conduite: 'Ventoline 2 bouffées', rangement: 'Trousse rouge', fin: '2027-06-30' };
  const [f] = fichesSante(s, today);
  assert.deepEqual([f.prenom ?? f.nom, f.paiMotif, f.paiConduite, f.paiRangement, f.paiFin], ['DURAND Louise', 'Asthme', 'Ventoline 2 bouffées', 'Trousse rouge', '2027-06-30']);
});
