// Déclaration CAF en année civile (1er janvier – 31 décembre) et attestations annuelles.
// Une année civile est à cheval sur deux années scolaires (deux dossiers) : on reçoit
// la liste des années disponibles, chacune avec ses propres réglages (heures, tarifs).
import { VACANCES, VACANCES_LABELS, groupAt, tarifAt } from './calendar.js';
import { presenceHours, CAF_VALUES } from './reports.js';
import { fratrieDiscounts, isSchoolDay, presencesByChild } from './billing.js';
import { round2, dateFr } from './format.js';
import { nomEnfant } from './noms.js';

export const TRANCHES = [['3', '3 ans'], ['45', '4-5 ans'], ['6', '6 ans et +']];
export const SECTIONS = [['peri', 'Périscolaire'], ['extra', 'Extrascolaire'], ['jeunes', 'Collégiens (PS Jeunes)']];

const VAC_LABEL = (v) => `Vacances ${VACANCES_LABELS[v] || v}`;
const LIGNES = [
  ['peri', 'pedibus', 'Pédibus (après l\'école)'],
  ['peri', 'mercredi', 'Mercredis'],
  ['peri', 'exceptionnel', 'Journées exceptionnelles (périscolaire)'],
  ...VACANCES.filter((v) => v !== 'collegiens').map((v) => ['extra', v, VAC_LABEL(v)]),
  ['extra', 'exceptionnel', 'Journées exceptionnelles (extrascolaire)'],
  ['jeunes', 'pedibus', 'Pédibus collégiens'],
  ['jeunes', 'mercredi', 'Mercredis'],
  ['jeunes', 'collegiens', 'Vacances collégiens'],
  ...VACANCES.filter((v) => v !== 'collegiens').map((v) => ['jeunes', v, VAC_LABEL(v)]),
  ['jeunes', 'exceptionnel', 'Journées exceptionnelles'],
  ['jeunes', 'ado', 'Soirées ADO'],
];

// Journée exceptionnelle : périscolaire ou extrascolaire, réglé date par date (extrascolaire par défaut).
export function typeExceptionnel(params, iso) {
  return ((params || {}).exceptionnelType || {})[iso] === 'peri' ? 'peri' : 'extra';
}

// Où compter une présence : section CAF et tranche d'âge (selon le groupe de l'enfant à cette date).
export function classer(state, child, act, date, value) {
  const g = groupAt(child, date);
  if (value === 'C' || g === 'Collégiens' || act === 'ado' || act === 'collegiens') return { section: 'jeunes', tranche: 'J' };
  const tranche = g === '3 ans' ? '3' : g === '4-5 ans' ? '45' : '6';
  if (act === 'pedibus' || act === 'mercredi') return { section: 'peri', tranche };
  if (act === 'exceptionnel') return { section: typeExceptionnel(state.params, date), tranche };
  if (VACANCES.includes(act)) return { section: 'extra', tranche };
  return null;
}

// Prix facturé d'une présence (mêmes règles que la facturation par poste).
export function prixPresence(state, e, disc) {
  const p = state.params;
  if (e.activity === 'pedibus' || e.activity === 'mercredi') { if (!isSchoolDay(p, e.date)) return 0; }
  else if (!VACANCES.includes(e.activity) && e.activity !== 'exceptionnel') return 0;
  if (e.activity === 'pedibus') {
    if (e.value === 'KT' || e.value === 'AKT') return tarifAt(p, 'kt', e.date);
    if (e.value === 'C') return tarifAt(p, 'collegien', e.date) ?? 1.5;
    return e.value === 'P' || e.value === 'A' ? tarifAt(p, 'pedibus', e.date) : 0;
  }
  if (e.value !== 'P' && e.value !== 'A') return 0;
  const prix = tarifAt(p, e.activity === 'mercredi' ? 'mercredi' : e.activity === 'exceptionnel' ? 'exceptionnel' : 'journee', e.date);
  return disc && disc.has(`${e.childId}|${e.activity}|${e.date}|${e.slot}`) ? prix / 2 : prix;
}

const vide = () => ({ presences: 0, heures: 0 });
const ajoute = (a, h) => { a.presences += 1; a.heures = round2(a.heures + h); };
const somme = (...xs) => xs.reduce((t, x) => ({ presences: t.presences + x.presences, heures: round2(t.heures + x.heures) }), vide());

// Toutes les présences comptées par la CAF, chacune avec ses heures, dans tous les dossiers fournis.
function presencesCaf(etats) {
  const out = [];
  for (const { state } of etats) {
    for (const [k, v] of Object.entries(state.presences || {})) {
      if (!CAF_VALUES.includes(v)) continue;
      const [childId, act, date, slot = ''] = k.split('|');
      const c = state.children[childId];
      if (!c) continue;
      const cl = classer(state, c, act, date, v);
      if (!cl) continue;
      out.push({ state, childId, act, date, slot, value: v, ...cl, heures: presenceHours(state, c, act, date, slot, v) });
    }
  }
  return out;
}

function sectionPoste(poste) {
  if (/^(pedibus|mercredi)-T\d$/.test(poste)) return 'peri';
  if (poste === 'collegiens') return 'jeunes';
  if (VACANCES.includes(poste)) return 'extra';
  if (poste === 'exceptionnel') return 'exceptionnel';
  if (poste === 'adhesion') return 'adhesion';
  return 'nonAffecte';
}

/**
 * Déclaration CAF de l'année civile `annee` (nombre), à la date `today`.
 * Pour chaque ligne et chaque tranche : réalisé (jusqu'à aujourd'hui), inscrit (après aujourd'hui)
 * et estimé (mois à venir sans aucune inscription : même mois de l'année précédente).
 */
export function cafAnnee(etats, annee, today) {
  const du = `${annee}-01-01`, au = `${annee}-12-31`;
  const prev = String(annee - 1);
  const toutes = presencesCaf(etats);
  const lignes = new Map(LIGNES.map(([section, id, label]) => [`${section}|${id}`, {
    section, id, label, tranches: {}, total: { realise: vide(), inscrit: vide(), estime: vide() },
  }]));
  const tr = (l, t) => (l.tranches[t] ||= { realise: vide(), inscrit: vide(), estime: vide() });
  const enfants = { peri: {}, extra: {}, jeunes: {} };
  const parMois = new Map(); // `${section}|${act}|${annee-mois}` → { [tranche]: {presences, heures} }
  const occupe = new Set(); // `${section}|${act}|${mois}` ayant au moins une présence en année N
  for (const e of toutes) {
    const mois = e.date.slice(0, 7);
    if (e.date.slice(0, 4) === prev) {
      const k = `${e.section}|${e.act}|${mois.slice(5)}`;
      if (!parMois.has(k)) parMois.set(k, {});
      ajoute(parMois.get(k)[e.tranche] ||= vide(), e.heures);
    }
    if (e.date < du || e.date > au) continue;
    const l = lignes.get(`${e.section}|${e.act}`);
    if (!l) continue;
    const quand = e.date <= today ? 'realise' : 'inscrit';
    ajoute(tr(l, e.tranche)[quand], e.heures);
    ajoute(l.total[quand], e.heures);
    occupe.add(`${e.section}|${e.act}|${mois.slice(5)}`);
    (enfants[e.section][e.tranche] ||= new Set()).add(e.childId);
    (enfants[e.section].tous ||= new Set()).add(e.childId);
  }
  // Estimation : mois entièrement à venir, sans aucune inscription sur cette ligne.
  const moisAujourdhui = today.slice(0, 7);
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    if (`${annee}-${mm}` <= moisAujourdhui) continue;
    for (const l of lignes.values()) {
      const k = `${l.section}|${l.id}|${mm}`;
      if (occupe.has(k) || !parMois.has(k)) continue;
      for (const [t, v] of Object.entries(parMois.get(k))) {
        const x = tr(l, t).estime;
        x.presences += v.presences; x.heures = round2(x.heures + v.heures);
        l.total.estime.presences += v.presences; l.total.estime.heures = round2(l.total.estime.heures + v.heures);
      }
    }
  }
  const listes = [...lignes.values()].filter((l) => l.total.realise.presences || l.total.inscrit.presences || l.total.estime.presences);
  const sections = SECTIONS.map(([id, label]) => {
    const ls = listes.filter((l) => l.section === id);
    const tranches = {};
    for (const t of id === 'jeunes' ? ['J'] : TRANCHES.map(([x]) => x)) {
      tranches[t] = {
        realise: somme(...ls.map((l) => (l.tranches[t] || {}).realise || vide())),
        inscrit: somme(...ls.map((l) => (l.tranches[t] || {}).inscrit || vide())),
        estime: somme(...ls.map((l) => (l.tranches[t] || {}).estime || vide())),
        enfants: (enfants[id][t] || new Set()).size,
      };
    }
    return {
      id, label, lignes: ls, tranches,
      total: { realise: somme(...ls.map((l) => l.total.realise)), inscrit: somme(...ls.map((l) => l.total.inscrit)), estime: somme(...ls.map((l) => l.total.estime)) },
      enfants: (enfants[id].tous || new Set()).size,
    };
  });

  // Participations des familles : facturé (présences de l'année) et encaissé (règlements datés de l'année).
  const recettes = { peri: { facture: 0, encaisse: 0 }, extra: { facture: 0, encaisse: 0 }, jeunes: { facture: 0, encaisse: 0 },
    exceptionnel: { facture: 0, encaisse: 0 }, adhesion: { facture: 0, encaisse: 0 }, nonAffecte: { facture: 0, encaisse: 0 } };
  for (const { state } of etats) {
    const discs = new Map();
    for (const [cid, list] of presencesByChild(state)) {
      const c = state.children[cid];
      if (!c) continue;
      if (!discs.has(c.familyId)) discs.set(c.familyId, fratrieDiscounts(state, c.familyId));
      for (const e of list) {
        if (e.date < du || e.date > au) continue;
        const prix = prixPresence(state, e, discs.get(c.familyId));
        if (!prix) continue;
        const cl = classer(state, c, e.activity, e.date, e.value);
        if (cl) recettes[cl.section].facture = round2(recettes[cl.section].facture + prix);
      }
    }
    for (const p of Object.values(state.payments || {})) {
      if (!p.date || p.date < du || p.date > au) continue;
      const afs = p.affectations && p.affectations.length ? p.affectations : [{ poste: 'a-repartir', montant: p.montant }];
      for (const af of afs) {
        const s = sectionPoste(af.poste);
        recettes[s].encaisse = round2(recettes[s].encaisse + (Number(af.montant) || 0));
      }
    }
  }
  const couverts = etats.map((x) => x.label).filter(Boolean);
  return { annee, du, au, today, sections, recettes, couverts };
}

// --- Attestations annuelles -------------------------------------------------------------

// Fusionne familles et enfants de plusieurs années (la plus récente gagne), règlements de toutes.
function fusion(etats) {
  const ordre = [...etats].sort((a, b) => String(a.state.year || '').localeCompare(String(b.state.year || '')));
  const families = {}, children = {}, payments = [];
  for (const { state } of ordre) {
    Object.assign(families, state.families || {});
    Object.assign(children, state.children || {});
    for (const [id, p] of Object.entries(state.payments || {})) payments.push({ id, ...p });
  }
  return { families, children, payments, dernier: ordre.at(-1).state };
}

export const moinsDe6Ans = (naissance, annee) => !!naissance && naissance > `${annee - 6}-01-01`;

/**
 * Attestations de l'année civile, une par famille.
 * mode « impots » : enfants de moins de 6 ans au 1er janvier ; « paiement » : tous les enfants.
 * Les sommes sont celles réglées dans l'année (date du règlement), adhésion exclue.
 */
export function attestationsAnnee(etats, annee, mode = 'paiement') {
  const { families, children, payments, dernier } = fusion(etats);
  const du = `${annee}-01-01`, au = `${annee}-12-31`;
  const parFamille = new Map();
  const fam = (id) => {
    if (!parFamille.has(id)) parFamille.set(id, { enfants: new Map(), nonAffecte: 0 });
    return parFamille.get(id);
  };
  for (const p of payments) {
    if (!p.date || p.date < du || p.date > au || !families[p.familyId]) continue;
    const afs = p.affectations && p.affectations.length ? p.affectations : [{ poste: 'a-repartir', montant: p.montant, childId: p.childId }];
    for (const af of afs) {
      if (af.poste === 'adhesion') continue;
      const cid = af.childId || p.childId || '';
      const m = Number(af.montant) || 0;
      if (!cid || !children[cid] || af.poste === 'a-repartir') { fam(p.familyId).nonAffecte = round2(fam(p.familyId).nonAffecte + m); continue; }
      if (mode === 'impots' && !moinsDe6Ans(children[cid].naissance, annee)) continue;
      const f = fam(p.familyId);
      f.enfants.set(cid, round2((f.enfants.get(cid) || 0) + m));
    }
  }
  const st = { ...dernier, families, children };
  const out = [];
  for (const [familyId, x] of parFamille) {
    const enfants = [...x.enfants.entries()].filter(([, m]) => m > 0).map(([childId, montant]) => {
      const c = children[childId];
      return { childId, prenom: c.prenom, nom: nomEnfant(st, c), naissance: c.naissance || '', montant };
    }).sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'));
    if (!enfants.length) continue;
    const f = families[familyId];
    out.push({
      familyId, nom: f.nom, payeur: f.nomCheque || f.nom, adresse: f.adresse || '', mails: f.mails || '',
      enfants, total: round2(enfants.reduce((t, e) => t + e.montant, 0)),
      nonAffecte: mode === 'impots' ? 0 : x.nonAffecte,
    });
  }
  return out.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

// Texte de l'attestation (pour l'aperçu et l'impression).
export function texteAttestation(params, a, annee, mode) {
  const at = params.attestation || {};
  const asso = `l'association « Jeunes de Saint Médard »${at.adresseAsso ? `, ${at.adresseAsso}` : ''}`;
  const hab = at.habilitation ? ` (habilité sous le numéro ${at.habilitation})` : '';
  const liste = a.enfants.map((e) => `${e.prenom} ${e.nom}${e.naissance ? `, né(e) le ${dateFr(e.naissance)}` : ''}`).join(' ; ');
  if (mode === 'impots') {
    return `Je soussigné(e) ${at.tresorier || '…'}, trésorier de ${asso}, certifie que ${a.payeur} a réglé, du 1er janvier au 31 décembre ${annee}, des frais de garde pour ${a.enfants.length > 1 ? 'ses enfants' : 'son enfant'} ${liste}, accueilli${a.enfants.length > 1 ? 's' : ''} à l'accueil de loisirs sans hébergement${hab}. Ces sommes ne comprennent ni l'adhésion à l'association ni de frais de repas.`;
  }
  return `Je soussigné(e) ${at.tresorier || '…'}, trésorier de ${asso}, certifie que ${a.payeur} a réglé, du 1er janvier au 31 décembre ${annee}, les sommes ci-dessous pour la participation de ${a.enfants.length > 1 ? 'ses enfants' : 'son enfant'} aux activités de l'accueil de loisirs sans hébergement${hab}. L'adhésion à l'association n'est pas comprise.`;
}
