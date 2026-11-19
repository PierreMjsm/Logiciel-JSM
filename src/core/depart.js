// Départ d'un enfant (« Plus présent ») : on ne garde que l'essentiel (nom, prénom, date de naissance ;
// mail et adresse de la famille pour les mailings et les campagnes de dons). Présences et règlements restent pour la compta.
const parti = (c, today) => {
  const g = (c.groupes || []).filter((x) => !x.from || x.from <= today).at(-1);
  return g && g.groupe === 'Plus présent';
};

export function opsDepart(state, childId, today, { effacer = true } = {}) {
  const c = state.children[childId];
  const ops = [[['children', childId, 'groupes'], [...(c.groupes || []), { from: today, groupe: 'Plus présent' }]]];
  if (!effacer) return ops;
  ops.push(
    [['children', childId, 'fiche'], null],
    [['children', childId, 'documents'], {}],
    [['children', childId, 'pieces'], null],
    [['children', childId, 'pai'], false],
    [['children', childId, 'planning'], null],
  );
  const autres = Object.entries(state.children).filter(([id, x]) => id !== childId && x.familyId === c.familyId && !parti(x, today));
  if (!autres.length) ops.push([['families', c.familyId, 'telMaman'], ''], [['families', c.familyId, 'telPapa'], '']);
  return ops;
}

// Changement de famille d'un enfant : règlements de l'ancienne famille qui ne concernent que lui (à déplacer avec lui),
// et règlements partagés avec ses frères et sœurs (à revoir à la main).
export function reglementsDeLEnfant(state, childId, familyId) {
  const deplacables = [], mixtes = [];
  for (const [id, p] of Object.entries(state.payments || {})) {
    if (!p || p.familyId !== familyId) continue;
    const enfants = new Set((p.affectations || []).map((a) => a.childId || p.childId || ''));
    if (!enfants.size) enfants.add(p.childId || '');
    if (!enfants.has(childId)) continue;
    if (enfants.size === 1) deplacables.push(id); else mixtes.push(id);
  }
  return { deplacables, mixtes };
}
