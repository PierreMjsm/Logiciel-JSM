// Facturation : dû par enfant et par poste, remise fratrie, règlements, banque.
import { trimestreOf, isVacances, VACANCES, VACANCES_LABELS } from './calendar.js';
import { round2 } from './format.js';

export const POSTES = [
  ['adhesion', 'Adhésion'],
  ['pedibus-T1', 'Pédibus T1'], ['pedibus-T2', 'Pédibus T2'], ['pedibus-T3', 'Pédibus T3'],
  ['mercredi-T1', 'Mercredis T1'], ['mercredi-T2', 'Mercredis T2'], ['mercredi-T3', 'Mercredis T3'],
  ...VACANCES.map((v) => [v, `Vacances ${VACANCES_LABELS[v]}`]),
  ['exceptionnel', 'Journées exceptionnelles'],
  ['a-repartir', 'À répartir'],
];
const POSTE_LABEL = Object.fromEntries(POSTES);
const POSTE_ORDER = Object.fromEntries(POSTES.map(([id], i) => [id, i]));
export const posteLabel = (id) => POSTE_LABEL[id] || id;

const BILLED = new Set(['P', 'A']);

export function parseKey(key) {
  const [childId, activity, date, slot] = key.split('|');
  return { childId, activity, date, slot: slot || '' };
}

export function presenceKey(childId, activity, date, slot = '') {
  return `${childId}|${activity}|${date}|${slot}`;
}

// Index des présences par enfant (mis en cache sur l'objet presences).
const cache = new WeakMap();
export function presencesByChild(state) {
  const pres = state.presences || {};
  const rev = state._rev || 0;
  let idx = cache.get(pres);
  if (idx && idx.rev === rev && rev !== 0) return idx.map;
  const map = new Map();
  for (const [k, v] of Object.entries(pres)) {
    const e = parseKey(k);
    e.value = v;
    if (!map.has(e.childId)) map.set(e.childId, []);
    map.get(e.childId).push(e);
  }
  cache.set(pres, { rev, map });
  return map;
}

export function familyChildren(state, familyId) {
  return Object.entries(state.children || {}).filter(([, c]) => c.familyId === familyId).map(([id]) => id);
}

export function fratrieDiscounts(state, familyId) {
  const kids = familyChildren(state, familyId);
  const byPres = presencesByChild(state);
  const groups = new Map();
  for (const cid of kids) {
    for (const e of byPres.get(cid) || []) {
      if (!BILLED.has(e.value)) continue;
      if (e.activity !== 'mercredi' && !isVacances(e.activity)) continue;
      const g = `${e.activity}|${e.date}|${e.slot}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(cid);
    }
  }
  const out = new Set();
  for (const [g, ids] of groups) {
    if (ids.length < 3) continue;
    const sorted = [...ids].sort((a, b) => {
      const na = state.children[a].naissance || '0000', nb = state.children[b].naissance || '0000';
      return na < nb ? 1 : na > nb ? -1 : a < b ? -1 : 1;
    });
    for (const cid of sorted.slice(0, ids.length - 2)) out.add(`${cid}|${g}`);
  }
  return out;
}

// Pédibus et mercredis ne sont facturés que les jours d'école (hors vacances et fériés).
export function isSchoolDay(params, iso) {
  if ((params.feries || []).includes(iso)) return false;
  return params.periods.some((p) => p.kind === 'ecole' && iso >= p.start && iso <= p.end);
}

function posteOf(params, e) {
  if (e.activity === 'pedibus' || e.activity === 'mercredi') {
    if (!isSchoolDay(params, e.date)) return null;
    const t = trimestreOf(params, e.date);
    return t ? `${e.activity}-T${t}` : null;
  }
  if (isVacances(e.activity)) return e.activity;
  if (e.activity === 'exceptionnel') return 'exceptionnel';
  return null; // pédibus mercredi et ADO : non facturés séparément
}

export function childPostes(state, childId, discounts) {
  const child = state.children[childId];
  if (!child) return [];
  const tarifs = state.params.tarifs;
  const disc = discounts || fratrieDiscounts(state, child.familyId);
  const acc = new Map();
  const get = (poste) => {
    if (!acc.has(poste)) acc.set(poste, { poste, label: posteLabel(poste), jours: 0, ktJours: 0, cJours: 0, demiTarif: 0, du: 0 });
    return acc.get(poste);
  };
  if (isActive(state, childId) && !child.adhesionDejaReglee) get('adhesion').du += tarifs.adhesion;
  for (const e of presencesByChild(state).get(childId) || []) {
    const poste = posteOf(state.params, e);
    if (!poste) continue;
    if (e.activity === 'pedibus') {
      if (e.value === 'KT') { const p = get(poste); p.ktJours += 1; p.du += tarifs.kt; }
      else if (e.value === 'C') { const p = get(poste); p.cJours += 1; p.du += tarifs.collegien ?? 1.5; }
      else if (BILLED.has(e.value)) { const p = get(poste); p.jours += 1; p.du += tarifs.pedibus; }
      continue;
    }
    if (!BILLED.has(e.value)) continue;
    const p = get(poste);
    p.jours += 1;
    const prix = e.activity === 'mercredi' ? tarifs.mercredi : e.activity === 'exceptionnel' ? tarifs.exceptionnel : tarifs.journee;
    const half = disc.has(`${childId}|${e.activity}|${e.date}|${e.slot}`);
    if (half) p.demiTarif += 1;
    p.du += half ? prix / 2 : prix;
  }
  return [...acc.values()]
    .map((p) => ({ ...p, du: round2(p.du) }))
    .filter((p) => p.du > 0)
    .sort((a, b) => POSTE_ORDER[a.poste] - POSTE_ORDER[b.poste]);
}

// Un enfant est « actif » s'il est inscrit à une activité ou noté présent au moins une fois.
export function isActive(state, childId) {
  const c = state.children[childId];
  if (!c) return false;
  if (Object.values(c.inscriptions || {}).some(Boolean)) return true;
  return (presencesByChild(state).get(childId) || []).some((e) => ['P', 'A', 'KT', 'C'].includes(e.value));
}

// Adhésion : 'reglee' (déjà réglée avant le logiciel, ou règlement affecté), 'due', ou 'inactif'.
export function adhesionStatus(state, childId) {
  const c = state.children[childId];
  if (!c) return 'inactif';
  if (c.adhesionDejaReglee) return 'reglee';
  let paid = 0;
  for (const p of Object.values(state.payments || {})) {
    if (p.familyId !== c.familyId) continue;
    for (const a of p.affectations || []) if (a.poste === 'adhesion' && (a.childId || p.childId) === childId) paid += Number(a.montant) || 0;
  }
  if (paid + 0.005 >= state.params.tarifs.adhesion) return 'reglee';
  return isActive(state, childId) ? 'due' : 'inactif';
}

export function documentsManquants(state, childId) {
  const c = state.children[childId] || {};
  return (state.params.documents || []).filter((d) => !(c.documents || {})[d.id]).map((d) => d.label);
}
export function dossierComplet(state, childId) { return documentsManquants(state, childId).length === 0; }

export function familyPayments(state, familyId) {
  return Object.entries(state.payments || {}).filter(([, p]) => p.familyId === familyId).map(([id, p]) => ({ id, ...p }));
}

export function enBanqueAt(payment, iso) {
  if (payment.mode !== 'cheque') return (payment.date || '') <= iso;
  if (payment.remis) return true;
  return !!payment.moisEncaissement && payment.moisEncaissement <= iso.slice(0, 7);
}

export function familyAccount(state, familyId, todayIso) {
  const disc = fratrieDiscounts(state, familyId);
  const rows = new Map();
  for (const cid of familyChildren(state, familyId)) {
    for (const p of childPostes(state, cid, disc)) {
      rows.set(`${cid}|${p.poste}`, { childId: cid, poste: p.poste, label: p.label, jours: p.jours, ktJours: p.ktJours, cJours: p.cJours, demiTarif: p.demiTarif, du: p.du, regle: 0 });
    }
  }
  const pays = familyPayments(state, familyId);
  let regle = 0, enBanque = 0;
  for (const pay of pays) {
    regle += Number(pay.montant) || 0;
    if (enBanqueAt(pay, todayIso)) enBanque += Number(pay.montant) || 0;
    for (const a of pay.affectations || []) {
      const cid = a.childId || pay.childId || '';
      const k = `${cid}|${a.poste}`;
      if (!rows.has(k)) rows.set(k, { childId: cid, poste: a.poste, label: posteLabel(a.poste), jours: 0, ktJours: 0, cJours: 0, demiTarif: 0, du: 0, regle: 0 });
      rows.get(k).regle += Number(a.montant) || 0;
    }
  }
  const postes = [...rows.values()].map((r) => ({ ...r, regle: round2(r.regle), reste: round2(r.du - r.regle) }));
  const du = round2(postes.reduce((s, r) => s + r.du, 0));
  regle = round2(regle);
  return { du, regle, solde: round2(regle - du), enBanque: round2(enBanque), postes, payments: pays };
}

export function familyStatus(solde) {
  if (Math.abs(solde) < 0.005) return 'À jour';
  return solde > 0 ? 'Trop-perçu' : 'Impayé';
}

export function encaissementMonth(p) {
  return p.mode === 'cheque' ? (p.moisEncaissement || (p.date || '').slice(0, 7)) : (p.date || '').slice(0, 7);
}

export function encaissementPlan(state) {
  const byFam = new Map();
  const months = new Set();
  const totals = {};
  for (const p of Object.values(state.payments || {})) {
    const m = encaissementMonth(p);
    if (!m) continue;
    months.add(m);
    if (!byFam.has(p.familyId)) byFam.set(p.familyId, { familyId: p.familyId, byMonth: {}, total: 0 });
    const r = byFam.get(p.familyId);
    r.byMonth[m] = round2((r.byMonth[m] || 0) + Number(p.montant || 0));
    r.total = round2(r.total + Number(p.montant || 0));
    totals[m] = round2((totals[m] || 0) + Number(p.montant || 0));
  }
  return { months: [...months].sort(), rows: [...byFam.values()], totals };
}
