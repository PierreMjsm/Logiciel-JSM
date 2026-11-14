// Petit jeu de données de test : une famille de 3 (ou 4) enfants.
import { defaultParams2026 } from '../../../src/core/calendar.js';

export function miniState({ quatre = false } = {}) {
  const ins = (o = {}) => ({ pedibus: true, ktMardi: false, ktJeudi: true, mercredi: true, pediMercredi: false,
    toussaint: true, noel: false, hiver: false, printemps: false, rose: false, juillet: true, aout: false,
    collegiens: false, exceptionnel: false, ado: false, ...o });
  const children = {
    c1: { familyId: 'f1', prenom: 'SHERYNE', naissance: '2016-06-27', groupes: [{ from: null, groupe: '8-10 ans' }], ecole: 'MARCEL', adhesionDejaReglee: false, statut: '', pai: false, documents: { fiche: true, vaccins: true, amelie: true }, inscriptions: ins() },
    c2: { familyId: 'f1', prenom: 'LYNESS', naissance: '2018-03-24', groupes: [{ from: null, groupe: '8-10 ans' }], ecole: 'ROSALIE', adhesionDejaReglee: true, documents: { fiche: true, vaccins: false, amelie: true }, statut: '', pai: false, inscriptions: ins() },
    c3: { familyId: 'f1', prenom: 'RAYAN', naissance: '2020-03-12', groupes: [{ from: null, groupe: '6-8 ans' }], ecole: 'MARCEL', adhesionDejaReglee: true, documents: {}, statut: 'PAI', pai: true, inscriptions: ins() },
    c5: { familyId: 'f2', prenom: 'LIYA', naissance: '2022-09-21', groupes: [{ from: null, groupe: '3 ans' }, { from: '2027-07-05', groupe: '4-5 ans' }], ecole: 'BUFFON', adhesionDejaReglee: false, documents: {}, statut: '', pai: false, inscriptions: ins() },
  };
  if (quatre) children.c4 = { familyId: 'f1', prenom: 'ADAM', naissance: '2021-01-01', groupes: [{ from: null, groupe: '4-5 ans' }], ecole: 'MARCEL', adhesionDejaReglee: true, documents: {}, statut: '', pai: false, inscriptions: ins() };
  return {
    schema: 1, year: '2026-2027', params: defaultParams2026(),
    families: {
      f1: { nom: 'AJAMRI', nomCheque: '', mails: 'saba.a@hotmail.fr ; b@y.fr', adresse: '4 rue jeanne chauvin 75013 Paris', telMaman: '0651958408', telPapa: '' },
      f2: { nom: 'AGACHE', nomCheque: '', mails: 'saba.a@hotmail.fr', adresse: '5 rue des wallons 75013 Paris', telMaman: '', telPapa: '' },
    },
    children, presences: {}, extraDates: { exceptionnel: [], ado: [] }, payments: {},
  };
}

export function mark(state, childId, activity, date, value, slot = '') {
  state.presences[`${childId}|${activity}|${date}|${slot}`] = value;
}
