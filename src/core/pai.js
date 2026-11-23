// P.A.I (projet d'accueil individualisé) : infos du protocole, validité et rappels de renouvellement.
import { groupAt } from './calendar.js';
import { dateFr } from './format.js';
import { nomEnfant } from './noms.js';

export const PREVENIR_DEFAUT = 30;

// Champs de l'onglet P.A.I de la fiche enfant.
export const PAI_CHAMPS = [
  ['motif', 'Motif (allergie, asthme, épilepsie, diabète…)', 'texte'],
  ['traitement', 'Traitement et médicaments', 'zone'],
  ['conduite', 'Conduite à tenir en cas de crise', 'zone'],
  ['rangement', 'Où sont les médicaments (trousse PAI)', 'texte'],
  ['medecin', 'Médecin ou service qui suit l\'enfant', 'texte'],
  ['remarques', 'Remarques', 'zone'],
];

const jours = (de, a) => Math.round((Date.UTC(...a.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0))) - Date.UTC(...de.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)))) / 86400000);

// État du PAI à la date `today` : aucun, sansDate, valide, bientot (dans le délai de rappel), expire.
export function etatPai(c, today) {
  if (!c || !c.pai) return { etat: 'aucun', fin: '', jours: null };
  const info = c.paiInfo || {};
  if (!info.fin) return { etat: 'sansDate', fin: '', jours: null };
  const j = jours(today, info.fin);
  const prevenir = Number.isFinite(Number(info.prevenir)) && info.prevenir !== '' ? Number(info.prevenir) : PREVENIR_DEFAUT;
  return { etat: j < 0 ? 'expire' : j <= prevenir ? 'bientot' : 'valide', fin: info.fin, jours: j };
}

const ORDRE = { expire: 0, bientot: 1, sansDate: 2 };

// PAI à vérifier (expirés, bientôt expirés, sans date), pour les enfants encore présents.
export function paiAlertes(state, today) {
  return Object.entries(state.children || {})
    .filter(([, c]) => c.pai && groupAt(c, today) !== 'Plus présent')
    .map(([id, c]) => ({ childId: id, prenom: c.prenom, nom: `${c.prenom} ${nomEnfant(state, c)}`.trim(), ...etatPai(c, today) }))
    .filter((x) => x.etat in ORDRE)
    .sort((a, b) => ORDRE[a.etat] - ORDRE[b.etat] || (a.fin || '').localeCompare(b.fin || '') || a.nom.localeCompare(b.nom, 'fr'));
}

export function libelleAlerte(a) {
  if (a.etat === 'expire') return `expiré depuis le ${dateFr(a.fin)}`;
  if (a.etat === 'bientot') return `expire le ${dateFr(a.fin)} (${a.jours === 0 ? 'aujourd\'hui' : `dans ${a.jours} jour${a.jours > 1 ? 's' : ''}`})`;
  if (a.etat === 'sansDate') return 'date de validité à renseigner';
  return `valable jusqu'au ${dateFr(a.fin)}`;
}

// Titre et texte de la notification Windows.
export function texteAlertesPai(alertes) {
  const n = alertes.length;
  return {
    titre: `JSM Gestion : ${n} PAI à vérifier`,
    texte: alertes.map((a) => `${a.nom} : ${libelleAlerte(a)}`).join('\n'),
  };
}
