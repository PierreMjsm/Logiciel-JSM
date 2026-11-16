import { anneesPresence, activitesTous, enfantsVenus } from './annees.js';
// Passage à une nouvelle année scolaire.
import { ageAt, defaultGroupe } from './calendar.js';

const EMPTY_INS = {
  pedibus: false, ktMardi: false, ktJeudi: false, mercredi: false, pediMercredi: false,
  toussaint: false, noel: false, hiver: false, printemps: false, rose: false, juillet: false,
  aout: false, collegiens: false, exceptionnel: false, ado: false,
};

// Groupe à la rentrée : Pierre ne veut que deux passages automatiques (entrée en 6e et fin de l'année « 3 ans ») ;
// les autres groupes sont gardés et ajustés à la main.
function groupeRentree(c, startIso) {
  const gs = c.groupes || [];
  const last = gs.at(-1);
  if (last && last.groupe === 'Plus présent') return 'Plus présent';
  if (last && last.groupe === 'Collégiens') return 'Collégiens';
  const annee = Number(startIso.slice(0, 4));
  if (c.naissance && Number(c.naissance.slice(0, 4)) === annee - 11) return 'Collégiens';
  if (gs.some((g) => g.groupe === '3 ans')) return '4-5 ans';
  if (last && last.groupe) return last.groupe;
  const age = ageAt(c.naissance, startIso);
  return age === null ? 'en attente' : defaultGroupe(age);
}

export function newYear(state, label, params, startIso, { dossierPrecedent = '' } = {}) {
  const children = {};
  const usedFamilies = new Set();
  const tous = activitesTous(state);
  const venus = enfantsVenus(state);
  for (const [id, c] of Object.entries(state.children)) {
    // On garde tout le monde : les anciens restent dans le carnet d'adresses (mails, dons, retour éventuel).
    const groupe = groupeRentree(c, startIso);
    children[id] = { ...structuredClone(c), groupes: [{ from: null, groupe }], adhesionDejaReglee: false, documents: {}, inscriptions: { ...EMPTY_INS } };
    { const annees = anneesPresence(state, id, venus); if (annees.length) children[id].annees = annees; }
    { const acts = (tous.get(id) || []); if (acts.length) children[id].activites = { ...(c.activites || {}), [state.year]: acts }; }
    delete children[id].fichesPdf;
    if (c.fiche) {
      // Une nouvelle fiche est signée chaque année : on garde les coordonnées et la santé, pas les cases ni la signature.
      const { signataire, signature, dateSignature, coches, ...garde } = c.fiche;
      children[id].fiche = garde;
    }
    usedFamilies.add(c.familyId);
  }
  const families = {};
  for (const [id, f] of Object.entries(state.families)) if (usedFamilies.has(id)) families[id] = structuredClone(f);
  return {
    schema: 1, year: label, anneePrecedente: { label: state.year, dossier: dossierPrecedent }, params: structuredClone(params), families, children,
    presences: {}, extraDates: { exceptionnel: [], ado: [] }, payments: {},
  };
}
