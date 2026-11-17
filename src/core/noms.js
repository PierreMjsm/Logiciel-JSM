// Nom d'un enfant : son propre nom s'il en a un (enfant qui ne porte pas le nom de la famille), sinon celui de la famille.
export function nomEnfant(state, c) {
  if (!c) return '';
  if (c.nom) return c.nom;
  const f = state && state.families && state.families[c.familyId];
  return (f && f.nom) || '';
}

// « NOM PRÉNOM » d'un enfant à partir de son identifiant.
export function nomComplet(state, id) {
  const c = state && state.children && state.children[id];
  if (!c) return id;
  return `${nomEnfant(state, c)} ${c.prenom || ''}`.trim();
}

// « NOM PRÉNOM » de chaque enfant ; les homonymes sont distingués par leur année de naissance.
export function libellesEnfants(state) {
  const base = {};
  const count = new Map();
  for (const id of Object.keys(state.children || {})) {
    base[id] = nomComplet(state, id);
    count.set(base[id], (count.get(base[id]) || 0) + 1);
  }
  const out = {};
  for (const [id, l] of Object.entries(base)) {
    const an = (state.children[id].naissance || '').slice(0, 4);
    out[id] = count.get(l) > 1 && an ? `${l} (${an})` : l;
  }
  return out;
}

// Nom du dossier de l'enfant sur le drive (pièces jointes, fiche PDF) : « NOM Prénom (id) », sans caractère interdit sous Windows.
export function dossierEnfant(state, id) {
  const c = state.children[id] || {};
  const prenom = String(c.prenom || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  return `${nomEnfant(state, c)} ${prenom} (${id})`.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}
