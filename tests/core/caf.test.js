import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState, mark } from './fixtures/mini-state.js';
import { cafAnnee, prixPresence, attestationsAnnee, moinsDe6Ans, texteAttestation } from '../../src/core/caf.js';
import { childPostes, fratrieDiscounts, presencesByChild } from '../../src/core/billing.js';

// Deux années scolaires : 2025-2026 (dossier précédent) et 2026-2027 (dossier en cours).
function deuxAnnees() {
  const avant = miniState();
  avant.year = '2025-2026';
  const maintenant = miniState();
  for (const s of [avant, maintenant]) s.params.cafAutres = { ...s.params.cafAutres, mercrediMatin: 4, mercrediAprem: 4, vacancesJournee: 8, adoSoiree: 3, collegienPedibus: 2 };
  return { avant, maintenant, etats: [{ label: '2025-2026', state: avant }, { label: '2026-2027', state: maintenant }] };
}
const sec = (r, id) => r.sections.find((s) => s.id === id);
const ligne = (r, s, id) => sec(r, s).lignes.find((l) => l.id === id);

test('année civile : les deux dossiers sont additionnés, Noël coupé au 31 décembre', () => {
  const { avant, maintenant, etats } = deuxAnnees();
  mark(avant, 'c1', 'mercredi', '2026-03-04', 'P', 'matin'); // janvier-août : dossier précédent
  mark(avant, 'c1', 'mercredi', '2025-12-03', 'P', 'matin'); // année civile précédente : pas comptée
  mark(maintenant, 'c1', 'mercredi', '2026-09-02', 'P', 'aprem');
  mark(maintenant, 'c1', 'noel', '2026-12-21', 'P');
  mark(maintenant, 'c1', 'noel', '2027-01-04', 'P'); // Noël 2026-2027 : l'autre moitié est en 2027
  const r = cafAnnee(etats, 2026, '2026-12-31');
  assert.deepEqual(ligne(r, 'peri', 'mercredi').total.realise, { presences: 2, heures: 8 });
  assert.deepEqual(ligne(r, 'extra', 'noel').total.realise, { presences: 1, heures: 8 });
});

test('périscolaire / extrascolaire / PS Jeunes et tranches 3 ans, 4-5 ans, 6 ans et +', () => {
  const { maintenant: s, etats } = deuxAnnees();
  s.children.c4 = { ...s.children.c1, prenom: 'ADAM', groupes: [{ from: null, groupe: '4-5 ans' }] };
  s.children.c6 = { ...s.children.c1, prenom: 'LEO', groupes: [{ from: null, groupe: 'Collégiens' }] };
  mark(s, 'c5', 'mercredi', '2026-09-02', 'P', 'matin'); // 3 ans
  mark(s, 'c4', 'mercredi', '2026-09-02', 'A', 'matin'); // absence facturée : comptée
  mark(s, 'c1', 'mercredi', '2026-09-02', 'E', 'matin'); // absence excusée : pas comptée
  mark(s, 'c1', 'toussaint', '2026-10-20', 'P');
  mark(s, 'c6', 'mercredi', '2026-09-02', 'P', 'matin'); // collégien → PS Jeunes
  mark(s, 'c6', 'ado', '2026-10-09', 'P');
  mark(s, 'c1', 'pedibus', '2026-09-03', 'C'); // « C » = collégien au Pédibus
  const r = cafAnnee(etats, 2026, '2026-12-31');
  const m = ligne(r, 'peri', 'mercredi');
  assert.equal(m.tranches['3'].realise.heures, 4);
  assert.equal(m.tranches['45'].realise.heures, 4);
  assert.equal(m.tranches['6'], undefined);
  assert.equal(ligne(r, 'extra', 'toussaint').tranches['6'].realise.heures, 8);
  assert.deepEqual(sec(r, 'jeunes').lignes.map((l) => l.id), ['pedibus', 'mercredi', 'ado']);
  assert.equal(sec(r, 'jeunes').total.realise.heures, 2 + 4 + 3);
  assert.equal(sec(r, 'peri').tranches['3'].enfants, 1);
  assert.equal(sec(r, 'jeunes').enfants, 2);
});

test('journée exceptionnelle : périscolaire ou extrascolaire selon le réglage de la date', () => {
  const { maintenant: s, etats } = deuxAnnees();
  s.params.exceptionnelType = { '2026-11-12': 'peri' };
  mark(s, 'c1', 'exceptionnel', '2026-11-12', 'P');
  mark(s, 'c1', 'exceptionnel', '2026-11-13', 'P');
  const r = cafAnnee(etats, 2026, '2026-12-31');
  assert.equal(ligne(r, 'peri', 'exceptionnel').total.realise.presences, 1);
  assert.equal(ligne(r, 'extra', 'exceptionnel').total.realise.presences, 1);
});

test('prévisionnel : réalisé, inscrit à venir, et mois sans inscription estimés sur l’année précédente', () => {
  const { avant, maintenant, etats } = deuxAnnees();
  const old = { ...maintenant.children };
  mark(avant, 'c1', 'juillet', '2025-07-07', 'P'); // été 2025 : sert d'estimation pour juillet 2026
  mark(avant, 'c2', 'juillet', '2025-07-08', 'P');
  mark(avant, 'c1', 'mercredi', '2026-03-04', 'P', 'matin');
  mark(maintenant, 'c1', 'mercredi', '2026-09-02', 'P', 'matin');
  mark(maintenant, 'c1', 'mercredi', '2026-09-09', 'P', 'matin'); // après « aujourd'hui » : inscrit
  assert.ok(old);
  const r = cafAnnee(etats, 2026, '2026-04-15');
  const me = ligne(r, 'peri', 'mercredi').total;
  assert.deepEqual([me.realise.presences, me.inscrit.presences], [1, 2]);
  const ju = ligne(r, 'extra', 'juillet').total;
  assert.deepEqual([ju.realise.presences, ju.inscrit.presences, ju.estime.presences, ju.estime.heures], [0, 0, 2, 16]);
});

test('prévisionnel : un mois déjà inscrit n’est pas estimé en plus', () => {
  const { avant, maintenant, etats } = deuxAnnees();
  mark(avant, 'c1', 'juillet', '2025-07-07', 'P');
  mark(avant, 'c2', 'juillet', '2025-07-08', 'P');
  mark(avant, 'c1', 'juillet', '2026-07-07', 'P'); // juillet 2026 déjà inscrit
  assert.ok(maintenant);
  const ju = ligne(cafAnnee(etats, 2026, '2026-04-15'), 'extra', 'juillet').total;
  assert.deepEqual([ju.inscrit.presences, ju.estime.presences], [1, 0]);
});

test('heures du Pédibus selon l’école, le jour et le KT (sortie 15 h, 16 h 30, KT 17 h)', () => {
  const { maintenant: s, etats } = deuxAnnees();
  s.params.cafHeures.MARCEL = { '-6': { lundi: 2.5, mardi: 4, jeudi: 2.5, vendredi: 4 }, '6-11': { lundi: 2.5, mardi: 4, jeudi: 2.5, vendredi: 4 }, KT: { lundi: 1, mardi: 2, jeudi: 1, vendredi: 1 } };
  mark(s, 'c1', 'pedibus', '2026-09-07', 'P'); // lundi : 2,5 h
  mark(s, 'c1', 'pedibus', '2026-09-08', 'P'); // mardi : 4 h
  mark(s, 'c1', 'pedibus', '2026-09-15', 'KT'); // mardi KT : 2 h
  const r = cafAnnee(etats, 2026, '2026-12-31');
  assert.equal(ligne(r, 'peri', 'pedibus').total.realise.heures, 8.5);
});

test('recettes : facturé par présence = facturation par poste ; encaissé selon la date du règlement', () => {
  const { maintenant: s, etats } = deuxAnnees();
  for (const id of ['c1', 'c2', 'c3']) mark(s, id, 'toussaint', '2026-10-20', 'P'); // 3 enfants : le plus jeune à moitié prix
  mark(s, 'c1', 'mercredi', '2026-09-02', 'P', 'matin');
  mark(s, 'c1', 'pedibus', '2026-09-03', 'P');
  const disc = fratrieDiscounts(s, 'f1');
  for (const id of ['c1', 'c2', 'c3']) {
    const parPresence = (presencesByChild(s).get(id) || []).reduce((t, e) => t + prixPresence(s, e, disc), 0);
    const parPoste = childPostes(s, id, disc).filter((p) => p.poste !== 'adhesion').reduce((t, p) => t + p.du, 0);
    assert.equal(Math.round(parPresence * 100), Math.round(parPoste * 100), id);
  }
  s.payments = {
    p1: { familyId: 'f1', date: '2026-10-21', montant: 40, affectations: [{ poste: 'toussaint', montant: 35, childId: 'c1' }, { poste: 'adhesion', montant: 5, childId: 'c1' }] },
    p2: { familyId: 'f1', date: '2027-01-05', montant: 7, affectations: [{ poste: 'mercredi-T1', montant: 7, childId: 'c1' }] },
  };
  const r = cafAnnee(etats, 2026, '2026-12-31');
  assert.equal(r.recettes.extra.facture, 35);
  assert.equal(r.recettes.extra.encaisse, 35);
  assert.equal(r.recettes.adhesion.encaisse, 5);
  assert.equal(r.recettes.peri.encaisse, 0, 'réglé en 2027');
});

test('attestations : moins de 6 ans au 1er janvier, sommes réglées dans l’année, adhésion exclue, deux dossiers', () => {
  const { avant, maintenant, etats } = deuxAnnees();
  assert.equal(moinsDe6Ans('2020-01-02', 2026), true);
  assert.equal(moinsDe6Ans('2020-01-01', 2026), false, 'a 6 ans le 1er janvier');
  // c3 né en mars 2020 : moins de 6 ans au 1er janvier 2026. c1 (2016) : non.
  avant.payments = { a: { familyId: 'f1', date: '2026-02-10', montant: 20, affectations: [{ poste: 'hiver', montant: 15, childId: 'c3' }, { poste: 'adhesion', montant: 5, childId: 'c3' }] } };
  maintenant.payments = {
    b: { familyId: 'f1', date: '2026-10-21', montant: 50, affectations: [{ poste: 'toussaint', montant: 14, childId: 'c3' }, { poste: 'toussaint', montant: 36, childId: 'c1' }] },
    c: { familyId: 'f1', date: '2027-01-05', montant: 7, affectations: [{ poste: 'mercredi-T2', montant: 7, childId: 'c3' }] },
    d: { familyId: 'f1', date: '2026-11-02', montant: 10, affectations: [{ poste: 'a-repartir', montant: 10 }] },
  };
  const [imp] = attestationsAnnee(etats, 2026, 'impots');
  assert.deepEqual(imp.enfants.map((e) => [e.prenom, e.montant]), [['NOAH', 29]]);
  assert.equal(imp.total, 29);
  const [pay] = attestationsAnnee(etats, 2026, 'paiement');
  assert.deepEqual(pay.enfants.map((e) => [e.prenom, e.montant]), [['LOUISE', 36], ['NOAH', 29]]);
  assert.equal(pay.nonAffecte, 10, 'signalé, pas attribué à un enfant');
  const t = texteAttestation(maintenant.params, imp, 2026, 'impots');
  assert.match(t, /Jean EXEMPLE/);
  assert.match(t, /du 1er janvier au 31 décembre 2026/);
  assert.match(t, /NOAH DURAND, né\(e\) le 12\/03\/2020/);
  assert.equal(attestationsAnnee(etats, 2026, 'impots').length, 1, 'la famille sans enfant de moins de 6 ans n’a pas d’attestation');
});
