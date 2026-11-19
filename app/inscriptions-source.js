// Lecture des pré-inscriptions : Tally en direct (API) et/ou dossier d'exports CSV.
import { fusionnerExports, estExportInscriptions } from '../src/core/preinscriptions.js';
import { parseCsv } from '../src/core/familles-fichier.js';
import { tallyVersLignes } from '../src/core/tally-api.js';

export async function lireSources(bridge) {
  const r = await bridge.preLire();
  const files = (r.files || []).map((f) => ({ ...f, rows: f.rows || parseCsv(f.text || '') })).filter((f) => estExportInscriptions(f.rows));
  // Tally en direct passe en premier : ses liens de pièces jointes sont les plus frais.
  if (r.tally) files.push({ nom: 'Tally (en direct)', mtime: Date.now() + 1, rows: tallyVersLignes(r.tally.questions, r.tally.submissions) });
  return { source: r.source || null, tally: !!r.tally, tallyErreur: r.tallyErreur || null, nbExports: files.filter((f) => f.text !== undefined || f.nom !== 'Tally (en direct)').length, recs: fusionnerExports(files) };
}

// Nombre d'inscriptions ni validées ni refusées.
export function nbNouvelles(state, recs) {
  return recs.filter((r) => !(state.preinscriptions || {})[r.cle]).length;
}

export function majBadge(n) {
  const a = document.querySelector('nav a[data-id="preinscriptions"]');
  if (a) a.textContent = n ? `Pré-inscriptions (${n})` : 'Pré-inscriptions';
}
