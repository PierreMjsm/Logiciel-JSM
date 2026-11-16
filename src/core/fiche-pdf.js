// Fiche PDF : quelles données vont dans quels champs du PDF (modèle fourni par l'association, avec champs de formulaire).
import { nomEnfant } from './noms.js';
import { dateFr } from './format.js';
import { sansAccent } from './preinscriptions.js';

const fiche = (x) => x.c.fiche || {};
const coche = (k) => (x) => !!(fiche(x).coches || {})[k];
const tel = (x, i) => [x.f.telMaman, x.f.telPapa].filter(Boolean)[i] || '';
const estLien = (s) => /^https?:\/\//i.test(String(s || ''));
const paiOui = (x) => !!x.c.pai || (!!fiche(x).traitement && !/^non\b/i.test(fiche(x).traitement));

export const SOURCES = [
  { id: 'enfant.nom', label: 'Nom de l\'enfant', type: 'texte', v: (x) => nomEnfant(x.s, x.c) },
  { id: 'enfant.prenom', label: 'Prénom de l\'enfant', type: 'texte', v: (x) => x.c.prenom || '' },
  { id: 'enfant.nomPrenom', label: 'Nom et prénom de l\'enfant', type: 'texte', v: (x) => `${nomEnfant(x.s, x.c)} ${x.c.prenom || ''}`.trim() },
  { id: 'enfant.naissance', label: 'Date de naissance', type: 'texte', v: (x) => (x.c.naissance ? dateFr(x.c.naissance) : '') },
  { id: 'enfant.ecole', label: 'École / collège', type: 'texte', v: (x) => x.c.ecole || '' },
  { id: 'enfant.classe', label: 'Classe', type: 'texte', v: (x) => x.c.classe || '' },
  { id: 'famille.adresse', label: 'Adresse et code postal', type: 'texte', v: (x) => x.f.adresse || '' },
  { id: 'famille.mail', label: 'Mail (le premier)', type: 'texte', v: (x) => String(x.f.mails || '').split(/[;,\s]+/).find((m) => m.includes('@')) || '' },
  { id: 'famille.mails', label: 'Mails (tous)', type: 'texte', v: (x) => x.f.mails || '' },
  { id: 'famille.tel1', label: 'Téléphone 1', type: 'texte', v: (x) => tel(x, 0) },
  { id: 'famille.tel2', label: 'Téléphone 2', type: 'texte', v: (x) => tel(x, 1) },
  { id: 'famille.telephones', label: 'Téléphones (les deux)', type: 'texte', v: (x) => [x.f.telMaman, x.f.telPapa].filter(Boolean).join(' / ') },
  { id: 'fiche.secu', label: 'N° de sécurité sociale', type: 'texte', v: (x) => fiche(x).secu || '' },
  { id: 'fiche.urgence', label: 'Personne à contacter en urgence', type: 'texte', v: (x) => fiche(x).urgence || '' },
  { id: 'fiche.autorise1', label: 'Personne autorisée 1', type: 'texte', v: (x) => fiche(x).autorise1 || '' },
  { id: 'fiche.autorise2', label: 'Personne autorisée 2', type: 'texte', v: (x) => fiche(x).autorise2 || '' },
  { id: 'fiche.difficultes', label: 'Difficultés de santé', type: 'texte', v: (x) => fiche(x).difficultes || '' },
  { id: 'fiche.traitement', label: 'Traitement / PAI (lequel)', type: 'texte', v: (x) => fiche(x).traitement || '' },
  { id: 'fiche.observations', label: 'Observations', type: 'texte', v: (x) => fiche(x).observations || '' },
  { id: 'fiche.signataire', label: 'Responsable légal (je soussigné)', type: 'texte', v: (x) => fiche(x).signataire || '' },
  { id: 'fiche.signature', label: 'Signature (nom tapé, ou image dessinée)', type: 'texte', v: (x) => { const sg = fiche(x).signature || fiche(x).signataire || ''; return !sg || estLien(sg) ? '' : `Signé en ligne par ${sg}`; } },
  { id: 'fiche.dateSignature', label: 'Date de la fiche', type: 'texte', v: (x) => (fiche(x).dateSignature ? dateFr(fiche(x).dateSignature) : '') },
  { id: 'annee', label: 'Année scolaire', type: 'texte', v: (x) => x.s.year || '' },
  { id: 'coche.vaccination', label: 'Case : vaccination (photocopies jointes)', type: 'coche', v: coche('vaccination') },
  { id: 'coche.certifie', label: 'Case : certifie vaccins à jour', type: 'coche', v: coche('certifie') },
  { id: 'coche.ayantDroit', label: 'Case : attestation d\'ayant droit', type: 'coche', v: coche('ayantDroit') },
  { id: 'coche.paiement', label: 'Case : paiement de l\'adhésion', type: 'coche', v: coche('paiement') },
  { id: 'coche.paiOui', label: 'Case : PAI oui', type: 'coche', v: paiOui },
  { id: 'coche.paiNon', label: 'Case : PAI non', type: 'coche', v: (x) => !paiOui(x) },
  { id: 'coche.activites', label: 'Case : participe à toutes les activités', type: 'coche', v: coche('activites') },
  { id: 'coche.partSeul', label: 'Case : part seul (collégiens)', type: 'coche', v: coche('partSeul') },
  { id: 'coche.image', label: 'Case : droit à l\'image', type: 'coche', v: coche('image') },
  { id: 'coche.facturation', label: 'Case : journées cochées facturées', type: 'coche', v: coche('facturation') },
  { id: 'coche.soins', label: 'Case : autorisation de soins', type: 'coche', v: coche('soins') },
  { id: 'doc.vaccins', label: 'Case : vaccins reçus (dossier)', type: 'coche', v: (x) => !!(x.c.documents || {}).vaccins },
  { id: 'doc.amelie', label: 'Case : attestation ayant droit reçue (dossier)', type: 'coche', v: (x) => !!(x.c.documents || {}).amelie },
];
const BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

const norm = (s) => sansAccent(s).toLowerCase().replace(/_\w*$/, (m) => (/^_\d+$/.test(m) ? ` ${m.slice(1)}` : m)).replace(/[^a-z0-9]+/g, ' ').trim();

// Règles de reconnaissance d'après le nom du champ (l'ordre compte).
const REGLES = [
  [/signature/, 'fiche.signature'], [/naissance/, 'enfant.naissance'], [/signer date|^date\d* /, 'fiche.dateSignature'], [/soussign/, 'fiche.signataire'],
  [/prenom de l ?enfant/, 'enfant.prenom'], [/nom de l ?enfant/, 'enfant.nom'],
  [/nom prenom et lien 2|autorisee 2/, 'fiche.autorise2'], [/nom prenom et lien|autorisee 1|autorisee/, 'fiche.autorise1'],
  [/mail/, 'famille.mail'], [/adresse/, 'famille.adresse'],
  [/telephone (2|ii)\b/, 'famille.tel2'], [/telephone/, 'famille.tel1'],
  [/ecole|college/, 'enfant.ecole'], [/classe/, 'enfant.classe'], [/secu/, 'fiche.secu'], [/urgence/, 'fiche.urgence'],
  [/difficult/, 'fiche.difficultes'], [/maladie|traitement|\bpai\b/, 'fiche.traitement'], [/b?servation/, 'fiche.observations'],
];
// Cases numérotées 1 à 11 de la fiche d'adhésion 2026-2027 (de haut en bas, colonne gauche puis droite).
const CASES_ADHESION = ['coche.vaccination', 'coche.certifie', 'coche.ayantDroit', 'coche.paiement', 'coche.paiOui', 'coche.paiNon',
  'coche.activites', 'coche.partSeul', 'coche.image', 'coche.facturation', 'coche.soins'];

export function suggestion(nom, type) {
  if (type === 'coche') {
    const n = Number(nom);
    return Number.isInteger(n) && n >= 1 && n <= CASES_ADHESION.length ? CASES_ADHESION[n - 1] : '';
  }
  const t = norm(nom);
  const hit = REGLES.find(([re]) => re.test(t));
  return hit ? hit[1] : '';
}

// champs : [{ nom, type: 'texte' | 'coche' }] ; precedente : correspondance d'une version précédente du modèle.
export function correspondanceInitiale(champs, precedente = {}) {
  const out = {};
  for (const ch of champs) out[ch.nom] = ch.nom in precedente ? precedente[ch.nom] : suggestion(ch.nom, ch.type);
  return out;
}

// Valeurs à écrire dans le PDF pour un enfant : { nomDuChamp: texte | booléen }.
export function valeursFiche(state, childId, correspondance) {
  const c = state.children[childId];
  const x = { s: state, c, f: state.families[c.familyId] || {} };
  const out = {};
  for (const [champ, src] of Object.entries(correspondance)) {
    const s = BY_ID[src];
    if (s) out[champ] = s.v(x);
  }
  return out;
}

// Lien de la signature dessinée (image), à poser dans le champ « signature » du PDF.
export function signatureImage(state, childId) {
  const sg = ((state.children[childId] || {}).fiche || {}).signature;
  return estLien(sg) ? sg : '';
}

// Valeurs de démonstration : le nom de la donnée dans chaque champ, toutes les cases cochées.
export function valeursEtiquettes(correspondance) {
  const out = {};
  for (const [champ, src] of Object.entries(correspondance)) {
    const s = BY_ID[src];
    if (s) out[champ] = s.type === 'coche' ? true : `[${s.label}]`;
  }
  return out;
}
