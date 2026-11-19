import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniState, mark } from './fixtures/mini-state.js';
import { recapText, mailtoUrl, mailingList, cafStats, cafDetail, toCsv, attestation, carte, bilan } from '../../src/core/reports.js';
import { newYear } from '../../src/core/newyear.js';

const norm = (s) => s.replace(/[  ]/g, ' ');

test('recap text: year, per-child detail and reste à payer', () => {
  const s = miniState();
  s.children.c1.adhesionDejaReglee = true;
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  mark(s, 'c3', 'mercredi', '2026-09-09', 'A', 'matin');
  mark(s, 'c3', 'mercredi', '2026-09-16', 'P', 'aprem');
  s.payments.p1 = { familyId: 'f1', childId: 'c3', date: '2026-09-20', montant: 9, mode: 'especes', affectations: [{ poste: 'mercredi-T1', montant: 9 }] };
  const t = norm(recapText(s, 'f1', '2026-11-13'));
  assert.match(t, /^Bonjour M\. \/ Mme DURAND,/);
  assert.match(t, /au 13\/11\/2026 pour l'année scolaire 2026-2027/);
  assert.ok(!t.includes('2025-2026'));
  assert.match(t, /DÉTAIL DES ACTIVITÉS — NOAH/);
  assert.match(t, /• Mercredis T1 \(3 ½ j\.\) : dû 21,00 €/);
  assert.match(t, /• Total dû à ce jour pour la famille : 21,00 €/);
  assert.match(t, /• Total déjà réglé par vos soins : 9,00 €/);
  assert.match(t, /⚠️ RESTE À PAYER : ► 12,00 € ◄/);
  assert.match(t, /Katell et Pierre — Les Jeunes de Saint-Médard$/);
});

test('recap text: à jour and trop-perçu variants', () => {
  const s = miniState();
  s.children.c1.adhesionDejaReglee = true;
  assert.match(recapText(s, 'f1', '2026-11-13'), /✅ Dossier complet/);
  s.payments.p1 = { familyId: 'f1', date: '2026-09-20', montant: 5, mode: 'especes', affectations: [] };
  assert.match(norm(recapText(s, 'f1', '2026-11-13')), /💰 TROP-PERÇU : La famille a réglé 5,00 € de plus que ce qui est dû à ce jour/);
});

test('mailto url encodes subject and body', () => {
  assert.equal(mailtoUrl('a@b.fr', 'Récap', 'x y'), 'mailto:a%40b.fr?subject=R%C3%A9cap&body=x%20y');
});

test('mailing list dedupes and splits multiple addresses', () => {
  const s = miniState();
  const m = mailingList(s, 'pedibus');
  assert.equal(m, 'famille.durand@example.fr; b@y.fr');
});

test('CAF Pédibus: les absences payées (A) comptent aussi', () => {
  const s = miniState();
  s.children.c2.groupes = [{ from: null, groupe: '6-8 ans' }];
  mark(s, 'c2', 'pedibus', '2026-09-07', 'P');
  mark(s, 'c2', 'pedibus', '2026-09-14', 'A');
  mark(s, 'c5', 'pedibus', '2026-09-08', 'P'); // BUFFON 3 ans mardi
  const rows = cafStats(s, '2026-09-01', '2026-09-30');
  const r = rows.find((x) => x.ecole === 'ROSALIE' && x.categorie === '6-11');
  assert.equal(r.byDay.lundi.presences, 2);
  assert.equal(r.byDay.lundi.heures, 5);
  const b = rows.find((x) => x.ecole === 'BUFFON' && x.categorie === '-6');
  assert.equal(b.byDay.mardi.heures, 4);
});

test('CAF détaillé: Pédibus collégiens, mercredis, vacances et ADO sont séparés', () => {
  const s = miniState();
  s.params.cafAutres = { collegienPedibus: 1, mercrediMatin: 3, mercrediAprem: 4, vacancesJournee: 8, adoSoiree: 3 };
  mark(s, 'c1', 'pedibus', '2026-09-07', 'C');
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin');
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'aprem');
  mark(s, 'c5', 'toussaint', '2026-10-19', 'P');
  mark(s, 'c5', 'toussaint', '2026-10-20', 'A');
  s.extraDates.ado = ['2026-09-25'];
  mark(s, 'c1', 'ado', '2026-09-25', 'P');
  const d = cafDetail(s, '2026-09-01', '2026-10-31');
  assert.deepEqual(d.collegiensPedibus.map((r) => [r.ecole, r.presences, r.heures]), [['MARCEL', 1, 1]]);
  assert.deepEqual(d.mercredi.map((r) => [r.categorie, r.matin, r.aprem, r.heures]), [['6-11', 1, 1, 7]]);
  assert.deepEqual(d.vacances.map((r) => [r.periode, r.categorie, r.jours, r.heures]), [['toussaint', '-6', 2, 16]], 'l\'absence payée du 20/10 compte');
  assert.deepEqual(d.ado.map((r) => [r.date, r.presences, r.heures]), [['2026-09-25', 1, 3]]);
});

test('attestation text and total', () => {
  const s = miniState();
  const a = attestation(s, { childId: 'c3', lignes: [{ designation: 'Vacances de la Toussaint', quantite: 5, prix: 14 }] }, '2026-11-13');
  assert.equal(a.total, 70);
  assert.match(a.texte, /Je soussigné Jean EXEMPLE/);
  assert.match(a.texte, /NOAH DURAND/);
  assert.match(a.texte, /0000000TEST/);
});

test('carte counts postal codes and builds map links', () => {
  const c = carte(miniState());
  assert.deepEqual(c.parCodePostal, [{ cp: '75013', n: 4 }]);
  assert.match(c.liens[0].url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
});

test('bilan counts adherents and pedibus totals', () => {
  const s = miniState();
  mark(s, 'c1', 'pedibus', '2026-09-01', 'P');
  const b = bilan(s, '2026-11-13');
  assert.equal(b.adherents, 2);
  assert.equal(b.pedibus[1].jours, 1);
  assert.equal(b.pedibus[1].prevu, 5.5);
});

test('newYear keeps every family and child (anciens included), clears presences and payments', () => {
  const s = miniState();
  s.children.c2.groupes = [{ from: null, groupe: 'Plus présent' }];
  mark(s, 'c1', 'pedibus', '2026-09-01', 'P');
  s.payments.p1 = { familyId: 'f1', montant: 1 };
  const n = newYear(s, '2027-2028', s.params, '2027-09-01');
  assert.equal(n.year, '2027-2028');
  assert.equal(n.children.c2.groupes[0].groupe, 'Plus présent', 'ancien gardé pour le carnet d\'adresses');
  assert.ok(n.children.c1);
  assert.deepEqual(n.presences, {});
  assert.deepEqual(n.payments, {});
  assert.equal(n.children.c1.inscriptions.pedibus, false);
  assert.equal(n.children.c1.adhesionDejaReglee, false);
  assert.equal(n.children.c3.groupes[0].groupe, '6-8 ans');
});

test('mailing: anciennes familles seulement si demandé (campagne de dons)', () => {
  const s = miniState();
  s.families.f2.mails = 'ancien@x.fr';
  s.children.c5.groupes = [{ from: null, groupe: 'Plus présent' }];
  assert.ok(!mailingList(s, '').includes('ancien@x.fr'));
  assert.ok(mailingList(s, '', false, { anciens: true }).includes('ancien@x.fr'));
});

test('CSV export uses ; and French decimals with a BOM for Excel', () => {
  const csv = toCsv([{ label: 'École', get: (r) => r.e }, { label: 'Heures', get: (r) => r.h }], [{ e: 'ROSALIE', h: 2.5 }]);
  assert.equal(csv, '\ufeffÉcole;Heures\r\nROSALIE;2,5');
});

test('bilan averages only count days up to today (future planned P excluded)', () => {
  const s = miniState();
  mark(s, 'c1', 'pedibus', '2026-09-01', 'P');
  mark(s, 'c2', 'pedibus', '2026-09-01', 'P');
  mark(s, 'c1', 'pedibus', '2026-12-17', 'P'); // prévu, futur
  const b = bilan(s, '2026-09-01');
  assert.equal(b.moyennes.pedibusParJour, 2);
});

test('recap: adhésion due, documents manquants et jours collégien', () => {
  const s = miniState();
  mark(s, 'c1', 'pedibus', '2026-09-01', 'C');
  const t = norm(recapText(s, 'f1', '2026-11-13'));
  assert.match(t, /• Adhésion obligatoire \(5 € par enfant\) : dû 5,00 €/);
  assert.match(t, /Pédibus T1 \(1 j\. collégien\) : dû 1,50 €/);
  assert.match(t, /Documents à nous fournir : JULES : Vaccins ; NOAH : Fiche d'adhésion, Vaccins, Attestation Amélie \(ayant droit\)/);
});

test('mailing réservé aux adhérents utilise le statut d\'adhésion', () => {
  const s = miniState();
  s.families.f1.mails = 'f1@x.fr';
  s.families.f2.mails = 'f2@x.fr';
  assert.equal(mailingList(s, 'pedibus', true), 'f1@x.fr');
});

test('familyLabels distingue les familles homonymes par leur mail', async () => {
  const { familyLabels } = await import('../../src/core/reports.js');
  const s = miniState();
  s.families.f2.nom = 'DURAND';
  s.families.f2.mails = 'autre@x.fr';
  const l = familyLabels(s);
  assert.equal(l.f1, 'DURAND (famille.durand@example.fr)');
  assert.equal(l.f2, 'DURAND (autre@x.fr)');
});

test('synthèse CAF: heures par activité pour -6 ans, 6 ans et +, collégiens', async () => {
  const { cafSynthese } = await import('../../src/core/reports.js');
  const s = miniState();
  s.params.cafAutres = { collegienPedibus: 1, mercrediMatin: 3, mercrediAprem: 4, vacancesJournee: 8, vacancesCollegiensJournee: 7, adoSoiree: 3 };
  s.children.c1.groupes = [{ from: null, groupe: 'Collégiens' }];
  mark(s, 'c5', 'pedibus', '2026-09-08', 'P');          // BUFFON -6 mardi : 4 h
  mark(s, 'c2', 'pedibus', '2026-09-07', 'P');          // ROSALIE 6+ lundi : 2,5 h
  mark(s, 'c2', 'pedibus', '2026-09-14', 'A');          // absence payée : compte aussi (2,5 h)
  mark(s, 'c1', 'pedibus', '2026-09-07', 'C');          // collégien : 1 h
  mark(s, 'c3', 'mercredi', '2026-09-02', 'P', 'matin'); // 6+ : 3 h
  mark(s, 'c5', 'toussaint', '2026-10-19', 'P');         // -6 : 8 h
  mark(s, 'c1', 'collegiens', '2027-06-14', 'P');        // vacances collégiens : 7 h
  s.extraDates.ado = ['2026-09-25'];
  mark(s, 'c1', 'ado', '2026-09-25', 'P');               // soirée : 3 h
  const rows = cafSynthese(s, '2026-09-01', '2027-08-31');
  const r = Object.fromEntries(rows.map((x) => [x.id, x]));
  assert.deepEqual([r.pedibus.moins6.heures, r.pedibus.plus6.heures, r.pedibus.collegiens.heures], [4, 5, 1]);
  assert.equal(r.pedibus.plus6.presences, 2);
  assert.equal(r.mercredi.plus6.heures, 3);
  assert.equal(r.toussaint.moins6.heures, 8);
  assert.equal(r.collegiens.collegiens.heures, 7);
  assert.equal(r.collegiens.label, 'Vacances collégiens');
  assert.equal(r.ado.collegiens.heures, 3);
  const tot = rows.find((x) => x.id === 'total');
  assert.equal(tot.total.heures, 4 + 5 + 1 + 3 + 8 + 7 + 3);
});

test('attestation de présence: dates, jours, heures et montants réglés sur la période', async () => {
  const { attestationPresence } = await import('../../src/core/reports.js');
  const s = miniState();
  s.params.cafAutres = { mercrediMatin: 3, mercrediAprem: 4, vacancesJournee: 8 };
  mark(s, 'c3', 'pedibus', '2026-11-16', 'P');   // MARCEL lundi 6-8 ans : 2,5 h
  mark(s, 'c3', 'pedibus', '2026-11-17', 'A');   // absence : pas sur l'attestation
  mark(s, 'c3', 'mercredi', '2026-11-18', 'P', 'matin');
  mark(s, 'c3', 'mercredi', '2026-11-18', 'P', 'aprem');
  mark(s, 'c3', 'toussaint', '2026-10-19', 'P'); // hors période
  s.payments.p1 = { familyId: 'f1', date: '2026-11-20', montant: 30, mode: 'cheque', moisEncaissement: '2026-12',
    affectations: [{ poste: 'pedibus-T1', montant: 10, childId: 'c3' }, { poste: 'mercredi-T1', montant: 14, childId: 'c3' }, { poste: 'toussaint', montant: 6, childId: 'c3' }] };
  const a = attestationPresence(s, 'c3', '2026-11-01', '2026-11-30', '2026-12-01');
  assert.deepEqual(a.lignes.map((l) => [l.label, l.jours, l.heures]), [['Pédibus', 1, 2.5], ['Mercredis', 1, 7]]);
  assert.deepEqual(a.lignes[1].dates, ['mercredi 18/11/2026 (journée)']);
  assert.equal(a.totalHeures, 9.5);
  assert.deepEqual(a.montants.map((m) => [m.label, m.montant]), [['Pédibus T1', 10], ['Mercredis T1', 14]]);
  assert.equal(a.totalRegle, 24);
  assert.match(a.texte, /atteste que l’enfant NOAH DURAND, né\(e\) le 12\/03\/2020/);
  assert.match(a.texte, /du 01\/11\/2026 au 30\/11\/2026/);
});

test('mailing par tranche d\'âge (groupe en vigueur aujourd\'hui)', () => {
  const s = miniState();
  s.families.f1.mails = 'f1@x.fr';
  s.families.f2.mails = 'f2@x.fr';
  assert.equal(mailingList(s, '', false, { groupe: '3 ans', today: '2026-11-14' }), 'f2@x.fr');
  assert.equal(mailingList(s, '', false, { groupe: '4-5 ans', today: '2027-07-10' }), 'f2@x.fr');
  assert.equal(mailingList(s, '', false, { groupe: '8-10 ans', today: '2026-11-14' }), 'f1@x.fr');
});

test('AKT (absence KT payée) compte pour la CAF avec les heures du KT', async () => {
  const { cafSynthese } = await import('../../src/core/reports.js');
  const s = miniState();
  mark(s, 'c2', 'pedibus', '2026-11-12', 'AKT'); // ROSALIE jeudi, KT
  const ped = cafSynthese(s, '2026-09-01', '2027-08-31').find((x) => x.id === 'pedibus');
  assert.equal(ped.plus6.presences, 1);
  assert.equal(ped.plus6.heures, 1);
});

test('CAF détaillé: absences payées comptées pour mercredis et vacances', () => {
  const s = miniState();
  s.params.cafAutres = { mercrediMatin: 3, vacancesJournee: 8 };
  mark(s, 'c3', 'mercredi', '2026-09-02', 'A', 'matin');
  mark(s, 'c5', 'toussaint', '2026-10-19', 'A');
  const d = cafDetail(s, '2026-09-01', '2026-10-31');
  assert.equal(d.mercredi[0].matin, 1);
  assert.equal(d.vacances[0].jours, 1);
});

test('règles de fonctionnement générées avec les tarifs actuels', async () => {
  const { reglesFonctionnement } = await import('../../src/core/regles.js');
  const s = miniState();
  s.params.tarifs.pedibus = 6;
  const r = reglesFonctionnement(s.params);
  const all = norm(r.map((x) => `${x.titre}\n${x.lignes.join('\n')}`).join('\n'));
  assert.ok(r.length >= 8);
  assert.match(all, /Pédibus : 6,00 € par jour/);
  assert.match(all, /AKT/);
  assert.match(all, /3e enfant/);
  assert.match(all, /CAF/);
});
