// Trombinoscope (photos) et fiches santé des enfants à surveiller.
import { groupAt, ageAt } from './calendar.js';
import { nomEnfant } from './noms.js';

const cap = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
export const prenomInitiale = (state, c) => `${cap(c.prenom)} ${(nomEnfant(state, c)[0] || '').toUpperCase()}.`.trim();

function actifs(state, today) {
  return Object.entries(state.children).filter(([, c]) => groupAt(c, today) !== 'Plus présent');
}

// mode : 'groupe' | 'age' | 'tous'. Renvoie [{ titre, enfants: [{ id, libelle }] }].
export function trombinoscope(state, today, mode = 'groupe', { groupe = '' } = {}) {
  const kids = actifs(state, today).map(([id, c]) => ({ id, c, libelle: prenomInitiale(state, c), groupe: groupAt(c, today) || '—', age: ageAt(c.naissance, today) }))
    .filter((k) => !groupe || k.groupe === groupe)
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
  const out = (k) => ({ id: k.id, libelle: k.libelle });
  if (mode === 'tous') return [{ titre: 'Tous les enfants', enfants: kids.map(out) }];
  const groups = new Map();
  for (const k of kids) {
    const key = mode === 'age' ? (k.age === null ? '?' : k.age) : k.groupe;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(out(k));
  }
  const ordre = mode === 'age'
    ? [...groups.keys()].sort((a, b) => (a === '?' ? 99 : a) - (b === '?' ? 99 : b))
    : [...groups.keys()].sort((a, b) => ((state.params.groupes || []).indexOf(a) + 100) % 200 - ((state.params.groupes || []).indexOf(b) + 100) % 200);
  return ordre.map((k) => ({ titre: mode === 'age' ? (k === '?' ? 'Âge inconnu' : `${k} an${k > 1 ? 's' : ''}`) : k, enfants: groups.get(k) }));
}

// Enfants avec un PAI ou des difficultés de santé notées, pour emporter en sortie.
export function fichesSante(state, today, { groupe = '' } = {}) {
  return actifs(state, today).map(([id, c]) => {
    const f = c.fiche || {};
    const fam = state.families[c.familyId] || {};
    return {
      id, nom: `${nomEnfant(state, c)} ${cap(c.prenom)}`, groupe: groupAt(c, today) || '', age: ageAt(c.naissance, today),
      pai: !!c.pai, difficultes: f.difficultes || '', traitement: f.traitement || '', observations: f.observations || '',
      urgence: f.urgence || '', telephones: [fam.telMaman, fam.telPapa].filter(Boolean).join(' / '),
      paiMotif: (c.paiInfo || {}).motif || '', paiConduite: (c.paiInfo || {}).conduite || '', paiRangement: (c.paiInfo || {}).rangement || '', paiFin: (c.paiInfo || {}).fin || '',
    };
  }).filter((x) => (x.pai || x.difficultes || x.traitement) && (!groupe || x.groupe === groupe))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}
