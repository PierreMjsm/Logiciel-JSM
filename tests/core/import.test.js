import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { importWorkbooks, detectBook } from '../../src/core/import.js';
import { familyAccount } from '../../src/core/billing.js';

const require = createRequire(import.meta.url);
const { readWorkbook } = require('../../electron/xlsx-reader.js');
const FIX = path.join(import.meta.dirname, '..', 'fixtures');
const files = fs.existsSync(FIX) ? fs.readdirSync(FIX).filter((f) => f.endsWith('.xlsm')) : [];

// Petit classeur factice : { sheets: { nom: { rows(), cell() } } }
function fakeBook(sheets) {
  const out = {};
  for (const [name, rows] of Object.entries(sheets)) {
    out[name] = { rows: () => rows, cell: () => null };
  }
  return { sheets: out };
}
const contactRow = (nom, prenom, extra = {}) => {
  const r = [];
  r[0] = extra.groupe || '6-8 ans'; r[1] = !!extra.adh; r[2] = nom; r[3] = prenom; r[5] = extra.naissance || '2019-01-01';
  r[6] = extra.ecole || 'ROSALIE'; r[7] = extra.mail || `${nom.toLowerCase()}@x.fr`; r[12] = true;
  return r;
};

test('duplicate names are kept separate and reported', () => {
  const rows = [[], [], [], [], [], [], ['Tranche d\'âge', 'Adh', 'Nom', 'Prénom'],
    contactRow('DUPONT', 'LEO'), contactRow('DUPONT', 'LEO', { naissance: '2017-05-05' }), contactRow('MARTIN', 'ZOE *')];
  const contact = fakeBook({ 'général': rows });
  const { base, report } = importWorkbooks({ contact });
  assert.equal(Object.keys(base.children).length, 3);
  assert.equal(report.ambiguous.length, 1);
  assert.match(report.ambiguous[0], /DUPONT LEO/);
  const zoe = Object.values(base.children).find((c) => c.prenom === 'ZOE');
  assert.equal(zoe.pai, true, 'star in prénom means PAI');
});

test('detectBook recognises workbooks by their sheets', () => {
  assert.equal(detectBook(fakeBook({ 'général': [], PageJaune: [] })), 'contact');
  assert.equal(detectBook(fakeBook({ Pedibus: [], KT: [] })), 'pedibus');
  assert.equal(detectBook(fakeBook({ 'Remise chèque': [] })), 'cheque');
});

test('real workbooks: children, presences by name and payments', { skip: files.length < 8 }, () => {
  const books = {};
  for (const f of files) { const wb = readWorkbook(path.join(FIX, f)); const k = detectBook(wb); if (k) books[k] = wb; }
  assert.deepEqual(Object.keys(books).sort(), ['ado', 'caf', 'cheque', 'compta', 'contact', 'mercredi', 'pedibus', 'vacances']);
  const { base, report } = importWorkbooks(books);
  assert.ok(Object.keys(base.children).length >= 300);
  const ray = Object.entries(base.children).find(([, c]) => c.prenom === 'RAYAN' && base.families[c.familyId].nom === 'AJAMRI');
  assert.ok(ray, 'AJAMRI RAYAN imported');
  const ped = books.pedibus.sheets.Pedibus.rows();
  const rowIdx = ped.findIndex((r) => r && r[1] === 'AJAMRI' && r[2] === 'RAYAN');
  const col = ped[rowIdx].findIndex((v, c) => c >= 7 && /^[PA]$/i.test(String(v)));
  assert.ok(col > 0, 'RAYAN has at least one P/A in Pédibus');
  assert.equal(base.presences[`${ray[0]}|pedibus|${ped[12][col]}|`], String(ped[rowIdx][col]).toUpperCase());
  assert.ok(report.presences > 10000);
  assert.ok(report.payments > 50);
  const fam = familyAccount(base, ray[1].familyId, '2026-11-13');
  assert.ok(fam.du > 0);
  assert.ok(Array.isArray(report.unmatched));
});

test('a child with an empty nom but a prénom is still imported and matched', () => {
  const rows = [[], [], [], [], [], [], ['x'], contactRow('', 'ANAE', { mail: 'anae@x.fr' })];
  const ped = [];
  ped[12] = []; ped[12][7] = '2026-09-01';
  ped[13] = ['Tranche', 'Nom', 'Prenom'];
  ped[14] = ['6-8 ans', '', 'ANAE', '', '', '', false, 'P'];
  const { base } = importWorkbooks({ contact: fakeBook({ 'général': rows }), pedibus: fakeBook({ Pedibus: ped }) });
  const [id] = Object.keys(base.children);
  assert.equal(base.children[id].prenom, 'ANAE');
  assert.equal(base.presences[`${id}|pedibus|2026-09-01|`], 'P');
});

test('a sheet row whose nom is blank is matched by prénom and row position', () => {
  const rows = [[], [], [], [], [], [], ['x'], contactRow('LEROY', 'ANAE'), contactRow('CHAN', 'ANAE')];
  const ped = [];
  ped[12] = []; ped[12][7] = '2026-09-01';
  ped[13] = ['Tranche', 'Nom', 'Prenom'];
  ped[14] = ['6-8 ans', 'LEROY', 'ANAE', '', '', '', false, 'P'];
  ped[15] = ['6-8 ans', '', 'ANAE', '', '', '', false, 'A'];
  const { base, report } = importWorkbooks({ contact: fakeBook({ 'général': rows }), pedibus: fakeBook({ Pedibus: ped }) });
  const chan = Object.entries(base.children).find(([, c]) => base.families[c.familyId].nom === 'CHAN')[0];
  assert.equal(base.presences[`${chan}|pedibus|2026-09-01|`], 'A');
  assert.equal(report.unmatched.length, 0);
});

test('familles homonymes: BERNARD et BERNARD3 restent deux familles distinctes, affichées BERNARD', () => {
  const rows = [[], [], [], [], [], [], ['x'],
    contactRow('BERNARD', 'ALICE', { mail: 'a@x.fr' }), contactRow('BERNARD3', 'PAUL', { mail: 'p@y.fr' }), contactRow('BERNARD3', 'GABRIEL', { mail: 'p@y.fr' })];
  const { base } = importWorkbooks({ contact: fakeBook({ 'général': rows }) });
  const fams = Object.values(base.families);
  assert.equal(fams.length, 2);
  assert.deepEqual(fams.map((f) => f.nom), ['BERNARD', 'BERNARD']);
});

test('frères et sœurs avec des mails écrits différemment restent dans la même famille', () => {
  const r1 = contactRow('ARTUPHEL', 'SAREN', { mail: 'maman@x.fr ; papa@y.fr' });
  const r2 = contactRow('ARTUPHEL', 'ADEN', { mail: 'papa@y.fr' });
  const { base } = importWorkbooks({ contact: fakeBook({ 'général': [[], [], [], [], [], [], ['x'], r1, r2] }) });
  assert.equal(Object.keys(base.families).length, 1);
});

test('adhésion et documents repris de Contact; le montant banque fait foi', () => {
  const a = contactRow('LEROY', 'ANAE', { adh: true }); a[11] = 'Sécu & Vaccin';
  const b = contactRow('LEROY', 'TOM'); b[12] = true;
  const contact = fakeBook({ 'général': [[], [], [], [], [], [], ['x'], a, b] });
  const compta = [[], [], [], [], [], [], [], [], []];
  compta[7] = ['6-8 ans', 'LEROY', 'ANAE']; compta[7][10] = 30;            // Pédibus T1 réel 30 €
  compta[8] = ['6-8 ans', 'LEROY', 'TOM']; compta[8][10] = 20;             // Pédibus T1 réel 20 €
  const cheque = [[], [], [], [], [], [], ['adh', 'Nom', 'Prenom']];
  cheque[7] = [false, 'LEROY', 'ANAE']; cheque[7][9] = 40;                // 40 € remis en octobre
  const { base } = importWorkbooks({ contact, compta: fakeBook({ 'général': compta, 'Suivi Paiements': [] }), cheque: fakeBook({ 'Remise chèque': cheque }) });
  const kids = Object.entries(base.children);
  const anae = kids.find(([, c]) => c.prenom === 'ANAE')[1];
  assert.equal(anae.adhesionDejaReglee, true);
  assert.deepEqual(anae.documents, { fiche: true, vaccins: false, amelie: false });
  const pays = Object.values(base.payments);
  assert.equal(pays.length, 1, 'pas de règlement inventé au-delà de la banque');
  assert.equal(pays[0].montant, 40);
  assert.equal(pays[0].childId, '', 'la famille paie, pas l\'enfant');
  assert.equal(pays[0].moisEncaissement, '2026-10');
  assert.deepEqual(pays[0].affectations.map((x) => [x.poste, x.montant]), [['pedibus-T1', 30], ['pedibus-T1', 10]]);
});
