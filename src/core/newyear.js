// Passage à une nouvelle année scolaire.
import { ageAt, defaultGroupe } from './calendar.js';

const EMPTY_INS = {
  pedibus: false, ktMardi: false, ktJeudi: false, mercredi: false, pediMercredi: false,
  toussaint: false, noel: false, hiver: false, printemps: false, rose: false, juillet: false,
  aout: false, collegiens: false, exceptionnel: false, ado: false,
};

export function newYear(state, label, params, startIso) {
  const children = {};
  const usedFamilies = new Set();
  for (const [id, c] of Object.entries(state.children)) {
    // On garde tout le monde : les anciens restent dans le carnet d'adresses (mails, dons, retour éventuel).
    const last = (c.groupes || []).at(-1);
    const age = ageAt(c.naissance, startIso);
    const groupe = last && last.groupe === 'Plus présent' ? 'Plus présent' : age === null ? (last ? last.groupe : 'en attente') : defaultGroupe(age);
    children[id] = { ...structuredClone(c), groupes: [{ from: null, groupe }], adhesionDejaReglee: false, documents: {}, inscriptions: { ...EMPTY_INS } };
    usedFamilies.add(c.familyId);
  }
  const families = {};
  for (const [id, f] of Object.entries(state.families)) if (usedFamilies.has(id)) families[id] = structuredClone(f);
  return {
    schema: 1, year: label, params: structuredClone(params), families, children,
    presences: {}, extraDates: { exceptionnel: [], ado: [] }, payments: {},
  };
}
