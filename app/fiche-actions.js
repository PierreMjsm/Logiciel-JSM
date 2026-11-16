// Création des fiches PDF et rangement des pièces jointes dans le dossier de l'enfant.
import { toast, todayIso, modal, h, select } from './ui.js';
import { valeursFiche, signatureImage } from '../src/core/fiche-pdf.js';
import { dossierEnfant, nomEnfant } from '../src/core/noms.js';

export function ficheParDefaut(state) {
  const all = state.params.fichesPdf || {};
  const id = state.params.fichePdfDefaut && all[state.params.fichePdfDefaut] ? state.params.fichePdfDefaut : Object.keys(all)[0];
  return id ? { id, ...all[id] } : null;
}

// nouvelle : fiche d'une nouvelle inscription, à (ré)imprimer ; sinon une fiche déjà imprimée le reste.
export async function genererFiche(ctx, childId, { ouvrir = false, modele = null, nouvelle = false } = {}) {
  const s = ctx.store.get();
  const m = modele || ficheParDefaut(s);
  if (!m) { toast('Aucune fiche PDF : ajoutez-en une dans Paramètres › Fiches PDF.', 'warn'); return null; }
  const p = await ctx.bridge.ficheGenerer({
    fichier: m.fichier, valeurs: valeursFiche(s, childId, m.correspondance || {}), signatureUrl: signatureImage(s, childId),
    dossier: dossierEnfant(s, childId), nomFichier: m.nom || 'Fiche', ouvrir,
  });
  const avant = ((s.children[childId] || {}).fichesPdf || {})[m.id];
  if (p && !ctx.store.getConsultation()) await ctx.store.dispatch(['children', childId, 'fichesPdf', m.id], { creee: todayIso(), imprimee: nouvelle ? null : (avant && avant.imprimee) || null });
  return p;
}

// Fiches créées mais pas encore imprimées, pour un modèle.
export function fichesAImprimer(state, modeleId) {
  return Object.entries(state.children).filter(([, c]) => { const f = (c.fichesPdf || {})[modeleId]; return f && f.creee && !f.imprimee; }).map(([id]) => id);
}

// Réunit les fiches à imprimer en un seul PDF (ouvert pour l'impression), puis demande s'il faut les marquer imprimées.
export function imprimerFichesEnAttente(ctx, modeleId, apres = () => {}) {
  const s = ctx.store.get();
  const m = (s.params.fichesPdf || {})[modeleId];
  const n = fichesAImprimer(s, modeleId).length;
  if (!m || !n) { toast('Aucune fiche en attente d\'impression.'); return; }
  let ordre = 'nom';
  try { ordre = localStorage.getItem('jsm.fiches.ordre') || 'nom'; } catch { /* stockage indisponible */ }
  modal(`Imprimer ${n} fiche(s) « ${m.nom} »`, h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Ordre des fiches'),
    select([['nom', 'Ordre alphabétique (nom, prénom)'], ['ecole', 'Par école, puis nom']], ordre, { name: 'ordre', onchange: (e) => { ordre = e.target.value; } })), [
    { label: 'Annuler' },
    { label: 'Imprimer', primary: true, onClick: () => {
      try { localStorage.setItem('jsm.fiches.ordre', ordre); } catch { /* ignoré */ }
      setTimeout(() => lancerImpression(ctx, modeleId, ordre, apres), 0);
    } },
  ]);
}

async function lancerImpression(ctx, modeleId, ordre, apres) {
  const s = ctx.store.get();
  const m = (s.params.fichesPdf || {})[modeleId];
  const cle = (id) => { const c = s.children[id]; return `${ordre === 'ecole' ? `${c.ecole || '~'}|` : ''}${nomEnfant(s, c)}|${c.prenom || ''}`; };
  const ids = fichesAImprimer(s, modeleId).sort((a, b) => cle(a).localeCompare(cle(b), 'fr'));
  const r = await ctx.bridge.ficheImprimerLot(ids.map((id) => ({ dossier: dossierEnfant(s, id), nomFichier: m.nom || 'Fiche' })));
  const ok = r.trouvees.map((i) => ids[i]);
  if (r.manquantes.length) toast(`${r.manquantes.length} fiche(s) introuvable(s) dans les dossiers : recréez-les avec « Fiche PDF ».`, 'warn');
  if (!ok.length) return;
  modal('Impression des fiches', h('p', {}, `${ok.length} fiche(s) « ${m.nom} » réunies dans un seul PDF, ouvert pour l'impression. Une fois imprimées, marquez-les pour ne pas les réimprimer la prochaine fois.`), [
    { label: 'Pas encore' },
    { label: 'Oui, marquer imprimées', primary: true, onClick: async () => {
      const today = todayIso();
      await ctx.store.dispatchMany(ok.map((id) => [['children', id, 'fichesPdf', modeleId, 'imprimee'], today]));
      toast(`${ok.length} fiche(s) marquée(s) imprimée(s).`);
      apres();
    } },
  ]);
}

const PIECES = [['vaccins', 'Vaccins'], ['ayantDroit', 'Attestation ayant droit'], ['photo', 'Photo']];

// Télécharge les pièces jointes d'une inscription dans le dossier de l'enfant. Une pièce plus récente que celle déjà
// rangée la remplace (nouvelle année, nouveau fichier envoyé par les parents) ; une plus ancienne est laissée de côté.
export async function rangerPieces(ctx, childId, rec) {
  const s = ctx.store.get();
  const dossier = dossierEnfant(s, childId);
  const deja = (s.children[childId] || {}).pieces || {};
  const date = rec.recueLe || rec.recue || '';
  let n = 0;
  for (const [k, base] of PIECES) {
    const urls = String((rec.liens || {})[k] || '').split(/[\s,]+(?=https?:)/).filter(Boolean);
    if (!urls.length || (deja[k] && deja[k] > date)) continue;
    let ok = 0;
    for (const [i, url] of urls.entries()) {
      try { await ctx.bridge.dossierTelecharger({ url, dossier, base, remplacer: i === 0 }); ok += 1; } catch (e) { toast(`${base} : ${e.message || e}`, 'err'); }
    }
    if (ok) { n += ok; await ctx.store.dispatch(['children', childId, 'pieces', k], date); }
  }
  return n;
}
