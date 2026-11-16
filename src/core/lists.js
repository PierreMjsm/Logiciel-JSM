// Listes papier du jour : Pédibus par école (+ KT), Mercredi, Vacances, etc.
import { ageLabel, groupAt, ktDay, VACANCES, VACANCES_LABELS, activityDates } from './calendar.js';
import { weekday } from './format.js';
import { nomEnfant } from './noms.js';

const COLS = ['#', 'Nom', 'Prénom', 'Âge', 'Présent ?'];
const COLS_VAC = ['#', 'Nom', 'Prénom', 'Âge', 'Présent ?', 'Sortie ?'];

// tri : 'age' (du plus jeune au plus âgé, par défaut), 'nom' (alphabétique) ou 'ecole' (école puis nom).
const parNom = (a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr');
const TRIS = {
  age: (a, b) => (a.naissance === b.naissance ? a.nom.localeCompare(b.nom, 'fr') : a.naissance < b.naissance ? 1 : -1),
  nom: parNom,
  ecole: (a, b) => (a.ecole || '~').localeCompare(b.ecole || '~', 'fr') || parNom(a, b),
};
function rowsFor(state, iso, entries, tri = 'age') {
  const rows = entries.map(({ childId, value }) => {
    const c = state.children[childId];
    return {
      childId,
      nom: nomEnfant(state, c),
      prenom: `${c.prenom || ''}${c.pai ? ' *' : ''}`,
      age: ageLabel(c.naissance, iso),
      naissance: c.naissance || '',
      ecole: c.ecole || '',
      groupe: groupAt(c, iso),
      kt: value === 'KT',
    };
  });
  rows.sort(TRIS[tri] || TRIS.age);
  return rows.map((r, i) => ({ ...r, n: i + 1 }));
}

function entriesOn(state, activity, iso, slot, values) {
  const out = [];
  for (const [k, v] of Object.entries(state.presences || {})) {
    if (!values.includes(v)) continue;
    const [childId, act, date, sl] = k.split('|');
    if (act === activity && date === iso && (sl || '') === slot && state.children[childId]) out.push({ childId, value: v });
  }
  return out;
}

function byKey(state, iso, entries, keyFn) {
  const m = new Map();
  for (const e of entries) {
    const k = keyFn(state.children[e.childId], iso);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e);
  }
  return m;
}

function orderedGroups(state, map) {
  const order = state.params.groupes || [];
  return [...map.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

function make(kind, title, iso, columns, rows, extra = {}) {
  return { kind, title, date: iso, columns, rows, count: rows.length, ...extra };
}

export function dailyLists(state, iso, { tri = 'age' } = {}) {
  const p = state.params;
  const lists = [];
  const wd = weekday(iso);
  const inEcole = p.periods.some((x) => x.kind === 'ecole' && iso >= x.start && iso <= x.end) && !p.feries.includes(iso);

  // Pédibus (lundi, mardi, jeudi, vendredi)
  if (inEcole && [1, 2, 4, 5].includes(wd)) {
    const entries = entriesOn(state, 'pedibus', iso, '', ['P', 'KT', 'C']);
    const bySchool = byKey(state, iso, entries, (c) => c.ecole || 'AUTRE');
    const ecoles = [...p.ecoles, ...[...bySchool.keys()].filter((e) => !p.ecoles.includes(e))];
    for (const e of ecoles) {
      if (!bySchool.has(e)) continue;
      lists.push(make('pedibus', `LISTE PRÉSENCE PÉDIBUS — ${e}`, iso, COLS, rowsFor(state, iso, bySchool.get(e), tri), { ecole: e }));
    }
    const kd = ktDay(p, iso);
    const kts = entries.filter((x) => x.value === 'KT');
    if (kd && kts.length) {
      lists.push(make('kt', `KT ${kd.toUpperCase()}`, iso, ['#', 'Nom', 'Prénom', 'Âge', 'École', 'Présent ?'], rowsFor(state, iso, kts, tri)));
    }
  }

  // Mercredi
  if (inEcole && wd === 3) {
    // Pédibus mercredi : enfants inscrits au pédibus mercredi et présents le matin.
    const pm = entriesOn(state, 'mercredi', iso, 'matin', ['P']).filter((x) => (state.children[x.childId].inscriptions || {}).pediMercredi);
    const bySchool = byKey(state, iso, pm, (c) => c.ecole || 'AUTRE');
    for (const e of [...p.pediMercrediEcoles, ...[...bySchool.keys()].filter((x) => !p.pediMercrediEcoles.includes(x))]) {
      if (bySchool.has(e)) lists.push(make('pediMercredi', `PÉDIBUS MERCREDI — ${e}`, iso, COLS, rowsFor(state, iso, bySchool.get(e), tri), { ecole: e }));
    }
    const matin = entriesOn(state, 'mercredi', iso, 'matin', ['P']);
    const aprem = entriesOn(state, 'mercredi', iso, 'aprem', ['P']);
    const apremIds = new Set(aprem.map((x) => x.childId));
    const journee = matin.filter((x) => apremIds.has(x.childId));
    for (const [label, ents] of [['matin', matin], ['après-midi', aprem], ['journée', journee]]) {
      const g = byKey(state, iso, ents, groupAt);
      for (const k of orderedGroups(state, g)) lists.push(make('mercredi', `Mercredi ${label} — ${k}`, iso, COLS, rowsFor(state, iso, g.get(k), tri), { groupe: k, slot: label }));
    }
  }

  // Vacances (une ou plusieurs périodes ce jour-là)
  for (const v of VACANCES) {
    const per = p.periods.find((x) => x.id === v);
    if (!per || iso < per.start || iso > per.end) continue;
    const ents = entriesOn(state, v, iso, '', ['P']);
    const g = byKey(state, iso, ents, groupAt);
    for (const k of orderedGroups(state, g)) {
      lists.push(make('vacances', `Liste de présence : ${VACANCES_LABELS[v]} — ${k}`, iso, COLS_VAC, rowsFor(state, iso, g.get(k), tri), { groupe: k, periode: v }));
    }
  }

  // Journées exceptionnelles et soirées ADO
  for (const [act, label] of [['exceptionnel', 'Journée exceptionnelle'], ['ado', 'Soirée collégiens']]) {
    if (!activityDates(p, act, state.extraDates || {}).includes(iso)) continue;
    const ents = entriesOn(state, act, iso, '', ['P']);
    const g = byKey(state, iso, ents, groupAt);
    for (const k of orderedGroups(state, g)) lists.push(make(act, `${label} — ${k}`, iso, act === 'ado' ? COLS : COLS_VAC, rowsFor(state, iso, g.get(k), tri), { groupe: k }));
  }
  return lists;
}

export function pdfFileName(iso, kind) {
  const [y, m, d] = iso.split('-');
  return `${kind} ${d}-${m}-${y}.pdf`;
}
