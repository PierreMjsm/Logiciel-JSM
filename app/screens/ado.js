// ADO : soirées collégiens (dates + présences), même grille que les autres activités.
import { render as renderGrid } from './presences.js';

export function render(root, ctx) {
  const cleanup = renderGrid(root, { ...ctx, params: { ...ctx.params, activity: 'ado' } });
  const h1 = root.querySelector('h1');
  if (h1) h1.textContent = 'ADO — soirées collégiens';
  return cleanup;
}
