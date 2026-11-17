// Carte : où habitent les familles, par code postal et par école.
import { h, fill, table, debounce } from '../ui.js';
import { carte } from '../../src/core/reports.js';

export function render(root, ctx) {
  let q = '';
  const body = h('div');
  const draw = () => {
    const c = carte(ctx.store.get());
    const liens = c.liens.filter((l) => !q || `${l.nom} ${l.adresse}`.toLowerCase().includes(q));
    fill(body,
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' } },
        h('div', {}, h('h2', {}, 'Par code postal'), table([{ key: 'cp', label: 'Code postal', get: (r) => r.cp }, { key: 'n', label: 'Enfants', class: 'num', get: (r) => r.n }], c.parCodePostal, { sortKey: 'n', sortDir: -1 })),
        h('div', {}, h('h2', {}, 'Par école'), table([{ key: 'ecole', label: 'École', get: (r) => r.ecole }, { key: 'n', label: 'Enfants', class: 'num', get: (r) => r.n }], c.parEcole, { sortKey: 'n', sortDir: -1 }))),
      h('h2', {}, 'Adresses'),
      h('input', { type: 'search', placeholder: 'Filtrer…', value: q, oninput: debounce((e) => { q = e.target.value.toLowerCase(); draw(); }, 200), style: { marginBottom: '8px' } }),
      table([
        { key: 'nom', label: 'Enfant', get: (r) => r.nom },
        { key: 'adresse', label: 'Adresse', get: (r) => r.adresse },
        { key: 'lien', label: '', get: () => '', render: (r) => h('button', { class: 'link', onclick: () => ctx.bridge.openExternal(r.url) }, 'Voir sur la carte') },
      ], liens, { sortKey: 'nom', sortDir: 1 }));
  };
  root.append(h('header', { class: 'screen-head' }, h('h1', {}, 'Carte')), body);
  draw();
}
