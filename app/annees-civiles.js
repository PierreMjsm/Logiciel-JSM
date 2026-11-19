// Années scolaires disponibles (l'année ouverte + les précédentes, en lecture seule),
// pour les calculs en année civile : déclaration CAF et attestations.
import { applyOps, sortOps } from '../src/core/store.js';

export async function etatsDisponibles(ctx, max = 3) {
  const cur = ctx.store.get();
  const etats = [{ label: cur.year, state: cur }];
  const manquants = [];
  let list = [];
  try { list = (await ctx.bridge.years()) || []; } catch { list = []; }
  for (const y of list.slice(0, max)) {
    try {
      const r = await ctx.bridge.lireAnnee(y.dossier);
      if (r && r.base) etats.push({ label: y.label, state: applyOps(r.base, sortOps(r.ops || [])) });
    } catch { manquants.push(y.label); }
  }
  return { etats, manquants };
}

// Années civiles couvertes par des années scolaires « 2025-2026 » → [2025, 2026].
export function anneesCiviles(etats) {
  const ys = new Set();
  for (const { label } of etats) for (const m of String(label || '').match(/\d{4}/g) || []) ys.add(Number(m));
  return [...ys].sort((a, b) => b - a);
}
