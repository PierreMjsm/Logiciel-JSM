// Années scolaires où l'enfant est venu : celles déjà notées (années précédentes) + l'année en cours s'il y a une présence.
const VENU = ['P', 'A', 'KT', 'AKT', 'C'];

// venus : ensemble des enfants venus cette année (enfantsVenus), à passer quand on calcule pour toute une liste.
export function anneesPresence(state, childId, venus = null) {
  const c = state.children[childId] || {};
  const set = new Set((c.annees || []).filter(Boolean));
  if ((venus || enfantsVenus(state)).has(childId)) set.add(state.year);
  return [...set].sort();
}

export function enfantsVenus(state) {
  const out = new Set();
  for (const [k, v] of Object.entries(state.presences || {})) if (VENU.includes(v)) out.add(k.slice(0, k.indexOf('|')));
  return out;
}

// « 2025-2026, 2026-2027 » → tableau (saisie à la main dans la fiche).
export function lireAnnees(texte) {
  return [...new Set(String(texte || '').match(/\d{4}\s*-\s*\d{4}/g) || [])].map((a) => a.replace(/\s/g, '')).sort();
}

// Activités suivies : pedibus (KT et Pédibus mercredi compris), mercredi, vacances (toutes périodes et collégiens), exceptionnel, ado.
export const ACTIVITES_HISTO = [['pedibus', 'Pédibus'], ['mercredi', 'Mercredis'], ['vacances', 'Vacances'], ['exceptionnel', 'Journées exceptionnelles'], ['ado', 'ADO']];
function familleActivite(state, a) {
  if (['pedibus', 'pediMercredi', 'ktMardi', 'ktJeudi'].includes(a)) return 'pedibus';
  if (a === 'mercredi' || a === 'exceptionnel' || a === 'ado') return a;
  if (a === 'collegiens' || (state.params.periods || []).some((p) => p.id === a && p.kind === 'vacances')) return 'vacances';
  return null;
}

export function activitesAnnee(state, childId) {
  const set = new Set();
  const c = state.children[childId] || {};
  for (const [k, v] of Object.entries(c.inscriptions || {})) if (v) set.add(familleActivite(state, k));
  const prefix = `${childId}|`;
  for (const [k, v] of Object.entries(state.presences || {})) {
    if (k.startsWith(prefix) && VENU.includes(v)) set.add(familleActivite(state, k.split('|')[1]));
  }
  set.delete(null);
  return ACTIVITES_HISTO.map(([a]) => a).filter((a) => set.has(a));
}

// Déjà venu à une activité, cette année ou une année précédente.
export function dejaVenu(state, childId, act, cetteAnnee = null) {
  const c = state.children[childId] || {};
  if (Object.values(c.activites || {}).some((l) => l.includes(act))) return true;
  return (cetteAnnee || activitesAnnee(state, childId)).includes(act);
}

// Pour toute une liste : activités de l'année de chaque enfant, en un seul passage.
export function activitesTous(state) {
  const out = new Map();
  const add = (cid, a) => { const f = familleActivite(state, a); if (!f) return; if (!out.has(cid)) out.set(cid, new Set()); out.get(cid).add(f); };
  for (const [cid, c] of Object.entries(state.children)) for (const [k, v] of Object.entries(c.inscriptions || {})) if (v) add(cid, k);
  for (const [k, v] of Object.entries(state.presences || {})) if (VENU.includes(v)) { const [cid, a] = k.split('|'); add(cid, a); }
  return new Map([...out].map(([cid, set]) => [cid, ACTIVITES_HISTO.map(([a]) => a).filter((a) => set.has(a))]));
}
