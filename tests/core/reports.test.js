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
  assert.match(t, /• Total dû pour la famille : 21,00 €/);
  assert.match(t, /• Total déjà réglé par vos soins : 9,00 €/);
  assert.match(t, /⚠️ RESTE À PAYER : ► 12,00 € ◄/);
  assert.match(t, /Katell et Pierre — Les Jeunes de Saint-Médard$/);
});

test('recap text: à jour and trop-perçu variants', () => {
  const s = miniState();
  s.children.c1.adhesionDejaReglee = true;
  assert.match(recapText(s, 'f1', '2026-11-13'), /✅ Dossier complet/);
  s.payments.p1 = { familyId: 'f1', date: '2026-09-20', montant: 5, mode: 'especes', affectations: [] };
  assert.match(norm(recapText(s, 'f1', '2026-11-13')), /💰 TROP-PERÇU : La famille a réglé 5,00 € de trop/);
});

test('mailto url encodes subject and body', () => {
  assert.equal(mailtoUrl('a@b.fr', 'Récap', 'x y'), 'mailto:a%40b.fr?subject=R%C3%A9cap&body=x%20y');
});

test('mailing list dedupes and splits multiple addresses', () => {
  const s = miniState();
  const m = mailingList(s, 'pedibus');
  assert.equal(m, 'famille.durand@example.fr; b@y.fr');
});

test('CAF Pédibus: only real presences (P) count, absences (A) do not', () => {
  const s = miniState();
  s.children.c2.groupes = [{ from: null, groupe: '6-8 ans' }];
  mark(s, 'c2', 'pedibus', '2026-09-07', 'P');
  mark(s, 'c2', 'pedibus', '2026-09-14', 'A');
  mark(s, 'c5', 'pedibus', '2026-09-08', 'P'); // BUFFON 3 ans mardi
  const rows = cafStats(s, '2026-09-01', '2026-09-30');
  const r = rows.find((x) => x.ecole === 'ROSALIE' && x.categorie === '6-11');
  assert.equal(r.byDay.lundi.presences, 1);
  assert.equal(r.byDay.lundi.heures, 2.5);
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
  assert.deepEqual(d.vacances.map((r) => [r.periode, r.categorie, r.jours, r.heures]), [['toussaint', '-6', 1, 8]]);
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
