// Ajout d'enfants et de familles depuis un fichier (modèle Excel ou CSV, export de formulaire…).
import { ageAt, defaultGroupe } from './calendar.js';

export const MODELE_COLONNES = [
  { id: 'nom', label: 'Nom de famille', alias: ['nom', 'nom de famille', 'nom enfant', 'nom de l\'enfant'] },
  { id: 'prenom', label: 'Prénom', alias: ['prenom', 'prenom enfant', 'prenom de l\'enfant'] },
  { id: 'naissance', label: 'Date de naissance', alias: ['naissance', 'date de naissance', 'ne le', 'nee le', 'ne(e) le'] },
  { id: 'ecole', label: 'École', alias: ['ecole'] },
  { id: 'groupe', label: 'Groupe (facultatif)', alias: ['groupe', 'tranche d\'age', 'tranche', 'groupe (facultatif)'] },
  { id: 'mails', label: 'Mail(s) des parents', alias: ['mail', 'mails', 'mail(s)', 'email', 'e-mail', 'adresse mail', 'mail(s) des parents', 'courriel'] },
  { id: 'adresse', label: 'Adresse', alias: ['adresse', 'adresse postale'] },
  { id: 'telMaman', label: 'Téléphone maman', alias: ['telephone maman', 'tel maman', 'telephone n°1', 'telephone 1', 'telephone n°1 m', 'telephone'] },
  { id: 'telPapa', label: 'Téléphone papa', alias: ['telephone papa', 'tel papa', 'telephone n°2', 'telephone 2', 'telephone n°2 p'] },
  { id: 'adhesion', label: 'Adhésion réglée', alias: ['adhesion reglee', 'adhesion', 'adh', 'adherent'] },
  { id: 'pai', label: 'PAI', alias: ['pai'] },
  { id: 'fiche', label: 'Fiche d\'adhésion', alias: ['fiche d\'adhesion', 'fiche', 'papier adh'] },
  { id: 'vaccins', label: 'Vaccins', alias: ['vaccins', 'vaccin'] },
  { id: 'amelie', label: 'Attestation Amélie', alias: ['attestation amelie', 'amelie', 'ayant droit', 'secu'] },
  { id: 'pedibus', label: 'Pédibus', alias: ['pedibus'] },
  { id: 'ktMardi', label: 'KT mardi', alias: ['kt mardi', 'kt mar'] },
  { id: 'ktJeudi', label: 'KT jeudi', alias: ['kt jeudi', 'kt jeu'] },
  { id: 'mercredi', label: 'Mercredi', alias: ['mercredi', 'mercredis'] },
  { id: 'pediMercredi', label: 'Pédibus mercredi', alias: ['pedibus mercredi', 'mercredipedi'] },
  { id: 'toussaint', label: 'Toussaint', alias: ['toussaint'] },
  { id: 'noel', label: 'Noël', alias: ['noel'] },
  { id: 'hiver', label: 'Hiver', alias: ['hiver'] },
  { id: 'printemps', label: 'Printemps', alias: ['printemps', 'printe'] },
  { id: 'rose', label: 'Rose', alias: ['rose'] },
  { id: 'juillet', label: 'Juillet', alias: ['juillet'] },
  { id: 'aout', label: 'Août', alias: ['aout'] },
  { id: 'collegiens', label: 'Collégiens', alias: ['collegiens', 'vacances collegiens'] },
  { id: 'exceptionnel', label: 'Journées exceptionnelles', alias: ['journees exceptionnelles', 'exceptionnel', 'exceptio'] },
  { id: 'ado', label: 'ADO', alias: ['ado', 'soirees ado'] },
];
const INSCRIPTIONS = ['pedibus', 'ktMardi', 'ktJeudi', 'mercredi', 'pediMercredi', 'toussaint', 'noel', 'hiver', 'printemps', 'rose', 'juillet', 'aout', 'collegiens', 'exceptionnel', 'ado'];

const plain = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const upper = (s) => String(s ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const YES = new Set(['oui', 'o', 'x', 'yes', 'y', 'vrai', 'true', '1', '✓', '✔', 'ok', 'fait']);
const yes = (v) => v === true || YES.has(plain(v));

export function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && v > 1000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? (Number(m[3]) > 50 ? `19${m[3]}` : `20${m[3]}`) : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function phone(v) {
  if (typeof v === 'number') { const s = String(v); return s.length === 9 ? `0${s}` : s; }
  return String(v ?? '').trim();
}

// rows : tableau de lignes (la première non vide contient les en-têtes).
export function parseChildRows(rows) {
  const erreurs = [];
  const hi = rows.findIndex((r) => r && r.some((c) => String(c ?? '').trim()));
  if (hi < 0) return { enfants: [], erreurs: ['Le fichier est vide.'] };
  const col = {};
  rows[hi].forEach((h, i) => {
    const p = plain(h).replace(/[?:]$/, '').trim();
    const c = MODELE_COLONNES.find((x) => plain(x.label) === p || x.alias.includes(p));
    if (c && col[c.id] === undefined) col[c.id] = i;
  });
  if (col.nom === undefined || col.prenom === undefined) return { enfants: [], erreurs: ['Colonnes « Nom de famille » et « Prénom » introuvables : utilisez le modèle.'] };
  const enfants = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const R = rows[r] || [];
    const get = (id) => (col[id] === undefined ? '' : R[col[id]]);
    if (!R.some((c) => String(c ?? '').trim())) continue;
    const nom = upper(get('nom')), prenomRaw = String(get('prenom') ?? '');
    if (nom === 'EXEMPLE') continue; // ligne d'exemple du modèle
    if (!nom || !prenomRaw.trim()) { erreurs.push(`ligne ${r + 1} : nom ou prénom manquant (ignorée)`); continue; }
    const naissance = parseDate(get('naissance'));
    if (get('naissance') !== '' && get('naissance') !== null && get('naissance') !== undefined && !naissance) erreurs.push(`ligne ${r + 1} : date de naissance illisible « ${get('naissance')} »`);
    const inscriptions = {};
    for (const k of INSCRIPTIONS) inscriptions[k] = yes(get(k));
    enfants.push({
      ligne: r + 1, nom, prenom: upper(prenomRaw), naissance, ecole: upper(get('ecole')), groupe: String(get('groupe') ?? '').trim(),
      mails: String(get('mails') ?? '').trim(), adresse: String(get('adresse') ?? '').trim(), telMaman: phone(get('telMaman')), telPapa: phone(get('telPapa')),
      adhesionDejaReglee: yes(get('adhesion')), pai: yes(get('pai')) || /\*/.test(prenomRaw),
      documents: { fiche: yes(get('fiche')), vaccins: yes(get('vaccins')), amelie: yes(get('amelie')) },
      inscriptions,
    });
  }
  return { enfants, erreurs };
}

function famKeys(f) {
  const mails = String(f.mails || '').toLowerCase().split(/[;,\s]+/).filter((m) => m.includes('@')).map((m) => `m:${m}`);
  const tels = [f.telMaman, f.telPapa].map((t) => String(t || '').replace(/\D/g, '')).filter((t) => t.length >= 9).map((t) => `t:${t}`);
  const adr = plain(f.adresse).length > 8 ? [`a:${plain(f.adresse)}`] : [];
  return [...mails, ...tels, ...adr];
}

// Prépare les modifications : nouvelles familles, nouveaux enfants ; ignore les enfants déjà présents.
export function planAjout(state, enfants, newId, startIso = '2026-09-01') {
  const changes = [];
  const dejaPresents = [];
  const known = new Map(); // plain(nom)|clé -> familyId
  for (const [id, f] of Object.entries(state.families)) for (const k of famKeys(f)) known.set(`${plain(f.nom)}|${k}`, id);
  const existingKids = new Set(Object.values(state.children).map((c) => `${plain((state.families[c.familyId] || {}).nom)}|${plain(c.prenom)}`));
  const existingKidsBirth = new Set(Object.values(state.children).map((c) => `${plain((state.families[c.familyId] || {}).nom)}|${plain(c.prenom)}|${c.naissance || ''}`));
  let nouvellesFamilles = 0, nouveauxEnfants = 0;
  for (const e of enfants) {
    const kid = `${plain(e.nom)}|${plain(e.prenom)}`;
    if (existingKidsBirth.has(`${kid}|${e.naissance || ''}`) || (!e.naissance && existingKids.has(kid))) { dejaPresents.push(`${e.nom} ${e.prenom}`); continue; }
    const keys = famKeys(e);
    let familyId = keys.map((k) => known.get(`${plain(e.nom)}|${k}`)).find(Boolean);
    if (!familyId && !keys.length) familyId = known.get(`${plain(e.nom)}|sans-contact`);
    if (!familyId) {
      familyId = newId('f');
      nouvellesFamilles += 1;
      changes.push([['families', familyId], { nom: e.nom, nomCheque: '', mails: e.mails, adresse: e.adresse, telMaman: e.telMaman, telPapa: e.telPapa }]);
      if (!keys.length) known.set(`${plain(e.nom)}|sans-contact`, familyId);
    }
    for (const k of keys) known.set(`${plain(e.nom)}|${k}`, familyId);
    const groupe = e.groupe || defaultGroupe(ageAt(e.naissance, startIso));
    changes.push([['children', newId('c')], {
      familyId, prenom: e.prenom, naissance: e.naissance, groupes: [{ from: null, groupe }], ecole: e.ecole,
      adhesionDejaReglee: e.adhesionDejaReglee, statut: '', pai: e.pai, documents: e.documents, inscriptions: e.inscriptions,
    }]);
    existingKidsBirth.add(`${kid}|${e.naissance || ''}`);
    nouveauxEnfants += 1;
  }
  return { changes, nouvellesFamilles, nouveauxEnfants, dejaPresents };
}

// Analyse simple d'un CSV (séparateur ; ou , ; guillemets gérés).
export function parseCsv(text) {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
