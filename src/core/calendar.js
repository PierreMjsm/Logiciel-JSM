// Calendrier de l'année scolaire : périodes, dates d'activité, âges, groupes.
import { addDays, weekday, parseIso } from './format.js';

export const VACANCES = ['toussaint', 'noel', 'hiver', 'printemps', 'rose', 'collegiens', 'juillet', 'aout'];
export const VACANCES_LABELS = {
  toussaint: 'Toussaint', noel: 'Noël', hiver: 'Hiver', printemps: 'Printemps',
  rose: 'Rose', collegiens: 'Collégiens', juillet: 'Juillet', aout: 'Août',
};

export const ACTIVITIES = [
  { id: 'pedibus', label: 'Pédibus' },
  { id: 'mercredi', label: 'Mercredi' },
  ...VACANCES.map((id) => ({ id, label: `Vacances ${VACANCES_LABELS[id]}`, vacances: true })),
  { id: 'exceptionnel', label: 'Journées exceptionnelles' },
  { id: 'ado', label: 'Soirées ADO' },
];

export function activityLabel(id) {
  const a = ACTIVITIES.find((x) => x.id === id);
  return a ? a.label : id;
}

export function isVacances(activity) {
  return VACANCES.includes(activity);
}

export function defaultParams2026() {
  return {
    periods: [
      { id: 'T1a', label: '1er Trimestre', kind: 'ecole', trimestre: 1, start: '2026-09-01', end: '2026-10-16' },
      { id: 'toussaint', label: 'Toussaint', kind: 'vacances', start: '2026-10-19', end: '2026-11-02' },
      { id: 'T1b', label: '1er Trimestre', kind: 'ecole', trimestre: 1, start: '2026-11-02', end: '2026-12-18' },
      { id: 'noel', label: 'Noël', kind: 'vacances', start: '2026-12-21', end: '2027-01-01' },
      { id: 'T2a', label: '2ème Trimestre', kind: 'ecole', trimestre: 2, start: '2027-01-04', end: '2027-02-05' },
      { id: 'hiver', label: 'Hiver', kind: 'vacances', start: '2027-02-08', end: '2027-02-19' },
      { id: 'T2b', label: '2ème Trimestre', kind: 'ecole', trimestre: 2, start: '2027-02-22', end: '2027-04-02' },
      { id: 'printemps', label: 'Printemps', kind: 'vacances', start: '2027-04-05', end: '2027-04-16' },
      { id: 'T3', label: '3ème Trimestre', kind: 'ecole', trimestre: 3, start: '2027-04-19', end: '2027-07-02' },
      { id: 'collegiens', label: 'Collégiens', kind: 'vacances', start: '2027-06-14', end: '2027-07-02' },
      { id: 'rose', label: 'Rose', kind: 'vacances', start: '2027-06-28', end: '2027-07-02' },
      { id: 'juillet', label: 'Juillet', kind: 'vacances', start: '2027-07-05', end: '2027-07-23' },
      { id: 'aout', label: 'Août', kind: 'vacances', start: '2027-08-16', end: '2027-08-27' },
    ],
    trimestres: [
      { n: 1, start: '2026-09-01', end: '2026-12-18' },
      { n: 2, start: '2027-01-04', end: '2027-04-02' },
      { n: 3, start: '2027-04-19', end: '2027-07-02' },
    ],
    feries: ['2026-11-01', '2026-11-11', '2026-12-25', '2027-01-01', '2027-03-29', '2027-05-01',
      '2027-05-06', '2027-05-08', '2027-05-17', '2027-07-14', '2027-08-15'],
    ktStart: { mardi: '2026-09-15', jeudi: '2026-09-17' },
    tarifs: { adhesion: 5, pedibus: 5.5, kt: 5, collegien: 1.5, mercredi: 7, journee: 14, exceptionnel: 14 },
    documents: [
      { id: 'fiche', label: 'Fiche d\'adhésion' },
      { id: 'vaccins', label: 'Vaccins' },
      { id: 'amelie', label: 'Attestation Amélie (ayant droit)' },
    ],
    ecoles: ['ROSALIE', 'MARCEL', 'NDF', 'BUFFON', 'BROSSO', 'ARBALETE', 'VICTOR', 'GENEVIEVE',
      'AUTRE', 'COLLEGE', 'ARAGO', 'EPEE DE BOIS', 'NORMAN'],
    pediMercrediEcoles: ['BUFFON', 'BROSSO'],
    groupes: ['3 ans', '4-5 ans', '6-8 ans', '8-10 ans', 'Collégiens', 'Plus présent', 'en attente'],
    statuts: ['Perfect', 'Papier Adh', 'Amélie', 'Vaccin', 'Sécu & Vaccin', 'PAI', '€', 'Autre'],
    cafHeures: defaultCafHeures(),
    cafAutres: { collegienPedibus: 0, mercrediMatin: 0, mercrediAprem: 0, vacancesJournee: 0, adoSoiree: 0 },
    attestation: {
      tresorier: '', // à renseigner dans Paramètres › Attestation
      habilitation: '',
      agrement: 'L’association « Jeunes de Saint Médard » est agréée jeunesse et éducation populaire par le ministère de la jeunesse, des sports et de la vie associative (3 mars 2004)',
    },
    pdfFolder: null,
  };
}

// Heures par jour pour la CAF (feuille CAF, colonnes « heure par jour »).
function defaultCafHeures() {
  const long = { lundi: 2.5, mardi: 4, jeudi: 2.5, vendredi: 4 };
  const court = { lundi: 2.5, mardi: 2.5, jeudi: 2.5, vendredi: 2.5 };
  const kt = { lundi: 1, mardi: 2.5, jeudi: 1, vendredi: 1 };
  const out = {};
  for (const e of ['ARBALETE', 'BROSSO', 'BUFFON', 'ARAGO']) out[e] = { KT: { ...kt }, '-6': { ...long }, '6-11': { ...long } };
  for (const e of ['MARCEL', 'ROSALIE', 'NDF', 'VICTOR', 'GENEVIEVE', 'EPEE DE BOIS', 'NORMAN', 'AUTRE', 'COLLEGE']) {
    out[e] = { KT: { lundi: 1, mardi: 1, jeudi: 1, vendredi: 1 }, '-6': { ...court }, '6-11': { ...court } };
  }
  return out;
}

export function periodOf(params, iso) {
  return params.periods.find((p) => iso >= p.start && iso <= p.end) || null;
}

export function trimestreOf(params, iso) {
  const t = params.trimestres.find((x) => iso >= x.start && iso <= x.end);
  return t ? t.n : null;
}

function datesBetween(start, end, keep) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (keep(d)) out.push(d);
  return out;
}

export function activityDates(params, activity, extraDates = {}) {
  const feries = new Set(params.feries || []);
  const ok = (days) => (d) => days.includes(weekday(d)) && !feries.has(d);
  const ecole = params.periods.filter((p) => p.kind === 'ecole');
  if (activity === 'pedibus') return ecole.flatMap((p) => datesBetween(p.start, p.end, ok([1, 2, 4, 5])));
  if (activity === 'mercredi' || activity === 'pediMercredi') return ecole.flatMap((p) => datesBetween(p.start, p.end, ok([3])));
  if (isVacances(activity)) {
    const p = params.periods.find((x) => x.id === activity);
    return p ? datesBetween(p.start, p.end, ok([1, 2, 3, 4, 5])) : [];
  }
  return [...(extraDates[activity] || [])].sort();
}

export function slotsOf(activity) {
  return activity === 'mercredi' ? ['matin', 'aprem'] : [''];
}

export function ageAt(naissance, iso) {
  if (!naissance || !/^\d{4}-\d{2}-\d{2}$/.test(naissance)) return null;
  const b = parseIso(naissance), d = parseIso(iso);
  let a = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) a -= 1;
  return a;
}

export function ageLabel(naissance, iso) {
  const a = ageAt(naissance, iso);
  return a === null ? '' : `${a} ans`;
}

export function groupAt(child, iso) {
  let g = '';
  for (const e of child.groupes || []) if (!e.from || e.from <= iso) g = e.groupe;
  return g;
}

export function defaultGroupe(age) {
  if (age === null || age === undefined) return 'en attente';
  if (age <= 3) return '3 ans';
  if (age <= 5) return '4-5 ans';
  if (age <= 7) return '6-8 ans';
  if (age <= 10) return '8-10 ans';
  return 'Collégiens';
}

export function ktDay(params, iso) {
  const w = weekday(iso);
  if (w === 2 && iso >= params.ktStart.mardi) return 'mardi';
  if (w === 4 && iso >= params.ktStart.jeudi) return 'jeudi';
  return null;
}
